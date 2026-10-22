import { describe, expect, it } from "vitest";
import { seededContext } from "./helpers";
import { runDailyChecks, runWorkflow } from "@/lib/workflows/engine";
import { setDealStage, createTask } from "@/lib/crm/mutations";
import { validateWorkflowDefinition, workflowDefinitionSchema } from "@/lib/workflows/schema";
import { newId, nowIso } from "@/lib/db";
import type { WorkflowRow } from "@/lib/db/types";

function staleWorkflow(ctx: ReturnType<typeof seededContext>): WorkflowRow {
  return ctx.db
    .prepare("SELECT * FROM workflow_definitions WHERE workspace_id = ? AND name = 'Stale lead follow-up'")
    .get(ctx.workspace.id) as WorkflowRow;
}

function taskCount(ctx: ReturnType<typeof seededContext>): number {
  return (ctx.db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE workspace_id = ?").get(ctx.workspace.id) as { c: number }).c;
}

function notificationCount(ctx: ReturnType<typeof seededContext>): number {
  return (
    ctx.db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE workspace_id = ?").get(ctx.workspace.id) as {
      c: number;
    }
  ).c;
}

describe("workflow engine", () => {
  it("flags stale leads and creates follow-up tasks", () => {
    const ctx = seededContext();
    const before = taskCount(ctx);
    const results = runDailyChecks({ db: ctx.db, workspaceId: ctx.workspace.id, actorId: ctx.user.id });
    expect(results).toHaveLength(1);
    const run = results[0]!;
    expect(run.status).toBe("success");
    expect(run.matched).toBeGreaterThan(0);
    expect(run.counts.tasks).toBeGreaterThan(0);
    expect(taskCount(ctx)).toBeGreaterThan(before);

    const flagged = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM leads WHERE workspace_id = ? AND flagged = 1")
      .get(ctx.workspace.id) as { c: number };
    expect(flagged.c).toBeGreaterThan(0);

    const logged = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM workflow_runs WHERE workflow_id = ?")
      .get(run.workflowId) as { c: number };
    expect(logged.c).toBeGreaterThanOrEqual(2); // seeded history + this run
  });

  it("prevents duplicate runs and duplicate actions on the same day", () => {
    const ctx = seededContext();
    const workflow = staleWorkflow(ctx);
    const first = runWorkflow({
      db: db(ctx),
      workflow,
      trigger: "daily_check",
      actorId: ctx.user.id,
    });
    expect(first.status).toBe("success");
    const tasksAfterFirst = taskCount(ctx);

    const second = runWorkflow({
      db: db(ctx),
      workflow,
      trigger: "daily_check",
      actorId: ctx.user.id,
    });
    expect(second.status).toBe("skipped");
    expect(taskCount(ctx)).toBe(tasksAfterFirst);

    // Even bypassing run-level dedupe, action-level idempotency holds.
    const third = runWorkflow({
      db: db(ctx),
      workflow,
      trigger: "daily_check",
      actorId: ctx.user.id,
      dedupe: false,
    });
    expect(third.counts.tasks).toBe(0);
    expect(taskCount(ctx)).toBe(tasksAfterFirst);
  });

  it("rejects actors outside the workspace", () => {
    const ctx = seededContext();
    const workflow = staleWorkflow(ctx);
    const result = runWorkflow({
      db: db(ctx),
      workflow,
      trigger: "daily_check",
      actorId: "user_not_a_member",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("not a member");
  });

  it("fires stage-change workflows from a real CRM mutation", () => {
    const ctx = seededContext();
    const definition = workflowDefinitionSchema.parse({
      schemaVersion: 1,
      name: "Negotiation alert (test)",
      description: "Notify the owner when a deal reaches negotiation.",
      trigger: { type: "deal_stage_changed", entity: "deal" },
      conditions: [{ type: "field_equals", field: "stage", value: "negotiation" }],
      actions: [{ type: "notify", title: "Deal reached negotiation", body: "{{name}} moved." }],
    });
    ctx.db.prepare(
      `INSERT INTO workflow_definitions (id, workspace_id, name, description, enabled, definition, trigger_type, created_by, created_at, updated_at, last_run_at)
       VALUES (?, ?, ?, ?, 1, ?, 'deal_stage_changed', ?, ?, ?, NULL)`,
    ).run(
      newId(),
      ctx.workspace.id,
      definition.name,
      definition.description,
      JSON.stringify(definition),
      ctx.user.id,
      nowIso(),
      nowIso(),
    );

    const deal = ctx.db
      .prepare("SELECT id FROM deals WHERE workspace_id = ? AND stage = 'proposal' LIMIT 1")
      .get(ctx.workspace.id) as { id: string } | undefined;
    expect(deal).toBeTruthy();
    const before = notificationCount(ctx);

    const result = setDealStage(
      { db: ctx.db, workspaceId: ctx.workspace.id, userId: ctx.user.id },
      deal!.id,
      "negotiation",
    );
    expect(result.ok).toBe(true);
    expect(result.workflowRuns).toBeGreaterThan(0);
    expect(notificationCount(ctx)).toBeGreaterThan(before);

    const run = ctx.db
      .prepare("SELECT status, matched FROM workflow_runs WHERE workspace_id = ? AND trigger_type = 'deal_stage_changed' ORDER BY created_at DESC LIMIT 1")
      .get(ctx.workspace.id) as { status: string; matched: number };
    expect(run.matched).toBe(1);
  });

  it("runs a manual test without writing anything", () => {
    const ctx = seededContext();
    const workflow = staleWorkflow(ctx);
    const tasksBefore = taskCount(ctx);
    const result = runWorkflow({
      db: db(ctx),
      workflow,
      trigger: "daily_check",
      actorId: ctx.user.id,
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.matched).toBeGreaterThan(0);
    expect(result.logs[0]?.actions.every((action) => action.startsWith("would"))).toBe(true);
    expect(taskCount(ctx)).toBe(tasksBefore);
  });

  it("validates workflow definitions against the allowlist", () => {
    const ok = validateWorkflowDefinition({
      schemaVersion: 1,
      name: "Valid rule",
      description: "",
      trigger: { type: "daily_check", entity: "lead" },
      conditions: [{ type: "days_since_contact_gte", value: 7 }],
      actions: [{ type: "flag_record", reason: "Stale" }],
    });
    expect(ok.ok).toBe(true);

    const writeBlockedField = validateWorkflowDefinition({
      schemaVersion: 1,
      name: "Illegal write",
      description: "",
      trigger: { type: "record_updated", entity: "lead" },
      conditions: [],
      actions: [{ type: "update_field", field: "email", value: "x@y.com" }],
    });
    expect(writeBlockedField.ok).toBe(false);
    expect(writeBlockedField.issues.join(" ")).toContain("not a writable field");

    const wrongEntity = validateWorkflowDefinition({
      schemaVersion: 1,
      name: "Wrong condition",
      description: "",
      trigger: { type: "daily_check", entity: "deal" },
      conditions: [{ type: "days_since_contact_gte", value: 7 }],
      actions: [{ type: "flag_record", reason: "x" }],
    });
    expect(wrongEntity.ok).toBe(false);

    const badValue = validateWorkflowDefinition({
      schemaVersion: 1,
      name: "Bad enum",
      description: "",
      trigger: { type: "daily_check", entity: "lead" },
      conditions: [{ type: "field_equals", field: "status", value: "vip" }],
      actions: [{ type: "flag_record", reason: "x" }],
    });
    expect(badValue.ok).toBe(false);
  });

  it("does not duplicate actions across repeated runs", () => {
    const ctx = seededContext();
    const workflow = staleWorkflow(ctx);
    const first = runWorkflow({ db: db(ctx), workflow, trigger: "daily_check", actorId: ctx.user.id, dedupe: false });
    expect(first.counts.tasks).toBeGreaterThan(0);
    const tasksAfterFirst = taskCount(ctx);

    const second = runWorkflow({ db: db(ctx), workflow, trigger: "daily_check", actorId: ctx.user.id, dedupe: false });
    expect(second.counts.tasks).toBe(0);
    expect(second.counts.flags).toBe(0);
    expect(taskCount(ctx)).toBe(tasksAfterFirst);
  });
});

function db(ctx: ReturnType<typeof seededContext>) {
  return ctx.db;
}

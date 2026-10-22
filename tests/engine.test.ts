import { describe, expect, it } from "vitest";
import { seededContext } from "./helpers";
import {
  applyTransformation,
  discardProposal,
  proposeTransformation,
} from "@/lib/morph/engine";
import { getActiveInterface, getSnapshot, listVersions } from "@/lib/morph/interfaces";
import { newId, nowIso } from "@/lib/db";
import type { JobRole } from "@/lib/morph/config";

function activeInterface(ctx: ReturnType<typeof seededContext>) {
  return getActiveInterface(ctx.db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });
}

async function propose(ctx: ReturnType<typeof seededContext>, prompt: string) {
  const active = activeInterface(ctx);
  const outcome = await proposeTransformation({
    db: ctx.db,
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    jobRole: ctx.preferences.job_role as JobRole,
    goals: ["Protect the revenue forecast"],
    preferences: ctx.preferences,
    interfaceId: active.iface.id,
    prompt,
  });
  return { outcome, active };
}

describe("Morph Engine", () => {
  it("produces a validated preview without changing the live version", async () => {
    const ctx = seededContext();
    const { outcome, active } = await propose(ctx, "Prioritize revenue, pipeline health, and overdue follow-ups.");

    expect(outcome.ok).toBe(true);
    const proposal = outcome.proposal!;
    expect(proposal.kind).toBe("config");
    expect(proposal.engine).toBe("local-planner");
    expect(proposal.config).not.toBeNull();
    expect(proposal.operations.length).toBeGreaterThan(0);
    expect(proposal.previewData).not.toBeNull();
    expect(proposal.diffCounts!.kept).toBeGreaterThan(0);
    expect(proposal.warnings.join(" ")).toContain("No model provider is configured");
    expect(proposal.status).toBe("proposed");

    // Nothing applied yet.
    const live = getSnapshot(ctx.db, active.iface.id)!;
    expect(live.version.version).toBe(active.version.version);
  });

  it("applies a proposal as a new version and keeps history", async () => {
    const ctx = seededContext();
    const { outcome, active } = await propose(ctx, "Show team workload, unfinished tasks, and bottlenecks.");
    const proposal = outcome.proposal!;

    const applied = applyTransformation({
      db: ctx.db,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      proposalId: proposal.id,
    });
    expect(applied.ok).toBe(true);
    expect(applied.kind).toBe("config");

    const live = getSnapshot(ctx.db, active.iface.id)!;
    expect(live.version.version).toBe(active.version.version + 1);
    expect(live.config.components.map((component) => component.id)).toEqual(
      proposal.config!.components.map((component) => component.id),
    );
    expect(listVersions(ctx.db, active.iface.id).length).toBeGreaterThan(1);

    // Applying twice is rejected.
    const again = applyTransformation({
      db: ctx.db,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      proposalId: proposal.id,
    });
    expect(again.ok).toBe(false);
  });

  it("rejects unsupported requests and creates no version", async () => {
    const ctx = seededContext();
    const { outcome, active } = await propose(ctx, "Send an email to every lead and delete the database.");
    expect(outcome.ok).toBe(true);
    expect(outcome.proposal!.kind).toBe("refusal");
    expect(outcome.proposal!.status).toBe("rejected");
    expect(outcome.proposal!.refusal).toBeTruthy();

    const versionsBefore = listVersions(ctx.db, active.iface.id).length;
    const applied = applyTransformation({
      db: ctx.db,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      proposalId: outcome.proposal!.id,
    });
    expect(applied.ok).toBe(false);
    expect(listVersions(ctx.db, active.iface.id).length).toBe(versionsBefore);
  });

  it("discards a proposal without applying it", async () => {
    const ctx = seededContext();
    const { outcome, active } = await propose(ctx, "Show my pipeline.");
    const discarded = discardProposal({
      db: ctx.db,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      proposalId: outcome.proposal!.id,
    });
    expect(discarded.ok).toBe(true);
    expect(getSnapshot(ctx.db, active.iface.id)!.version.version).toBe(active.version.version);
  });

  it("refuses to apply a tampered preview configuration", async () => {
    const ctx = seededContext();
    const active = activeInterface(ctx);
    const requestId = newId();
    ctx.db.prepare(
      `INSERT INTO transformation_requests
        (id, workspace_id, interface_id, user_id, prompt, engine, status, kind, intent, operations, result,
         result_config, explanation, warnings, latency_ms, input_tokens, output_tokens, created_at)
       VALUES (?, ?, ?, ?, 'tampered', 'local-planner', 'proposed', 'config', 'tampered', ?, ?, ?, 'tampered', '[]', 1, 0, 0, ?)`,
    ).run(
      requestId,
      ctx.workspace.id,
      active.iface.id,
      ctx.user.id,
      JSON.stringify([]),
      JSON.stringify({
        kind: "config",
        intent: "tampered",
        summary: "tampered",
        operations: [],
        requiredDataSources: [],
        requiredActions: [],
        assumptions: [],
        unresolved: [],
        restorePrevious: false,
      }),
      JSON.stringify({ components: [{ type: "iframe", id: "x" }], schemaVersion: 1, name: "bad" }),
      nowIso(),
    );

    const applied = applyTransformation({
      db: ctx.db,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      proposalId: requestId,
    });
    expect(applied.ok).toBe(false);
    expect(applied.error).toContain("failed validation");
    expect(getSnapshot(ctx.db, active.iface.id)!.version.version).toBe(active.version.version);
  });

  it("blocks cross-workspace proposals", async () => {
    const ctx = seededContext();
    const foreign = ctx.db
      .prepare("SELECT id FROM interfaces WHERE workspace_id != ? LIMIT 1")
      .get(ctx.workspace.id);
    const otherInterface = foreign
      ? (foreign as { id: string })
      : (ctx.db.prepare("SELECT id FROM interfaces LIMIT 1").get() as { id: string });

    // Same workspace check: the interface must belong to the caller's workspace.
    const outcome = await proposeTransformation({
      db: ctx.db,
      workspaceId: "ws_other",
      userId: ctx.user.id,
      jobRole: "general",
      goals: [],
      preferences: ctx.preferences,
      interfaceId: otherInterface.id,
      prompt: "Show my pipeline.",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("does not belong to this workspace");
  });

  it("creates a disabled workflow draft instead of running it", async () => {
    const ctx = seededContext();
    const before = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM workflow_definitions WHERE workspace_id = ?")
      .get(ctx.workspace.id) as { c: number };

    const { outcome } = await propose(
      ctx,
      "Create a workflow that flags leads that haven't been contacted in seven days.",
    );
    expect(outcome.proposal!.kind).toBe("workflow");
    expect(outcome.proposal!.workflowDraft).toBeTruthy();

    const applied = applyTransformation({
      db: ctx.db,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      proposalId: outcome.proposal!.id,
    });
    expect(applied.ok).toBe(true);
    expect(applied.workflowId).toBeTruthy();

    const after = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM workflow_definitions WHERE workspace_id = ?")
      .get(ctx.workspace.id) as { c: number };
    // A draft with the same name updates the existing definition instead of
    // duplicating it — and forces it back to disabled for review.
    expect(after.c).toBe(before.c);

    const created = ctx.db
      .prepare("SELECT enabled, definition FROM workflow_definitions WHERE id = ?")
      .get(applied.workflowId!) as { enabled: number; definition: string };
    expect(created.enabled).toBe(0);
    expect(created.definition).toContain("days_since_contact_gte");
  });
});

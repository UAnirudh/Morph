/**
 * Workflow execution.
 *
 * Every run is workspace-scoped, authorization-checked, idempotent and logged.
 * Actions are limited to the allowlist in schema.ts — there is no code
 * execution, no shell, no arbitrary HTTP.
 */
import type { Db, SqlArg } from "@/lib/db";
import { newId, nowIso } from "@/lib/db";
import type { WorkflowRow } from "@/lib/db/types";
import { logError, logEvent } from "@/lib/log";
import {
  WRITABLE_FIELDS,
  workflowDefinitionSchema,
  type TriggerType,
  type WorkflowAction,
  type WorkflowCondition,
  type WorkflowDefinition,
  type WorkflowEntity,
} from "./schema";

const DAY = 86_400_000;
const MAX_RECORDS = 500;

export interface RunLogEntry {
  recordId: string;
  recordLabel: string;
  actions: string[];
  note?: string;
}

export interface WorkflowRunResult {
  workflowId: string;
  workflowName: string;
  status: "success" | "partial" | "failed" | "skipped";
  matched: number;
  dryRun: boolean;
  counts: { tasks: number; updates: number; flags: number; notifications: number; skipped: number };
  logs: RunLogEntry[];
  error?: string;
  durationMs: number;
  runId?: string;
}

interface NormalizedRecord {
  id: string;
  entity: WorkflowEntity;
  label: string;
  ownerId: string | null;
  assigneeId: string | null;
  values: Record<string, string | number | boolean | null>;
  lastContactedAt: string | null;
  updatedAt: string | null;
  dueDate: string | null;
  flagged: boolean;
}

async function isMember(db: Db, workspaceId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const row = await db
    .prepare("SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(workspaceId, userId) as { ok: number } | undefined;
  return Boolean(row);
}

async function loadRecords(
  db: Db,
  workspaceId: string,
  definition: WorkflowDefinition,
  recordIds?: string[],
): Promise<NormalizedRecord[]> {
  const entity = definition.trigger.entity;
  const filterByIds =
    recordIds && recordIds.length > 0
      ? ` AND id IN (${recordIds.map(() => "?").join(",")})`
      : "";
  const params: unknown[] = [workspaceId, ...(recordIds ?? [])];

  if (entity === "lead") {
    const rows = await db
      .prepare(
        `SELECT id, name, company, status, score, source, owner_id, last_contacted_at, updated_at, flagged
         FROM leads WHERE workspace_id = ?${filterByIds} ORDER BY updated_at DESC LIMIT ${MAX_RECORDS}`,
      )
      .all(...(params as SqlArg[])) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      entity,
      label: `${row.name} (${row.company})`,
      ownerId: (row.owner_id as string | null) ?? null,
      assigneeId: null,
      values: {
        status: row.status as string,
        score: Number(row.score ?? 0),
        source: row.source as string,
        flagged: row.flagged === 1,
      },
      lastContactedAt: (row.last_contacted_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
      dueDate: null,
      flagged: row.flagged === 1,
    }));
  }
  if (entity === "deal") {
    const rows = await db
      .prepare(
        `SELECT id, name, stage, amount, probability, owner_id, updated_at
         FROM deals WHERE workspace_id = ?${filterByIds} ORDER BY updated_at DESC LIMIT ${MAX_RECORDS}`,
      )
      .all(...(params as SqlArg[])) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      entity,
      label: String(row.name),
      ownerId: (row.owner_id as string | null) ?? null,
      assigneeId: null,
      values: {
        stage: row.stage as string,
        amount: Number(row.amount ?? 0),
        probability: Number(row.probability ?? 0),
      },
      lastContactedAt: null,
      updatedAt: (row.updated_at as string | null) ?? null,
      dueDate: null,
      flagged: false,
    }));
  }
  const rows = await db
    .prepare(
      `SELECT id, title, status, priority, assignee_id, due_date, created_at
       FROM tasks WHERE workspace_id = ?${filterByIds} ORDER BY due_date ASC LIMIT ${MAX_RECORDS}`,
    )
    .all(...(params as SqlArg[])) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    entity,
    label: String(row.title),
    ownerId: (row.assignee_id as string | null) ?? null,
    assigneeId: (row.assignee_id as string | null) ?? null,
    values: {
      status: row.status as string,
      priority: row.priority as string,
    },
    lastContactedAt: null,
    updatedAt: (row.created_at as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    flagged: false,
  }));
}

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

export function evaluateCondition(
  condition: WorkflowCondition,
  record: NormalizedRecord,
  workflow: WorkflowRow,
  now: Date,
): boolean {
  switch (condition.type) {
    case "field_equals":
      return String(record.values[condition.field] ?? "") === condition.value;
    case "field_gte":
      return Number(record.values[condition.field] ?? 0) >= condition.value;
    case "field_lte":
      return Number(record.values[condition.field] ?? 0) <= condition.value;
    case "days_since_contact_gte": {
      const days = daysSince(record.lastContactedAt, now);
      // A lead that has never been contacted is the stalest possible case.
      return days === null || days >= condition.value;
    }
    case "days_since_update_gte": {
      const days = daysSince(record.updatedAt, now);
      return days !== null && days >= condition.value;
    }
    case "assigned_to_owner":
      return record.ownerId === workflow.created_by;
    case "overdue_task":
      return (
        record.dueDate !== null &&
        new Date(record.dueDate).getTime() < now.getTime() &&
        record.values.status !== "done"
      );
    case "flagged":
      return record.flagged === condition.value;
    default:
      return false;
  }
}

export function matchesWorkflow(
  definition: WorkflowDefinition,
  record: NormalizedRecord,
  workflow: WorkflowRow,
  now: Date,
): boolean {
  return definition.conditions.every((condition) => evaluateCondition(condition, record, workflow, now));
}

function interpolate(template: string, record: NormalizedRecord): string {
  const [namePart] = record.label.split(" (");
  const company = record.label.includes("(") ? record.label.split("(")[1]?.replace(")", "") ?? "" : "";
  return template
    .replace(/\{\{name\}\}/g, namePart?.trim() ?? record.label)
    .replace(/\{\{company\}\}/g, company.trim())
    .replace(/\{\{title\}\}/g, record.label)
    .slice(0, 160);
}

async function resolveAssignee(
  db: Db,
  workspaceId: string,
  mode: "owner" | "record_owner" | "me",
  record: NormalizedRecord,
  workflow: WorkflowRow,
  actorId: string,
): Promise<string | null> {
  const candidates: Array<string | null> =
    mode === "me" ? [actorId] : mode === "record_owner" ? [record.ownerId, workflow.created_by, actorId] : [workflow.created_by, actorId];
  for (const candidate of candidates) {
    if (await isMember(db, workspaceId, candidate)) return candidate;
  }
  return null;
}

async function logActivity(
  db: Db,
  workspaceId: string,
  record: NormalizedRecord,
  actorId: string,
  subject: string,
) {
  await db.prepare(
    `INSERT INTO activities (id, workspace_id, kind, subject, body, lead_id, deal_id, contact_id, actor_id, created_at)
     VALUES (?, ?, 'workflow', ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    newId(),
    workspaceId,
    subject.slice(0, 160),
    "Created by a Morph workflow.",
    record.entity === "lead" ? record.id : null,
    record.entity === "deal" ? record.id : null,
    actorId,
    nowIso(),
  );
}

async function executeAction(
  db: Db,
  params: {
    workspaceId: string;
    workflow: WorkflowRow;
    record: NormalizedRecord;
    action: WorkflowAction;
    actorId: string;
    now: Date;
    depth?: number;
  },
): Promise<{ applied: boolean; kind: keyof WorkflowRunResult["counts"] | null; note?: string }> {
  const { workspaceId, workflow, record, action, actorId, now, depth = 0 } = params;

  switch (action.type) {
    case "create_task": {
      const title = interpolate(action.title, record);
      // Idempotency: do not create the same open follow-up twice.
      const duplicate = await db
        .prepare(
          `SELECT id FROM tasks WHERE workspace_id = ? AND related_id = ? AND title = ? AND status != 'done' LIMIT 1`,
        )
        .get(workspaceId, record.id, title) as { id: string } | undefined;
      if (duplicate) return { applied: false, kind: "skipped", note: "Follow-up task already open" };

      const assignee = await resolveAssignee(db, workspaceId, action.assignTo, record, workflow, actorId);
      const due = new Date(now.getTime() + action.dueInDays * DAY).toISOString();
      await db.prepare(
        `INSERT INTO tasks (id, workspace_id, title, notes, status, priority, due_date, assignee_id, related_type, related_id, created_by, created_at, completed_at)
         VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        newId(),
        workspaceId,
        title,
        `Created by the “${workflow.name}” workflow.`,
        action.priority,
        due,
        assignee,
        record.entity,
        record.id,
        actorId,
        nowIso(),
      );
      return { applied: true, kind: "tasks" };
    }
    case "update_field": {
      const writable = WRITABLE_FIELDS[record.entity] as readonly string[];
      if (!writable.includes(action.field)) {
        return { applied: false, kind: "skipped", note: `Field ${action.field} is not writable` };
      }
      const value = action.value;
      const current = record.values[action.field];
      if (String(current) === String(value)) {
        return { applied: false, kind: "skipped", note: `Already ${String(value)}` };
      }
      const table = record.entity === "lead" ? "leads" : record.entity === "deal" ? "deals" : "tasks";
      const column = action.field;
      await db.prepare(`UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`).run(
        value,
        nowIso(),
        record.id,
        workspaceId,
      );
      if (record.entity === "lead") {
        logActivity(
          db,
          workspaceId,
          record,
          actorId,
          `${String(current)} → ${String(value)} (workflow: ${workflow.name})`,
        );
      }
      // A workflow that moves a deal stage can feed stage-change workflows once.
      if (record.entity === "deal" && action.field === "stage" && depth === 0) {
        runWorkflowsForTrigger({
          db,
          workspaceId,
          trigger: "deal_stage_changed",
          recordId: record.id,
          actorId,
          depth: depth + 1,
        });
      }
      return { applied: true, kind: "updates" };
    }
    case "flag_record": {
      if (record.entity !== "lead") {
        return { applied: false, kind: "skipped", note: "Only leads can be flagged" };
      }
      if (record.flagged) {
        return { applied: false, kind: "skipped", note: "Lead already flagged" };
      }
      await db.prepare("UPDATE leads SET flagged = 1, flag_reason = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").run(
        action.reason,
        nowIso(),
        record.id,
        workspaceId,
      );
      await logActivity(db, workspaceId, record, actorId, `Flagged: ${action.reason}`);
      return { applied: true, kind: "flags" };
    }
    case "notify": {
      const recipient = (await isMember(db, workspaceId, record.ownerId))
        ? record.ownerId
        : (await isMember(db, workspaceId, workflow.created_by))
          ? workflow.created_by
          : actorId;
      // Idempotency: one notification per record per day per workflow.
      const since = new Date(now.getTime() - DAY).toISOString();
      const duplicate = await db
        .prepare(
          `SELECT id FROM notifications WHERE workspace_id = ? AND user_id = ? AND title = ? AND created_at >= ? LIMIT 1`,
        )
        .get(workspaceId, recipient, interpolate(action.title, record), since) as { id: string } | undefined;
      if (duplicate) return { applied: false, kind: "skipped", note: "Notification already sent today" };

      await db.prepare(
        `INSERT INTO notifications (id, workspace_id, user_id, title, body, kind, href, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'workflow', '/studio', NULL, ?)`,
      ).run(
        newId(),
        workspaceId,
        recipient,
        interpolate(action.title, record),
        interpolate(action.body, record),
        nowIso(),
      );
      return { applied: true, kind: "notifications" };
    }
    default:
      return { applied: false, kind: "skipped", note: "Unsupported action" };
  }
}

export async function runWorkflow(params: {
  db: Db;
  workflow: WorkflowRow;
  trigger: TriggerType;
  actorId: string;
  recordIds?: string[];
  dryRun?: boolean;
  now?: Date;
  dedupe?: boolean;
  depth?: number;
}): Promise<WorkflowRunResult> {
  const { db, workflow, trigger, actorId, dryRun = false, dedupe = true } = params;
  const now = params.now ?? new Date();
  const started = Date.now();
  const base: WorkflowRunResult = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "skipped",
    matched: 0,
    dryRun,
    counts: { tasks: 0, updates: 0, flags: 0, notifications: 0, skipped: 0 },
    logs: [],
    durationMs: 0,
  };

  if (!(await isMember(db, workflow.workspace_id, actorId))) {
    return { ...base, error: "Actor is not a member of this workspace", status: "failed" };
  }

  const parsed = workflowDefinitionSchema.safeParse(JSON.parse(workflow.definition));
  if (!parsed.success) {
    return { ...base, error: "Stored workflow definition is invalid", status: "failed" };
  }
  const definition = parsed.data;

  const dayBucket = now.toISOString().slice(0, 10);
  const dedupeKey = dedupe ? `${trigger}:${dayBucket}` : null;
  if (dedupeKey) {
    const existing = await db
      .prepare("SELECT id FROM workflow_runs WHERE workflow_id = ? AND dedupe_key = ?")
      .get(workflow.id, dedupeKey) as { id: string } | undefined;
    if (existing) {
      return {
        ...base,
        status: "skipped",
        logs: [
          {
            recordId: "-",
            recordLabel: "-",
            actions: [],
            note: "Already ran for this trigger today — duplicate suppressed",
          },
        ],
        durationMs: Date.now() - started,
      };
    }
  }

  const records = await loadRecords(db, workflow.workspace_id, definition, params.recordIds);
  const matched = records.filter((record) => matchesWorkflow(definition, record, workflow, now));
  base.matched = matched.length;

  if (matched.length === 0) {
    return { ...base, status: "success", logs: [], durationMs: Date.now() - started };
  }

  for (const record of matched) {
    const entry: RunLogEntry = { recordId: record.id, recordLabel: record.label, actions: [] };
    for (const action of definition.actions) {
      if (dryRun) {
        entry.actions.push(`would ${action.type}`);
        continue;
      }
      try {
        const outcome = await executeAction(db, {
          workspaceId: workflow.workspace_id,
          workflow,
          record,
          action,
          actorId,
          now,
          depth: params.depth ?? 0,
        });
        if (outcome.kind) base.counts[outcome.kind] += 1;
        if (outcome.applied) entry.actions.push(action.type);
        if (outcome.note) entry.note = outcome.note;
      } catch (error) {
        logError("workflow.action.failed", error, { workflowId: workflow.id, recordId: record.id });
        entry.note = `Action ${action.type} failed`;
        base.status = "partial";
      }
    }
    base.logs.push(entry);
  }

  const anyApplied =
    base.counts.tasks + base.counts.updates + base.counts.flags + base.counts.notifications > 0;
  if (dryRun) base.status = "success";
  else if (base.status !== "partial") base.status = anyApplied ? "success" : "skipped";

  if (dryRun) {
    return { ...base, durationMs: Date.now() - started };
  }

  const runId = newId();
  try {
    await db.prepare(
      `INSERT INTO workflow_runs (id, workspace_id, workflow_id, trigger_type, status, matched, actions, log, dedupe_key, error, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId,
      workflow.workspace_id,
      workflow.id,
      trigger,
      base.status,
      base.matched,
      JSON.stringify(base.counts),
      JSON.stringify(base.logs),
      dedupeKey,
      base.error ?? null,
      Date.now() - started,
      nowIso(),
    );
    await db.prepare("UPDATE workflow_definitions SET last_run_at = ? WHERE id = ?").run(nowIso(), workflow.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      logEvent("info", {
        event: "workflow.dedupe.skipped",
        workflowId: workflow.id,
        trigger,
      });
      return {
        ...base,
        status: "skipped",
        logs: [{ recordId: "-", recordLabel: "-", actions: [], note: "Already ran for this trigger today" }],
        durationMs: Date.now() - started,
      };
    }
    logError("workflow.run.persist_failed", error, { workflowId: workflow.id });
    return { ...base, status: "failed", error: message };
  }

  logEvent("info", {
    event: "workflow.run",
    workflowId: workflow.id,
    workspaceId: workflow.workspace_id,
    trigger,
    matched: base.matched,
    status: base.status,
    counts: base.counts,
    durationMs: Date.now() - started,
  });

  return { ...base, runId, durationMs: Date.now() - started };
}

/** Called by CRM mutations after a comparable write. */
export async function runWorkflowsForTrigger(params: {
  db: Db;
  workspaceId: string;
  trigger: TriggerType;
  recordId?: string;
  actorId: string;
  depth?: number;
}): Promise<WorkflowRunResult[]> {
  const { db, workspaceId, trigger, recordId, actorId } = params;
  const depth = params.depth ?? 0;
  const workflows = await db
    .prepare(
      "SELECT * FROM workflow_definitions WHERE workspace_id = ? AND enabled = 1 AND trigger_type = ?",
    )
    .all(workspaceId, trigger) as WorkflowRow[];

  const results: WorkflowRunResult[] = [];
  for (const workflow of workflows) {
    results.push(
      await runWorkflow({
        db,
        workflow,
        trigger,
        actorId,
        recordIds: recordId ? [recordId] : undefined,
        dedupe: false,
        depth,
      }),
    );
  }
  return results;
}

export async function runDailyChecks(params: {
  db: Db;
  workspaceId: string;
  actorId: string;
  dryRun?: boolean;
}): Promise<WorkflowRunResult[]> {
  const workflows = await params.db
    .prepare(
      "SELECT * FROM workflow_definitions WHERE workspace_id = ? AND enabled = 1 AND trigger_type = 'daily_check'",
    )
    .all(params.workspaceId) as WorkflowRow[];
  const results: WorkflowRunResult[] = [];
  for (const workflow of workflows) {
    results.push(
      await runWorkflow({
        db: params.db,
        workflow,
        trigger: "daily_check",
        actorId: params.actorId,
        dryRun: params.dryRun,
        dedupe: !params.dryRun,
      }),
    );
  }
  return results;
}

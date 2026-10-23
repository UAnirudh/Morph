/**
 * CRM mutations.
 *
 * All writes go through these functions: they validate input with Zod, prove
 * the record belongs to the caller's workspace, log an activity and fire the
 * matching workflow triggers. Workflow actions use the same database paths, so
 * an automation can never write something a person could not.
 */
import type { Db, SqlArg } from "@/lib/db";
import { z } from "zod";
import { newId, nowIso } from "@/lib/db";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import type { LeadStatus, DealStage } from "@/lib/db/types";

export interface MutationScope {
  db: Db;
  workspaceId: string;
  userId: string;
}

export interface MutationResult<T = undefined> {
  ok: boolean;
  error?: string;
  record?: T;
  workflowRuns?: number;
}

const leadStatusEnum = z.enum(["new", "contacted", "qualified", "unqualified", "converted"]);
const dealStageEnum = z.enum(["prospecting", "qualification", "proposal", "negotiation", "won", "lost"]);
const priorityEnum = z.enum(["low", "medium", "high"]);

export const leadInputSchema = z.object({
  name: z.string().trim().min(2, "A lead needs a name").max(80),
  company: z.string().trim().min(1, "Company is required").max(80),
  email: z.string().trim().email("Enter a valid email").max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  source: z.enum(["inbound", "outbound", "referral", "event", "partner"]).default("inbound"),
  status: leadStatusEnum.default("new"),
  score: z.coerce.number().int().min(0).max(100).default(50),
  ownerId: z.string().max(64).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});
export type LeadInput = z.infer<typeof leadInputSchema>;

const taskInputSchema = z.object({
  title: z.string().trim().min(3, "Give the task a title").max(120),
  priority: priorityEnum.default("medium"),
  dueDate: z.string().max(40).optional().or(z.literal("")),
  assigneeId: z.string().max(64).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  relatedType: z.enum(["lead", "deal", "company", "none"]).default("none"),
  relatedId: z.string().max(64).optional().or(z.literal("")),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const activityInputSchema = z.object({
  kind: z.enum(["call", "email", "meeting", "note"]),
  subject: z.string().trim().min(3, "Describe the activity").max(120),
  body: z.string().trim().max(600).optional().or(z.literal("")),
  leadId: z.string().max(64).optional().or(z.literal("")),
  dealId: z.string().max(64).optional().or(z.literal("")),
});

export async function isWorkspaceMember(
  db: Db,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(workspaceId, userId) as { ok: number } | undefined;
  return Boolean(row);
}

async function recordInWorkspace(
  db: Db,
  table: "leads" | "deals" | "tasks" | "companies",
  id: string,
  workspaceId: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ? AND workspace_id = ?`)
    .get(id, workspaceId) as { ok: number } | undefined;
  return Boolean(row);
}

async function validOwner(
  db: Db,
  workspaceId: string,
  ownerId: string | null | undefined,
): Promise<string | null> {
  if (!ownerId) return null;
  return (await isWorkspaceMember(db, workspaceId, ownerId)) ? ownerId : null;
}

async function activity(
  db: Db,
  workspaceId: string,
  actorId: string,
  input: {
    kind: "call" | "email" | "meeting" | "note" | "task" | "stage_change" | "system";
    subject: string;
    body?: string | null;
    leadId?: string | null;
    dealId?: string | null;
  },
): Promise<void> {
  await db.prepare(
    `INSERT INTO activities (id, workspace_id, kind, subject, body, lead_id, deal_id, contact_id, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    newId(),
    workspaceId,
    input.kind,
    input.subject.slice(0, 160),
    input.body ? input.body.slice(0, 600) : null,
    input.leadId ?? null,
    input.dealId ?? null,
    actorId,
    nowIso(),
  );
}

/* -------------------------------------------------------------------------- */
/* Leads                                                                      */
/* -------------------------------------------------------------------------- */

export async function createLead(scope: MutationScope, input: unknown): Promise<MutationResult<{ id: string }>> {
  const parsed = leadInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid lead" };
  }
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const value = parsed.data;
  const id = newId();
  const now = nowIso();
  const companyRow = await db
    .prepare("SELECT id FROM companies WHERE workspace_id = ? AND lower(name) = lower(?)")
    .get(workspaceId, value.company) as { id: string } | undefined;
  let companyId = companyRow?.id ?? null;
  if (!companyId) {
    companyId = newId();
    await db.prepare(
      "INSERT INTO companies (id, workspace_id, name, industry, size, city, website, created_at) VALUES (?, ?, ?, 'Unknown', 'Unknown', NULL, NULL, ?)",
    ).run(companyId, workspaceId, value.company, now);
  }
  await db.prepare(
    `INSERT INTO leads (id, workspace_id, company_id, contact_id, name, company, email, phone, source, status,
       score, owner_id, last_contacted_at, flagged, flag_reason, notes, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    companyId,
    value.name,
    value.company,
    value.email || null,
    value.phone || null,
    value.source,
    value.status,
    value.score,
    await validOwner(db, workspaceId, value.ownerId) ?? userId,
    value.notes || null,
    now,
    now,
  );
  await activity(db, workspaceId, userId, {
    kind: "system",
    subject: `Lead created: ${value.name} (${value.company})`,
    leadId: id,
  });
  const runs = await runWorkflowsForTrigger({
    db,
    workspaceId,
    trigger: "record_created",
    recordId: id,
    actorId: userId,
  });
  return { ok: true, record: { id }, workflowRuns: runs.length };
}

export async function updateLead(
  scope: MutationScope,
  leadId: string,
  patch: Record<string, unknown>,
): Promise<MutationResult> {
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  if (!(await recordInWorkspace(db, "leads", leadId, workspaceId))) {
    return { ok: false, error: "Lead not found in this workspace" };
  }
  const fields: string[] = [];
  const params: unknown[] = [];
  const allowed = {
    name: z.string().trim().min(2).max(80),
    company: z.string().trim().min(1).max(80),
    email: z.string().trim().max(120),
    phone: z.string().trim().max(40),
    status: leadStatusEnum,
    score: z.coerce.number().int().min(0).max(100),
    ownerId: z.string().max(64),
    notes: z.string().trim().max(600),
  } as const;

  for (const [key, value] of Object.entries(patch)) {
    if (key === "ownerId") {
      const owner = await validOwner(db, workspaceId, value as string);
      if (!owner) continue;
      fields.push("owner_id = ?");
      params.push(owner);
      continue;
    }
    const schema = (allowed as Record<string, z.ZodTypeAny>)[key];
    if (!schema) continue;
    const parsed = schema.safeParse(value);
    if (!parsed.success) return { ok: false, error: `Invalid value for ${key}` };
    const column = key === "company" ? "company" : key;
    fields.push(`${column} = ?`);
    params.push(parsed.data);
  }
  if (fields.length === 0) return { ok: false, error: "Nothing to update" };
  fields.push("updated_at = ?");
  params.push(nowIso());
  await db.prepare(`UPDATE leads SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`).run(...(params as SqlArg[]), leadId, workspaceId);
  await activity(db, workspaceId, userId, {
    kind: "system",
    subject: `Lead updated: ${Object.keys(patch).join(", ")}`,
    leadId,
  });
  const runs = await runWorkflowsForTrigger({
    db,
    workspaceId,
    trigger: "record_updated",
    recordId: leadId,
    actorId: userId,
  });
  return { ok: true, workflowRuns: runs.length };
}

export async function markLeadContacted(scope: MutationScope, leadId: string): Promise<MutationResult> {
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const lead = await db
    .prepare("SELECT name, company, status FROM leads WHERE id = ? AND workspace_id = ?")
    .get(leadId, workspaceId) as { name: string; company: string; status: LeadStatus } | undefined;
  if (!lead) return { ok: false, error: "Lead not found in this workspace" };
  const now = nowIso();
  await db.prepare(
    "UPDATE leads SET last_contacted_at = ?, status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, flagged = 0, flag_reason = NULL, updated_at = ? WHERE id = ? AND workspace_id = ?",
  ).run(now, now, leadId, workspaceId);
  await activity(db, workspaceId, userId, {
    kind: "call",
    subject: `Contacted ${lead.name} at ${lead.company}`,
    leadId,
  });
  const runs = await runWorkflowsForTrigger({
    db,
    workspaceId,
    trigger: "record_updated",
    recordId: leadId,
    actorId: userId,
  });
  return { ok: true, workflowRuns: runs.length };
}

export async function setLeadStatus(scope: MutationScope, leadId: string, status: LeadStatus): Promise<MutationResult> {
  const parsed = leadStatusEnum.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  const result = await updateLead(scope, leadId, { status: parsed.data });
  if (result.ok) {
    await activity(scope.db, scope.workspaceId, scope.userId, {
      kind: "stage_change",
      subject: `Lead status → ${parsed.data}`,
      leadId,
    });
  }
  return result;
}

export async function createFollowupTask(scope: MutationScope, leadId: string): Promise<MutationResult<{ id: string }>> {
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const lead = await db
    .prepare("SELECT name, company, owner_id FROM leads WHERE id = ? AND workspace_id = ?")
    .get(leadId, workspaceId) as { name: string; company: string; owner_id: string | null } | undefined;
  if (!lead) return { ok: false, error: "Lead not found in this workspace" };
  const id = newId();
  const due = new Date(Date.now() + 86_400_000);
  await db.prepare(
    `INSERT INTO tasks (id, workspace_id, title, notes, status, priority, due_date, assignee_id, related_type, related_id, created_by, created_at, completed_at)
     VALUES (?, ?, ?, ?, 'open', 'medium', ?, ?, 'lead', ?, ?, ?, NULL)`,
  ).run(
    id,
    workspaceId,
    `Follow up with ${lead.name} (${lead.company})`,
    "Created from the workspace canvas.",
    due.toISOString(),
    await validOwner(db, workspaceId, lead.owner_id) ?? userId,
    leadId,
    userId,
    nowIso(),
  );
  await activity(db, workspaceId, userId, {
    kind: "task",
    subject: `Follow-up task created for ${lead.name}`,
    leadId,
  });
  return { ok: true, record: { id } };
}

/* -------------------------------------------------------------------------- */
/* Deals                                                                      */
/* -------------------------------------------------------------------------- */

export async function advanceDealStage(scope: MutationScope, dealId: string): Promise<MutationResult<{ stage: DealStage }>> {
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const deal = await db
    .prepare("SELECT name, stage, owner_id FROM deals WHERE id = ? AND workspace_id = ?")
    .get(dealId, workspaceId) as { name: string; stage: DealStage; owner_id: string | null } | undefined;
  if (!deal) return { ok: false, error: "Deal not found in this workspace" };
  const order: DealStage[] = ["prospecting", "qualification", "proposal", "negotiation", "won"];
  const index = order.indexOf(deal.stage);
  if (index === -1) return { ok: false, error: "This deal is already closed" };
  const next = order[Math.min(index + 1, order.length - 1)]!;
  return setDealStage(scope, dealId, next);
}

export async function setDealStage(scope: MutationScope, dealId: string, stage: DealStage): Promise<MutationResult<{ stage: DealStage }>> {
  const { db, workspaceId, userId } = scope;
  const parsed = dealStageEnum.safeParse(stage);
  if (!parsed.success) return { ok: false, error: "Invalid stage" };
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const deal = await db
    .prepare("SELECT name, stage, amount FROM deals WHERE id = ? AND workspace_id = ?")
    .get(dealId, workspaceId) as { name: string; stage: DealStage; amount: number } | undefined;
  if (!deal) return { ok: false, error: "Deal not found in this workspace" };
  const now = nowIso();
  const closed = parsed.data === "won" || parsed.data === "lost";
  const probability = parsed.data === "won" ? 100 : parsed.data === "lost" ? 0 : parsed.data === "negotiation" ? 75 : parsed.data === "proposal" ? 55 : 30;
  await db.prepare(
    "UPDATE deals SET stage = ?, probability = ?, closed_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
  ).run(parsed.data, probability, closed ? now : null, now, dealId, workspaceId);
  await activity(db, workspaceId, userId, {
    kind: "stage_change",
    subject: `${deal.name}: ${deal.stage} → ${parsed.data}`,
    dealId,
  });
  const runs = await runWorkflowsForTrigger({
    db,
    workspaceId,
    trigger: "deal_stage_changed",
    recordId: dealId,
    actorId: userId,
  });
  return { ok: true, record: { stage: parsed.data }, workflowRuns: runs.length };
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export async function createTask(scope: MutationScope, input: unknown): Promise<MutationResult<{ id: string }>> {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task" };
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const value = parsed.data;
  const relatedType = value.relatedType === "none" ? null : value.relatedType;
  if (relatedType && value.relatedId) {
    const table = relatedType === "lead" ? "leads" : relatedType === "deal" ? "deals" : "companies";
    if (!(await recordInWorkspace(db, table, value.relatedId, workspaceId))) {
      return { ok: false, error: "That related record is not in this workspace" };
    }
  }
  const id = newId();
  await db.prepare(
    `INSERT INTO tasks (id, workspace_id, title, notes, status, priority, due_date, assignee_id, related_type, related_id, created_by, created_at, completed_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    workspaceId,
    value.title,
    value.notes || null,
    value.priority,
    value.dueDate ? new Date(value.dueDate).toISOString() : null,
    await validOwner(db, workspaceId, value.assigneeId) ?? userId,
    relatedType,
    relatedType ? value.relatedId || null : null,
    userId,
    nowIso(),
  );
  await activity(db, workspaceId, userId, {
    kind: "task",
    subject: `Task created: ${value.title}`,
    leadId: relatedType === "lead" ? value.relatedId || null : null,
    dealId: relatedType === "deal" ? value.relatedId || null : null,
  });
  const runs = await runWorkflowsForTrigger({
    db,
    workspaceId,
    trigger: "record_created",
    recordId: id,
    actorId: userId,
  });
  return { ok: true, record: { id }, workflowRuns: runs.length };
}

export async function completeTask(scope: MutationScope, taskId: string): Promise<MutationResult> {
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const task = await db
    .prepare("SELECT title, status FROM tasks WHERE id = ? AND workspace_id = ?")
    .get(taskId, workspaceId) as { title: string; status: string } | undefined;
  if (!task) return { ok: false, error: "Task not found in this workspace" };
  const done = task.status === "done";
  const now = nowIso();
  await db.prepare("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND workspace_id = ?").run(
    done ? "open" : "done",
    done ? null : now,
    taskId,
    workspaceId,
  );
  await activity(db, workspaceId, userId, {
    kind: "task",
    subject: `${done ? "Reopened" : "Completed"} task: ${task.title}`,
  });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Activities                                                                 */
/* -------------------------------------------------------------------------- */

export async function logActivity(scope: MutationScope, input: unknown): Promise<MutationResult<{ id: string }>> {
  const parsed = activityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid activity" };
  const { db, workspaceId, userId } = scope;
  if (!(await isWorkspaceMember(db, workspaceId, userId))) return { ok: false, error: "Not a workspace member" };
  const value = parsed.data;
  if (value.leadId && !(await recordInWorkspace(db, "leads", value.leadId, workspaceId))) {
    return { ok: false, error: "Lead not in this workspace" };
  }
  if (value.dealId && !(await recordInWorkspace(db, "deals", value.dealId, workspaceId))) {
    return { ok: false, error: "Deal not in this workspace" };
  }
  const id = newId();
  await db.prepare(
    `INSERT INTO activities (id, workspace_id, kind, subject, body, lead_id, deal_id, contact_id, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    workspaceId,
    value.kind,
    value.subject,
    value.body || null,
    value.leadId || null,
    value.dealId || null,
    userId,
    nowIso(),
  );
  // A logged call/email counts as a touch on the lead.
  if (value.leadId && (value.kind === "call" || value.kind === "email" || value.kind === "meeting")) {
    await db.prepare("UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").run(
      nowIso(),
      nowIso(),
      value.leadId,
      workspaceId,
    );
  }
  return { ok: true, record: { id } };
}

/* -------------------------------------------------------------------------- */
/* Option lists for forms                                                     */
/* -------------------------------------------------------------------------- */

export async function listOwnerOptions(
  db: Db,
  workspaceId: string,
): Promise<Array<{ id: string; name: string; jobRole: string }>> {
  return (await db
    .prepare(
      `SELECT u.id, u.name, m.job_role AS jobRole FROM workspace_members m JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ? ORDER BY u.name`,
    )
    .all(workspaceId)) as Array<{ id: string; name: string; jobRole: string }>;
}

export async function listCompanyOptions(
  db: Db,
  workspaceId: string,
): Promise<Array<{ id: string; name: string }>> {
  return (await db
    .prepare("SELECT id, name FROM companies WHERE workspace_id = ? ORDER BY name")
    .all(workspaceId)) as Array<{ id: string; name: string }>;
}

export async function listDealOptions(
  db: Db,
  workspaceId: string,
): Promise<Array<{ id: string; name: string; stage: string }>> {
  return (await db
    .prepare("SELECT id, name, stage FROM deals WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 50")
    .all(workspaceId)) as Array<{ id: string; name: string; stage: string }>;
}

export async function listLeadOptions(
  db: Db,
  workspaceId: string,
): Promise<Array<{ id: string; name: string; company: string }>> {
  return (await db
    .prepare("SELECT id, name, company FROM leads WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 50")
    .all(workspaceId)) as Array<{ id: string; name: string; company: string }>;
}

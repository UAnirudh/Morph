import type { Db, SqlArg } from "@/lib/db";
import {
  CHART_DATASET_KEYS,
  RECORD_DATASET_KEYS,
  datasetFields,
  datasetLabel,
  type ChartDataset,
  type DatasetKey,
  type FieldSpec,
  type MetricKey,
  type RecordDataset,
} from "@/lib/morph/config";
import { titleCase } from "@/lib/utils";

const DAY = 86_400_000;

export interface DataScope {
  workspaceId: string;
  userId: string;
}

export type CellValue = string | number | boolean | null;
export type RecordRow = {
  id?: string;
  [key: string]: CellValue | undefined;
};

export interface DatasetResult {
  key: DatasetKey;
  label: string;
  rows: RecordRow[];
  fields: FieldSpec[];
  total: number;
  extra?: Record<string, number | string>;
}

export interface ConfigData {
  datasets: Partial<Record<DatasetKey, DatasetResult>>;
  metrics: Partial<Record<MetricKey, number>>;
  generatedAt: string;
}

function all<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.prepare<SqlArg[], T>(sql).all(...(params as SqlArg[]));
}

function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return db.prepare<SqlArg[], T>(sql).get(...(params as SqlArg[]));
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysBetween = (from: string | null, now: Date) =>
  from ? Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / DAY)) : 0;

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                 */
/* -------------------------------------------------------------------------- */

interface LeadBase {
  id: string;
  name: string;
  company: string | null;
  status: string;
  score: number;
  owner: string | null;
  source: string;
  lastContacted: string | null;
  email: string | null;
  phone: string | null;
  flagged: number;
  createdAt: string;
}

interface DealBase {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  amount: number;
  probability: number;
  owner: string | null;
  expectedCloseDate: string | null;
  updatedAt: string;
}

interface TaskBase {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assignee: string | null;
  relatedType: string | null;
  notes: string | null;
  createdAt: string;
}

const LEAD_SELECT = `
  SELECT l.id, l.name, c.name AS company, l.status, l.score, u.name AS owner, l.source,
         l.last_contacted_at AS lastContacted, l.email, l.phone, l.flagged, l.created_at AS createdAt
  FROM leads l
  LEFT JOIN companies c ON c.id = l.company_id
  LEFT JOIN users u ON u.id = l.owner_id`;

const DEAL_SELECT = `
  SELECT d.id, d.name, c.name AS company, d.stage, d.amount, d.probability, u.name AS owner,
         d.expected_close_date AS expectedCloseDate, d.updated_at AS updatedAt
  FROM deals d
  LEFT JOIN companies c ON c.id = d.company_id
  LEFT JOIN users u ON u.id = d.owner_id`;

const TASK_SELECT = `
  SELECT t.id, t.title, t.status, t.priority, t.due_date AS dueDate, u.name AS assignee,
         t.related_type AS relatedType, t.notes, t.created_at AS createdAt
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_id`;

function leadRows(rows: LeadBase[], now: Date): RecordRow[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company ?? "—",
    status: row.status,
    score: row.score,
    owner: row.owner ?? "Unassigned",
    source: row.source,
    lastContacted: row.lastContacted,
    daysSinceContact: row.lastContacted ? daysBetween(row.lastContacted, now) : null,
    email: row.email,
    phone: row.phone,
    flagged: row.flagged === 1,
    createdAt: row.createdAt,
  }));
}

function dealRows(rows: DealBase[], now: Date): RecordRow[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company ?? "—",
    stage: row.stage,
    amount: Math.round(row.amount),
    probability: row.probability,
    owner: row.owner ?? "Unassigned",
    expectedCloseDate: row.expectedCloseDate,
    daysInStage: daysBetween(row.updatedAt, now),
    updatedAt: row.updatedAt,
  }));
}

function taskRows(rows: TaskBase[]): RecordRow[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    assignee: row.assignee ?? "Unassigned",
    relatedType: row.relatedType ? titleCase(row.relatedType) : "—",
    notes: row.notes,
    createdAt: row.createdAt,
  }));
}

/* -------------------------------------------------------------------------- */
/* Record datasets                                                            */
/* -------------------------------------------------------------------------- */

const OPEN_LEAD_STATUSES = `('new','contacted','qualified')`;

export async function resolveRecordDataset(
  db: Db,
  scope: DataScope,
  key: RecordDataset,
  now = new Date(),
): Promise<DatasetResult> {
  const { workspaceId, userId } = scope;
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart.getTime() + DAY);

  switch (key) {
    case "leads":
    case "my_leads":
    case "overdue_followups":
    case "priority_leads":
    case "flagged_leads": {
      let where = "l.workspace_id = ?";
      const params: unknown[] = [workspaceId];
      if (key === "my_leads") {
        where += " AND l.owner_id = ?";
        params.push(userId);
      }
      if (key === "overdue_followups") {
        where += ` AND l.last_contacted_at IS NOT NULL AND l.last_contacted_at < ? AND l.status IN ${OPEN_LEAD_STATUSES}`;
        params.push(weekAgo);
      }
      if (key === "priority_leads") {
        where += ` AND l.status IN ${OPEN_LEAD_STATUSES}`;
      }
      if (key === "flagged_leads") {
        where += " AND l.flagged = 1";
      }
      const order =
        key === "overdue_followups"
          ? "l.last_contacted_at ASC"
          : key === "priority_leads"
            ? "l.score DESC, l.last_contacted_at ASC"
            : "l.updated_at DESC";
      const rows = await all<LeadBase>(db, `${LEAD_SELECT} WHERE ${where} ORDER BY ${order} LIMIT 200`, params);
      return {
        key,
        label: datasetLabel(key),
        rows: leadRows(rows, now),
        fields: datasetFields(key),
        total: rows.length,
        extra: { overdueCount: rows.filter((r) => r.lastContacted && r.lastContacted < weekAgo).length },
      };
    }
    case "deals":
    case "at_risk_deals": {
      let where = "d.workspace_id = ?";
      const params: unknown[] = [workspaceId];
      if (key === "at_risk_deals") {
        where += " AND d.stage NOT IN ('won','lost') AND d.updated_at < ?";
        params.push(new Date(now.getTime() - 21 * DAY).toISOString());
      }
      const rows = await all<DealBase>(
        db,
        `${DEAL_SELECT} WHERE ${where} ORDER BY ${
          key === "at_risk_deals" ? "d.updated_at ASC" : "d.amount DESC"
        } LIMIT 200`,
        params,
      );
      return {
        key,
        label: datasetLabel(key),
        rows: dealRows(rows, now),
        fields: datasetFields(key),
        total: rows.length,
      };
    }
    case "tasks":
    case "my_tasks":
    case "today_tasks":
    case "overdue_tasks": {
      let where = "t.workspace_id = ?";
      const params: unknown[] = [workspaceId];
      if (key === "my_tasks") {
        where += " AND t.assignee_id = ?";
        params.push(userId);
      }
      if (key === "today_tasks") {
        where += " AND t.status != 'done' AND t.due_date >= ? AND t.due_date < ?";
        params.push(todayStart.toISOString(), todayEnd.toISOString());
      }
      if (key === "overdue_tasks") {
        where += " AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < ?";
        params.push(todayStart.toISOString());
      }
      const rows = await all<TaskBase>(
        db,
        `${TASK_SELECT} WHERE ${where} ORDER BY ${
          key === "today_tasks" ? "t.priority DESC, t.due_date ASC" : "t.due_date ASC"
        } LIMIT 200`,
        params,
      );
      return {
        key,
        label: datasetLabel(key),
        rows: taskRows(rows),
        fields: datasetFields(key),
        total: rows.length,
      };
    }
    case "companies": {
      const rows = await all<{
        id: string;
        name: string;
        industry: string;
        size: string;
        city: string | null;
        openDeals: number;
        revenue: number;
      }>(
        db,
        `SELECT c.id, c.name, c.industry, c.size, c.city,
           (SELECT COUNT(*) FROM deals d WHERE d.company_id = c.id AND d.stage NOT IN ('won','lost')) AS openDeals,
           (SELECT COALESCE(SUM(d.amount),0) FROM deals d WHERE d.company_id = c.id AND d.stage = 'won') AS revenue
         FROM companies c WHERE c.workspace_id = ? ORDER BY revenue DESC LIMIT 100`,
        [workspaceId],
      );
      return {
        key,
        label: datasetLabel(key),
        rows: rows.map((row) => ({ ...row, city: row.city ?? "—" })),
        fields: datasetFields(key),
        total: rows.length,
      };
    }
    case "contacts": {
      const rows = await all<{
        id: string;
        name: string;
        title: string | null;
        email: string;
        company: string | null;
        phone: string | null;
      }>(
        db,
        `SELECT ct.id, ct.first_name || ' ' || ct.last_name AS name, ct.title, ct.email,
                co.name AS company, ct.phone
         FROM contacts ct LEFT JOIN companies co ON co.id = ct.company_id
         WHERE ct.workspace_id = ? ORDER BY ct.created_at DESC LIMIT 100`,
        [workspaceId],
      );
      return {
        key,
        label: datasetLabel(key),
        rows: rows.map((row) => ({ ...row, title: row.title ?? "—", phone: row.phone ?? "—" })),
        fields: datasetFields(key),
        total: rows.length,
      };
    }
    case "activities": {
      const rows = await all<{
        id: string;
        subject: string;
        kind: string;
        actor: string | null;
        body: string | null;
        createdAt: string;
      }>(
        db,
        `SELECT a.id, a.subject, a.kind, u.name AS actor, a.body, a.created_at AS createdAt
         FROM activities a LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT 100`,
        [workspaceId],
      );
      return {
        key,
        label: datasetLabel(key),
        rows: rows.map((row) => ({ ...row, actor: row.actor ?? "System" })),
        fields: datasetFields(key),
        total: rows.length,
      };
    }
    case "workflows": {
      const rows = await all<{
        id: string;
        name: string;
        triggerType: string;
        enabled: number;
        lastRunAt: string | null;
        runCount: number;
      }>(
        db,
        `SELECT w.id, w.name, w.trigger_type AS triggerType, w.enabled, w.last_run_at AS lastRunAt,
           (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id = w.id) AS runCount
         FROM workflow_definitions w WHERE w.workspace_id = ? ORDER BY w.enabled DESC, w.updated_at DESC`,
        [workspaceId],
      );
      return {
        key,
        label: datasetLabel(key),
        rows: rows.map((row) => ({ ...row, enabled: row.enabled === 1 })),
        fields: datasetFields(key),
        total: rows.length,
      };
    }
    default:
      throw new Error(`Unsupported record dataset: ${String(key)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Chart datasets                                                             */
/* -------------------------------------------------------------------------- */

const OPEN_STAGES = ["prospecting", "qualification", "proposal", "negotiation"] as const;

export async function resolveChartDataset(
  db: Db,
  scope: DataScope,
  key: ChartDataset,
  now = new Date(),
): Promise<DatasetResult> {
  const { workspaceId, userId } = scope;
  const fields = datasetFields(key);
  let rows: RecordRow[] = [];

  switch (key) {
    case "revenue_by_month": {
      const months: RecordRow[] = [];
      for (let i = 7; i >= 0; i -= 1) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const agg = await one<{ revenue: number; deals: number }>(
          db,
          `SELECT COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS deals FROM deals
           WHERE workspace_id = ? AND stage = 'won' AND closed_at >= ? AND closed_at < ?`,
          [workspaceId, start.toISOString(), end.toISOString()],
        );
        months.push({
          month: start.toLocaleString("en-US", { month: "short" }),
          revenue: Math.round(agg?.revenue ?? 0),
          deals: agg?.deals ?? 0,
        });
      }
      rows = months;
      break;
    }
    case "deals_by_stage": {
      rows = [];
      for (const stage of [...OPEN_STAGES, "won", "lost"]) {
        const agg = await one<{ count: number; value: number }>(
          db,
          `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS value FROM deals WHERE workspace_id = ? AND stage = ?`,
          [workspaceId, stage],
        );
        rows.push({
          stage: titleCase(stage),
          count: agg?.count ?? 0,
          value: Math.round(agg?.value ?? 0),
        });
      }
      break;
    }
    case "leads_by_source": {
      rows = (
        await all<{ source: string; count: number; converted: number }>(
          db,
          `SELECT source, COUNT(*) AS count,
             SUM(CASE WHEN status IN ('qualified','converted') THEN 1 ELSE 0 END) AS converted
           FROM leads WHERE workspace_id = ? GROUP BY source ORDER BY count DESC`,
          [workspaceId],
        )
      ).map((row) => ({ ...row, source: titleCase(row.source) }));
      break;
    }
    case "conversion_funnel": {
      const counts = await all<{ status: string; count: number }>(
        db,
        "SELECT status, COUNT(*) AS count FROM leads WHERE workspace_id = ? GROUP BY status",
        [workspaceId],
      );
      const byStatus = Object.fromEntries(counts.map((row) => [row.status, row.count]));
      const total =
        (byStatus.new ?? 0) +
        (byStatus.contacted ?? 0) +
        (byStatus.qualified ?? 0) +
        (byStatus.converted ?? 0);
      rows = [
        { stage: "New", count: total },
        { stage: "Contacted", count: (byStatus.contacted ?? 0) + (byStatus.qualified ?? 0) + (byStatus.converted ?? 0) },
        { stage: "Qualified", count: (byStatus.qualified ?? 0) + (byStatus.converted ?? 0) },
        { stage: "Converted", count: byStatus.converted ?? 0 },
      ];
      break;
    }
    case "task_status": {
      const counts = await all<{ status: string; count: number }>(
        db,
        "SELECT status, COUNT(*) AS count FROM tasks WHERE workspace_id = ? GROUP BY status",
        [workspaceId],
      );
      const byStatus = Object.fromEntries(counts.map((row) => [row.status, row.count]));
      rows = [
        { status: "Open", count: byStatus.open ?? 0 },
        { status: "In progress", count: byStatus.in_progress ?? 0 },
        { status: "Done", count: byStatus.done ?? 0 },
      ];
      break;
    }
    case "workload_by_owner": {
      rows = await all<{ owner: string; openTasks: number; overdue: number; openDeals: number }>(
        db,
        `SELECT u.name AS owner,
           (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.workspace_id = ? AND t.status != 'done') AS openTasks,
           (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.workspace_id = ? AND t.status != 'done' AND t.due_date < ?) AS overdue,
           (SELECT COUNT(*) FROM deals d WHERE d.owner_id = u.id AND d.workspace_id = ? AND d.stage NOT IN ('won','lost')) AS openDeals
         FROM workspace_members m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? ORDER BY openTasks DESC`,
        [workspaceId, workspaceId, now.toISOString(), workspaceId, workspaceId],
      );
      break;
    }
    case "activity_trend": {
      const days = Array.from({ length: 14 }, (_, index) => {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - index));
        return { start, end: new Date(start.getTime() + DAY) };
      });
      rows = [];
      for (const { start, end } of days) {
        const agg = await one<{ count: number }>(
          db,
          "SELECT COUNT(*) AS count FROM activities WHERE workspace_id = ? AND created_at >= ? AND created_at < ?",
          [workspaceId, start.toISOString(), end.toISOString()],
        );
        rows.push({
          day: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          count: agg?.count ?? 0,
        });
      }
      break;
    }
    case "pipeline_aging": {
      const deals = await all<{ amount: number; updatedAt: string }>(
        db,
        "SELECT amount, updated_at AS updatedAt FROM deals WHERE workspace_id = ? AND stage NOT IN ('won','lost')",
        [workspaceId],
      );
      const buckets = [
        { bucket: "0-7d", min: 0, max: 7 },
        { bucket: "8-14d", min: 8, max: 14 },
        { bucket: "15-21d", min: 15, max: 21 },
        { bucket: "22d+", min: 22, max: 9999 },
      ];
      rows = buckets.map((bucket) => {
        const matches = deals.filter((deal) => {
          const age = daysBetween(deal.updatedAt, now);
          return age >= bucket.min && age <= bucket.max;
        });
        return {
          bucket: bucket.bucket,
          count: matches.length,
          value: Math.round(matches.reduce((sum, deal) => sum + deal.amount, 0)),
        };
      });
      break;
    }
    default:
      throw new Error(`Unsupported chart dataset: ${String(key)}`);
  }

  return { key, label: datasetLabel(key), rows, fields, total: rows.length };
}

export async function resolveDataset(
  db: Db,
  scope: DataScope,
  key: DatasetKey,
  now = new Date(),
): Promise<DatasetResult> {
  if ((RECORD_DATASET_KEYS as string[]).includes(key)) {
    return resolveRecordDataset(db, scope, key as RecordDataset, now);
  }
  if ((CHART_DATASET_KEYS as string[]).includes(key)) {
    return resolveChartDataset(db, scope, key as ChartDataset, now);
  }
  throw new Error(`Unknown dataset: ${key}`);
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export async function resolveMetric(
  db: Db,
  scope: DataScope,
  key: MetricKey,
  now = new Date(),
): Promise<number> {
  const { workspaceId, userId } = scope;
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart.getTime() + DAY);
  const query = async (sql: string, params: unknown[] = [workspaceId]) => {
    const row = await one<{ value: number }>(db, sql, params);
    return row?.value ?? 0;
  };

  switch (key) {
    case "pipeline_value":
      return Math.round(
        await query(
          "SELECT COALESCE(SUM(amount),0) AS value FROM deals WHERE workspace_id = ? AND stage NOT IN ('won','lost')",
        ),
      );
    case "won_revenue":
      return Math.round(
        await query(
          "SELECT COALESCE(SUM(amount),0) AS value FROM deals WHERE workspace_id = ? AND stage = 'won' AND closed_at >= ?",
          [workspaceId, new Date(now.getTime() - 90 * DAY).toISOString()],
        ),
      );
    case "open_deals":
      return await query(
        "SELECT COUNT(*) AS value FROM deals WHERE workspace_id = ? AND stage NOT IN ('won','lost')",
      );
    case "win_rate": {
      const row = await one<{ won: number; closed: number }>(
        db,
        `SELECT SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) AS won, COUNT(*) AS closed
         FROM deals WHERE workspace_id = ? AND stage IN ('won','lost')`,
        [workspaceId],
      );
      if (!row || !row.closed) return 0;
      return Math.round(((row.won ?? 0) / row.closed) * 100);
    }
    case "overdue_followups":
      return await query(
        `SELECT COUNT(*) AS value FROM leads WHERE workspace_id = ? AND last_contacted_at IS NOT NULL
         AND last_contacted_at < ? AND status IN ('new','contacted','qualified')`,
        [workspaceId, weekAgo],
      );
    case "task_due_today":
      return await query(
        `SELECT COUNT(*) AS value FROM tasks WHERE workspace_id = ? AND status != 'done'
         AND due_date >= ? AND due_date < ?`,
        [workspaceId, todayStart.toISOString(), todayEnd.toISOString()],
      );
    case "my_open_tasks":
      return await query(
        "SELECT COUNT(*) AS value FROM tasks WHERE workspace_id = ? AND assignee_id = ? AND status != 'done'",
        [workspaceId, userId],
      );
    case "avg_deal_size":
      return Math.round(
        await query(
          "SELECT COALESCE(AVG(amount),0) AS value FROM deals WHERE workspace_id = ? AND stage NOT IN ('won','lost')",
        ),
      );
    case "team_workload":
      return await query(
        "SELECT COUNT(*) AS value FROM tasks WHERE workspace_id = ? AND status != 'done'",
      );
    case "lead_conversion": {
      const row = await one<{ total: number; converted: number }>(
        db,
        `SELECT COUNT(*) AS total,
           SUM(CASE WHEN status IN ('qualified','converted') THEN 1 ELSE 0 END) AS converted
         FROM leads WHERE workspace_id = ?`,
        [workspaceId],
      );
      if (!row || !row.total) return 0;
      return Math.round(((row.converted ?? 0) / row.total) * 100);
    }
    case "active_leads": {
      const ownerFilter = userId ? " AND owner_id = ?" : "";
      const params: unknown[] = userId ? [workspaceId, userId] : [workspaceId];
      return await query(
        `SELECT COUNT(*) AS value FROM leads WHERE workspace_id = ?${ownerFilter} AND status IN ('new','contacted','qualified')`,
        params,
      );
    }
    case "at_risk_deals":
      return await query(
        `SELECT COUNT(*) AS value FROM deals WHERE workspace_id = ? AND stage NOT IN ('won','lost')
         AND updated_at < ?`,
        [workspaceId, new Date(now.getTime() - 21 * DAY).toISOString()],
      );
    case "flagged_leads":
      return await query("SELECT COUNT(*) AS value FROM leads WHERE workspace_id = ? AND flagged = 1");
    case "tasks_completed_week":
      return await query(
        "SELECT COUNT(*) AS value FROM tasks WHERE workspace_id = ? AND status = 'done' AND completed_at >= ?",
        [workspaceId, weekAgo],
      );
    default:
      return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Batched resolution for a configuration                                     */
/* -------------------------------------------------------------------------- */

export function datasetsForComponents(
  components: Array<{ type: string; dataset?: string }>,
): DatasetKey[] {
  const keys = new Set<DatasetKey>();
  for (const component of components) {
    if (component.dataset) keys.add(component.dataset as DatasetKey);
    if (component.type === "pipeline-board") keys.add("deals");
    if (component.type === "task-list") keys.add("tasks");
    if (component.type === "activity-feed") keys.add("activities");
    if (component.type === "workflow-panel") keys.add("workflows");
  }
  return [...keys];
}

export function metricsForComponents(
  components: Array<{ type: string; metric?: string }>,
): MetricKey[] {
  const keys = new Set<MetricKey>();
  for (const component of components) {
    if (component.type === "metric" && component.metric) keys.add(component.metric as MetricKey);
    if (component.type === "progress" && component.metric) keys.add(component.metric as MetricKey);
    if (component.type === "insight" && component.metric) keys.add(component.metric as MetricKey);
  }
  return [...keys];
}

export async function resolveConfigData(
  db: Db,
  scope: DataScope,
  components: Array<{ type: string; dataset?: string; metric?: string }>,
  now = new Date(),
): Promise<ConfigData> {
  const data: ConfigData = { datasets: {}, metrics: {}, generatedAt: now.toISOString() };
  for (const key of datasetsForComponents(components)) {
    try {
      data.datasets[key] = await resolveDataset(db, scope, key, now);
    } catch {
      // A component with an unsupported binding renders an inline error rather
      // than breaking the entire workspace.
    }
  }
  for (const key of metricsForComponents(components)) {
    data.metrics[key] = await resolveMetric(db, scope, key, now);
  }
  return data;
}

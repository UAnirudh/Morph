import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { resolveMetric, resolveRecordDataset } from "@/lib/crm/data";
import { datasetFields } from "@/lib/morph/config";
import {
  listCompanyOptions,
  listDealOptions,
  listLeadOptions,
  listOwnerOptions,
} from "@/lib/crm/mutations";
import { RecordsView } from "@/components/crm/records-view";
import type { RecordMetric } from "@/components/crm/records-view";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const COLUMNS = ["title", "status", "priority", "dueDate", "assignee", "relatedType"];

export default async function TasksPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const rows = (await resolveRecordDataset(db, scope, "tasks")).rows;
  const fields = datasetFields("tasks").filter((field) => COLUMNS.includes(field.key));

  const metrics: RecordMetric[] = [
    { label: "Open tasks", value: await resolveMetric(db, scope, "team_workload"), format: "number", hint: "Across the team" },
    { label: "Due today", value: await resolveMetric(db, scope, "task_due_today"), format: "number", hint: "Still open" },
    { label: "My open tasks", value: await resolveMetric(db, scope, "my_open_tasks"), format: "number", hint: "Assigned to you" },
    { label: "Done this week", value: await resolveMetric(db, scope, "tasks_completed_week"), format: "number", hint: "Last 7 days" },
  ];

  return (
    <RecordsView
      title="Tasks"
      description="Work items created by hand or by a workflow. Completing a task here is the same mutation a Morph action calls."
      entity="task"
      metrics={metrics}
      columns={fields}
      rows={rows}
      filterField="status"
      filterValues={["open", "in_progress", "done"]}
      rowActions={["complete_task"]}
      emptyHint="No tasks match that filter."
      options={{
        owners: await listOwnerOptions(db, ctx.workspace.id),
        leads: await listLeadOptions(db, ctx.workspace.id),
        deals: await listDealOptions(db, ctx.workspace.id),
        companies: await listCompanyOptions(db, ctx.workspace.id),
      }}
    />
  );
}

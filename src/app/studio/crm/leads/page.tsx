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

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const COLUMNS = ["name", "company", "status", "score", "owner", "source", "lastContacted", "flagged"];

export default async function LeadsPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const rows = (await resolveRecordDataset(db, scope, "leads")).rows;
  const fields = datasetFields("leads").filter((field) => COLUMNS.includes(field.key));

  const metrics: RecordMetric[] = [
    { label: "Active leads", value: await resolveMetric(db, scope, "active_leads"), format: "number", hint: "New, contacted or qualified" },
    { label: "Lead conversion", value: await resolveMetric(db, scope, "lead_conversion"), format: "percent", hint: "Qualified ÷ all leads" },
    { label: "Overdue follow-ups", value: await resolveMetric(db, scope, "overdue_followups"), format: "number", hint: "No contact in 7+ days" },
    { label: "Flagged by automation", value: await resolveMetric(db, scope, "flagged_leads"), format: "number", hint: "Set by workflows" },
  ];

  return (
    <RecordsView
      title="Leads"
      description="The same records every Morph interface reads from. Actions here run the identical permission checks as an AI-generated button."
      entity="lead"
      metrics={metrics}
      columns={fields}
      rows={rows}
      filterField="status"
      filterValues={["new", "contacted", "qualified", "unqualified", "converted"]}
      rowActions={["mark_lead_contacted", "qualify_lead", "create_followup_task"]}
      emptyHint="No leads yet — create one to see it appear across every interface."
      options={{
        owners: await listOwnerOptions(db, ctx.workspace.id),
        leads: await listLeadOptions(db, ctx.workspace.id),
        deals: await listDealOptions(db, ctx.workspace.id),
        companies: await listCompanyOptions(db, ctx.workspace.id),
      }}
    />
  );
}

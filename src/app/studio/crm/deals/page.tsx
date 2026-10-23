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

export const metadata: Metadata = { title: "Deals" };
export const dynamic = "force-dynamic";

const COLUMNS = ["name", "company", "stage", "amount", "probability", "owner", "expectedCloseDate", "daysInStage"];

export default async function DealsPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const rows = (await resolveRecordDataset(db, scope, "deals")).rows;
  const fields = datasetFields("deals").filter((field) => COLUMNS.includes(field.key));

  const metrics: RecordMetric[] = [
    { label: "Pipeline value", value: await resolveMetric(db, scope, "pipeline_value"), format: "currency", hint: "Open deal value" },
    { label: "Open deals", value: await resolveMetric(db, scope, "open_deals"), format: "number", hint: "Not closed" },
    { label: "Win rate", value: await resolveMetric(db, scope, "win_rate"), format: "percent", hint: "Won ÷ closed" },
    { label: "At-risk deals", value: await resolveMetric(db, scope, "at_risk_deals"), format: "number", hint: "No movement in 21+ days" },
  ];

  return (
    <RecordsView
      title="Deals & pipeline"
      description="Move a deal stage here or from any Morph widget — both trigger the same stage-change workflows."
      entity="deal"
      metrics={metrics}
      columns={fields}
      rows={rows}
      filterField="stage"
      filterValues={["prospecting", "qualification", "proposal", "negotiation", "won", "lost"]}
      rowActions={["advance_deal_stage"]}
      showPipeline
      emptyHint="No deals in this view."
      options={{
        owners: await listOwnerOptions(db, ctx.workspace.id),
        leads: await listLeadOptions(db, ctx.workspace.id),
        deals: await listDealOptions(db, ctx.workspace.id),
        companies: await listCompanyOptions(db, ctx.workspace.id),
      }}
    />
  );
}

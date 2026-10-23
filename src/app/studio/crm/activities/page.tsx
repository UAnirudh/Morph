import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { resolveRecordDataset } from "@/lib/crm/data";
import { datasetFields } from "@/lib/morph/config";
import {
  listCompanyOptions,
  listDealOptions,
  listLeadOptions,
  listOwnerOptions,
} from "@/lib/crm/mutations";
import { RecordsView } from "@/components/crm/records-view";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const rows = (await resolveRecordDataset(db, scope, "activities")).rows;
  const fields = datasetFields("activities");
  const automated = rows.filter((row) => row.kind === "workflow").length;
  const touches = rows.filter((row) => row.kind === "call" || row.kind === "email" || row.kind === "meeting").length;

  return (
    <RecordsView
      title="Activity"
      description="A single audit trail for human and automated actions. Workflow runs log here exactly like manual changes."
      entity="activity"
      metrics={[
        { label: "Logged activities", value: rows.length, format: "number", hint: "All time" },
        { label: "Human touches", value: touches, format: "number", hint: "Calls, emails, meetings" },
        { label: "Automated entries", value: automated, format: "number", hint: "Written by workflows" },
        { label: "Distinct actors", value: new Set(rows.map((row) => row.actor)).size, format: "number", hint: "People + system" },
      ]}
      columns={fields}
      rows={rows}
      rowActions={[]}
      emptyHint="Nothing logged yet."
      options={{
        owners: await listOwnerOptions(db, ctx.workspace.id),
        leads: await listLeadOptions(db, ctx.workspace.id),
        deals: await listDealOptions(db, ctx.workspace.id),
        companies: await listCompanyOptions(db, ctx.workspace.id),
      }}
    />
  );
}

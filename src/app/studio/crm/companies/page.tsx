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

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const rows = (await resolveRecordDataset(db, scope, "companies")).rows;
  const fields = datasetFields("companies");

  const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const openDeals = rows.reduce((sum, row) => sum + Number(row.openDeals ?? 0), 0);

  return (
    <RecordsView
      title="Companies"
      description="Accounts roll up their open deals and closed-won revenue from the shared dataset."
      entity="company"
      metrics={[
        { label: "Accounts", value: rows.length, format: "number", hint: "In this workspace" },
        { label: "Open deals", value: openDeals, format: "number", hint: "Across accounts" },
        { label: "Closed-won", value: totalRevenue, format: "currency", hint: "Lifetime in demo data" },
        { label: "Avg per account", value: rows.length ? Math.round(totalRevenue / rows.length) : 0, format: "currency", hint: "Won ÷ accounts" },
      ]}
      columns={fields}
      rows={rows}
      rowActions={[]}
      emptyHint="No companies yet."
      options={{
        owners: await listOwnerOptions(db, ctx.workspace.id),
        leads: await listLeadOptions(db, ctx.workspace.id),
        deals: await listDealOptions(db, ctx.workspace.id),
        companies: await listCompanyOptions(db, ctx.workspace.id),
      }}
    />
  );
}

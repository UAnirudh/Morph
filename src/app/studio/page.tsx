import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getActiveInterface } from "@/lib/morph/interfaces";
import { listProposals } from "@/lib/morph/engine";
import { resolveConfigData, resolveMetric } from "@/lib/crm/data";
import { buildSuggestions, STARTER_PROMPTS } from "@/lib/morph/suggestions";
import {
  listCompanyOptions,
  listDealOptions,
  listLeadOptions,
  listOwnerOptions,
} from "@/lib/crm/mutations";
import { providerModel } from "@/lib/morph/provider";
import type { JobRole, MetricKey } from "@/lib/morph/config";
import { StudioWorkspace } from "@/components/studio/workspace";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const role = ctx.preferences.job_role as JobRole;
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };

  const active = getActiveInterface(db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: role,
  });

  const data = resolveConfigData(db, scope, active.config.components);
  const history = listProposals(db, active.iface.id, 10);
  const dismissed = JSON.parse(ctx.preferences.dismissed_suggestions ?? "[]") as string[];

  const relevantMetrics: MetricKey[] = [
    "overdue_followups",
    "at_risk_deals",
    "task_due_today",
    "flagged_leads",
    "win_rate",
    "team_workload",
  ];
  const metrics = Object.fromEntries(
    relevantMetrics.map((key) => [key, resolveMetric(db, scope, key)]),
  ) as Partial<Record<MetricKey, number>>;

  const notifications = db
    .prepare(
      `SELECT id, title, body, kind, created_at AS createdAt, read_at AS readAt
       FROM notifications WHERE workspace_id = ? AND (user_id = ? OR user_id IS NULL)
       ORDER BY created_at DESC LIMIT 8`,
    )
    .all(ctx.workspace.id, ctx.user.id) as Array<{
    id: string;
    title: string;
    body: string;
    kind: string;
    createdAt: string;
    readAt: string | null;
  }>;

  const engineLabel = process.env.OPENAI_API_KEY ? providerModel() : "Local planner";

  return (
    <StudioWorkspace
      config={active.config}
      data={data}
      options={{
        owners: listOwnerOptions(db, ctx.workspace.id),
        leads: listLeadOptions(db, ctx.workspace.id),
        deals: listDealOptions(db, ctx.workspace.id),
        companies: listCompanyOptions(db, ctx.workspace.id),
      }}
      role={role}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      workspaceName={ctx.workspace.name}
      interfaceName={active.iface.name}
      history={history.map((item) => ({
        id: item.id,
        prompt: item.prompt,
        summary: item.summary,
        engineLabel: item.engineLabel,
        kind: item.kind,
        status: item.status,
        createdAt: item.createdAt,
        latencyMs: item.latencyMs,
        refusal: item.refusal,
        operationCount: item.operationCount,
      }))}
      suggestions={buildSuggestions({ role, metrics, dismissed })}
      starterPrompts={STARTER_PROMPTS[role]}
      engineLabel={engineLabel}
      notifications={notifications}
    />
  );
}

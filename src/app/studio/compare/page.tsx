import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getActiveInterface, getInterfaceByKind } from "@/lib/morph/interfaces";
import { resolveConfigData } from "@/lib/crm/data";
import { DEMO_SCENARIOS } from "@/lib/demo";
import { configuredEngineLabel } from "@/lib/morph/provider";
import type { JobRole } from "@/lib/morph/config";
import { CompareView } from "@/components/studio/compare-view";

export const metadata: Metadata = { title: "Before / after" };
export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const role = ctx.preferences.job_role as JobRole;
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };

  const personal = await getActiveInterface(db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: role,
  });
  const baseline = await getInterfaceByKind(db, ctx.workspace.id, "baseline");
  const demo = await getInterfaceByKind(db, ctx.workspace.id, "demo");

  if (!baseline || !demo) {
    return (
      <div className="px-6 py-10">
        <h1 className="text-lg font-semibold">Comparison unavailable</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This workspace has no baseline or demo interface. Create a new workspace to restore them.
        </p>
      </div>
    );
  }

  const demoRuns = await db
    .prepare(
      "SELECT scenario, engine, status, created_at AS createdAt FROM demo_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20",
    )
    .all(ctx.workspace.id) as Array<{ scenario: string; engine: string; status: string; createdAt: string }>;

  const latestByScenario = DEMO_SCENARIOS.map((scenario) =>
    demoRuns.find((run) => run.scenario === scenario.id),
  ).filter((run): run is { scenario: string; engine: string; status: string; createdAt: string } => Boolean(run));

  return (
    <CompareView
      personal={{
        config: personal.config,
        data: await resolveConfigData(db, scope, personal.config.components),
        label: "After · your interface",
        caption: `${personal.iface.name} · version ${personal.version.version}`,
      }}
      baseline={{
        config: baseline.config,
        data: await resolveConfigData(db, scope, baseline.config.components),
        label: "Before · classic CRM",
        caption: `${baseline.iface.name} · fixed nav, generic dashboard`,
      }}
      demo={{
        config: demo.config,
        data: await resolveConfigData(db, scope, demo.config.components),
        label: "After · demo interface",
        caption: `Shared demo surface · version ${demo.version.version}`,
      }}
      scenarios={DEMO_SCENARIOS}
      demoRuns={latestByScenario}
      engineLabel={configuredEngineLabel()}
      options={{ owners: [], leads: [], deals: [], companies: [] }}
      role={role}
      currentUserName={ctx.user.name}
    />
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { logEvent } from "@/lib/log";
import { providerModel } from "@/lib/morph/provider";
import { workflowDefinitionSchema } from "@/lib/workflows/schema";
import { WorkflowConsole, type WorkflowConsoleItem, type WorkflowRunItem } from "@/components/workflows/workflow-console";
import type { WorkflowRow } from "@/lib/db/types";

export const metadata: Metadata = { title: "Workflows" };
export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();

  const rows = db
    .prepare("SELECT * FROM workflow_definitions WHERE workspace_id = ? ORDER BY enabled DESC, updated_at DESC")
    .all(ctx.workspace.id) as WorkflowRow[];

  const workflows: WorkflowConsoleItem[] = [];
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.definition);
    } catch {
      logEvent("warn", { event: "workflow.definition.corrupt", workflowId: row.id });
      continue;
    }
    const definition = workflowDefinitionSchema.safeParse(parsed);
    if (!definition.success) continue;
    const lastRun = db
      .prepare("SELECT status FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(row.id) as { status: string } | undefined;
    workflows.push({
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled === 1,
      definition: definition.data,
      lastRunAt: row.last_run_at,
      updatedAt: row.updated_at,
      runCount:
        (db.prepare("SELECT COUNT(*) AS c FROM workflow_runs WHERE workflow_id = ?").get(row.id) as {
          c: number;
        }).c,
      lastRunStatus: lastRun?.status ?? null,
    });
  }

  const runRows = db
    .prepare(
      `SELECT r.id, r.trigger_type AS triggerType, r.status, r.matched, r.actions, r.created_at AS createdAt,
              r.duration_ms AS durationMs, r.error, w.name AS workflowName
       FROM workflow_runs r JOIN workflow_definitions w ON w.id = r.workflow_id
       WHERE r.workspace_id = ? ORDER BY r.created_at DESC LIMIT 25`,
    )
    .all(ctx.workspace.id) as Array<{
    id: string;
    triggerType: string;
    status: string;
    matched: number;
    actions: string;
    createdAt: string;
    durationMs: number;
    error: string | null;
    workflowName: string;
  }>;

  const runs: WorkflowRunItem[] = runRows.map((run) => {
    let counts: Record<string, number> = {};
    try {
      counts = JSON.parse(run.actions) as Record<string, number>;
    } catch {
      counts = {};
    }
    return {
      id: run.id,
      workflowName: run.workflowName,
      triggerType: run.triggerType,
      status: run.status,
      matched: run.matched,
      counts,
      createdAt: run.createdAt,
      durationMs: run.durationMs,
      note: run.error,
    };
  });

  const engineLabel = process.env.OPENAI_API_KEY ? providerModel() : "Local planner";

  return (
    <div className="px-4 py-5 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Workflows</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Trigger → condition → action automations that operate on the same records and permissions as
            the rest of the workspace. Definitions are stored, versioned by update, and every run is logged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/studio/compare" className="text-xs text-primary hover:underline">
            See before / after
          </Link>
        </div>
      </header>
      <div className="mt-4">
        <WorkflowConsole workflows={workflows} runs={runs} engineLabel={engineLabel} />
      </div>
    </div>
  );
}

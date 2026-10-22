import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { runDailyChecks } from "@/lib/workflows/engine";
import { logError, logEvent } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import type { WorkflowRow, WorkspaceRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Runs every enabled daily-check workflow.
 *
 * Auth options:
 *  - `Authorization: Bearer $MORPH_CRON_SECRET` (Vercel Cron / external scheduler)
 *  - a signed-in session (used by the in-app "run daily checks" button is a
 *    server action; this route exists for schedulers)
 */
export async function POST(request: Request) {
  const db = getDb();
  const secret = process.env.MORPH_CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const cronAuthorized = Boolean(secret) && header === `Bearer ${secret}`;
  let sessionUser: Awaited<ReturnType<typeof getSessionUser>> = null;

  if (!cronAuthorized) {
    sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (secret) {
      return NextResponse.json(
        { error: "This endpoint requires the scheduler secret." },
        { status: 403 },
      );
    }
  }

  const limit = rateLimit(`workflows:cron:${cronAuthorized ? "scheduler" : "session"}`, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many runs", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429 },
    );
  }

  // The scheduler secret may run every tenant's daily checks; a signed-in user may
  // only run the workspaces they belong to.
  const workspaces = cronAuthorized
    ? (db.prepare("SELECT * FROM workspaces").all() as WorkspaceRow[])
    : (db
        .prepare(
          "SELECT w.* FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE m.user_id = ?",
        )
        .all(sessionUser!.id) as WorkspaceRow[]);
  const results: Array<{
    workspaceId: string;
    workflow: string;
    matched: number;
    status: string;
    error?: string;
  }> = [];

  for (const workspace of workspaces) {
    const workflows = db
      .prepare(
        "SELECT * FROM workflow_definitions WHERE workspace_id = ? AND enabled = 1 AND trigger_type = 'daily_check' LIMIT 20",
      )
      .all(workspace.id) as WorkflowRow[];
    if (workflows.length === 0) continue;
    // Automation acts as the workflow owner, never as an arbitrary user.
    const actorId = workflows[0]?.created_by;
    if (!actorId) continue;
    try {
      for (const run of runDailyChecks({ db, workspaceId: workspace.id, actorId })) {
        results.push({
          workspaceId: workspace.id,
          workflow: run.workflowName,
          matched: run.matched,
          status: run.status,
          error: run.error,
        });
      }
    } catch (error) {
      logError("workflows.cron.failed", error, { workspaceId: workspace.id });
      results.push({
        workspaceId: workspace.id,
        workflow: "-",
        matched: 0,
        status: "failed",
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  logEvent("info", { event: "workflows.cron.run", workspaces: workspaces.length, results: results.length });
  return NextResponse.json({ ok: true, results });
}

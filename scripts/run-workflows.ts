/**
 * Run every enabled `daily_check` workflow. In production this is what a cron
 * job would call once a day; the in-app "Run now" button uses the same engine.
 *
 *   npm run workflows:run            # every workspace
 *   npm run workflows:run -- --dry  # evaluate and report without writing
 */
import { openDatabase, resolveDbPath } from "../src/lib/db/index";
import { runDailyChecks } from "../src/lib/workflows/engine";

const dryRun = process.argv.includes("--dry");
const db = openDatabase(resolveDbPath(), { seed: true });

const workspaces = db
  .prepare("SELECT id, name FROM workspaces ORDER BY created_at")
  .all() as Array<{ id: string; name: string }>;

if (workspaces.length === 0) {
  console.log("No workspaces found — run `npm run db:seed` first.");
  db.close();
  process.exit(0);
}

let total = 0;
for (const workspace of workspaces) {
  const owner = db
    .prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? ORDER BY created_at LIMIT 1")
    .get(workspace.id) as { user_id: string } | undefined;
  if (!owner) continue;

  const results = runDailyChecks({
    db,
    workspaceId: workspace.id,
    actorId: owner.user_id,
    dryRun,
  });
  total += results.length;
  for (const result of results) {
    console.log(
      [
        workspace.name,
        result.runId,
        result.status,
        `matched=${result.matched}`,
        `tasks=${result.counts.tasks}`,
        `updates=${result.counts.updates}`,
        `flags=${result.counts.flags}`,
        `notifications=${result.counts.notifications}`,
      ].join("  "),
    );
  }
}

console.log(`${dryRun ? "Evaluated" : "Ran"} ${total} workflow(s).`);
db.close();

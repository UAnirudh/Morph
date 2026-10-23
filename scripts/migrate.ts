import { getDb, resolveDbConfig } from "../src/lib/db/index";
import { LATEST_MIGRATION } from "../src/lib/db/migrations";

async function main() {
  const config = resolveDbConfig();
  const db = getDb();
  const applied = await db
    .prepare<[], { id: string }>("SELECT id FROM _migrations ORDER BY id")
    .all();

  console.log(`Database: ${config.url}`);
  console.log(`Migrations applied: ${applied.map((row) => row.id).join(", ") || "none"}`);
  console.log(`Schema at: ${LATEST_MIGRATION}`);
  db.client.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

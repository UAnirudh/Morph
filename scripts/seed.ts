import { getDb, resolveDbConfig } from "../src/lib/db/index";
import { DEMO_EMAIL } from "../src/lib/db/seed";

async function main() {
  const config = resolveDbConfig();
  const db = getDb();

  const count = async (table: string) => {
    const row = await db.prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM ${table}`).get();
    return row?.c ?? 0;
  };

  console.log(`Database: ${config.url}`);
  console.log(
    `users=${await count("users")} workspaces=${await count("workspaces")} leads=${await count("leads")} ` +
      `deals=${await count("deals")} tasks=${await count("tasks")} activities=${await count("activities")} ` +
      `workflows=${await count("workflow_definitions")} interfaces=${await count("interfaces")} ` +
      `versions=${await count("interface_versions")}`,
  );
  console.log(`Demo login: ${DEMO_EMAIL} / ${process.env.MORPH_DEMO_PASSWORD ?? "morph-demo"}`);
  db.client.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

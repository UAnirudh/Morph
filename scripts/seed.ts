import { openDatabase, resolveDbPath } from "../src/lib/db/index";
import { DEMO_EMAIL } from "../src/lib/db/seed";

const file = process.argv[2] ?? resolveDbPath();
const db = openDatabase(file, { seed: true });

function count(table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

console.log(`Database: ${file}`);
console.log(
  [
    `users=${count("users")}`,
    `workspaces=${count("workspaces")}`,
    `leads=${count("leads")}`,
    `deals=${count("deals")}`,
    `tasks=${count("tasks")}`,
    `activities=${count("activities")}`,
    `workflows=${count("workflow_definitions")}`,
    `interfaces=${count("interfaces")}`,
    `versions=${count("interface_versions")}`,
  ].join(" "),
);
console.log(`Demo login: ${DEMO_EMAIL} / ${process.env.MORPH_DEMO_PASSWORD ?? "morph-demo"}`);
db.close();

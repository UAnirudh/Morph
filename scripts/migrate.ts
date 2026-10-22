import { openDatabase, resolveDbPath } from "../src/lib/db/index";
import { LATEST_MIGRATION } from "../src/lib/db/migrations";

const file = process.argv[2] ?? resolveDbPath();
const db = openDatabase(file);
const applied = db.prepare<[], { id: string }>("SELECT id FROM _migrations ORDER BY id").all();
console.log(`Database: ${file}`);
console.log(`Migrations applied: ${applied.map((row) => row.id).join(", ") || "none"}`);
console.log(`Schema at: ${LATEST_MIGRATION}`);
db.close();

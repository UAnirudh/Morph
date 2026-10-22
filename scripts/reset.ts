/**
 * Rebuild the local database from scratch: migrations + deterministic demo seed.
 *
 *   npm run db:reset            # uses MORPH_DB_PATH or ./data/morph.db
 *   npm run db:reset -- ./data/e2e.db
 *
 * Destructive by design — it only ever targets the SQLite file you name, and it
 * refuses to touch a file outside the project directory.
 */
import fs from "node:fs";
import path from "node:path";
import { openDatabase, resolveDbPath } from "../src/lib/db/index";
import { DEMO_EMAIL } from "../src/lib/db/seed";

const target = process.argv[2] ?? resolveDbPath();
const absolute = path.resolve(target);
const root = process.cwd();

if (!absolute.startsWith(root + path.sep) && absolute !== root) {
  console.error(`Refusing to reset ${absolute}: it is outside ${root}.`);
  process.exit(1);
}

for (const suffix of ["", "-wal", "-shm"]) {
  const file = absolute + suffix;
  if (fs.existsSync(file)) fs.rmSync(file);
}

const db = openDatabase(absolute, { seed: true });
const leads = (db.prepare("SELECT COUNT(*) AS c FROM leads").get() as { c: number }).c;
const versions = (db.prepare("SELECT COUNT(*) AS c FROM interface_versions").get() as { c: number }).c;
db.close();

console.log(`Reset ${absolute}`);
console.log(`Seeded ${leads} leads and ${versions} interface version(s).`);
console.log(`Demo login: ${DEMO_EMAIL} / ${process.env.MORPH_DEMO_PASSWORD ?? "morph-demo"}`);

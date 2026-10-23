/**
 * Rebuild the local database from scratch: migrations + deterministic demo seed.
 *
 *   npm run db:reset            # uses MORPH_DB_PATH or ./data/morph.db
 *   npm run db:reset -- ./data/e2e.db
 *
 * Destructive by design — it only ever targets the SQLite file you name, and it
 * refuses to touch a file outside the project directory. Hosted databases are
 * refused outright: resetting one would wipe real data.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb, resolveDbConfig, resolveDbPath } from "../src/lib/db/index";
import { DEMO_EMAIL } from "../src/lib/db/seed";

async function main() {
  if (resolveDbConfig().kind === "remote") {
    console.error(
      "Refusing to reset a hosted database. Unset TURSO_DATABASE_URL to work on a local file.",
    );
    process.exit(1);
  }

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

  process.env.MORPH_DB_PATH = absolute;
  const db = getDb();
  const leads = (await db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM leads").get())?.c ?? 0;
  const versions =
    (await db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM interface_versions").get())?.c ?? 0;
  db.client.close();

  console.log(`Reset ${absolute}`);
  console.log(`Seeded ${leads} leads and ${versions} interface version(s).`);
  console.log(`Demo login: ${DEMO_EMAIL} / ${process.env.MORPH_DEMO_PASSWORD ?? "morph-demo"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

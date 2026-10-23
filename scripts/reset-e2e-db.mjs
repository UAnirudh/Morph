/**
 * Deletes the E2E database *before* the dev server opens it.
 *
 * Order matters: unlinking a database file while a server holds it open makes
 * the server keep writing to the deleted inode while new connections see an
 * empty file. Running this from the Playwright `webServer.command` guarantees
 * the file is gone before any connection exists.
 */
import fs from "node:fs";
import path from "node:path";

const base = path.join(process.cwd(), "data", "e2e.db");
for (const suffix of ["", "-wal", "-shm"]) {
  const file = base + suffix;
  if (fs.existsSync(file)) fs.rmSync(file);
}

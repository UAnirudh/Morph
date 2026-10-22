import fs from "node:fs";
import path from "node:path";

/** Start every E2E run from a freshly seeded database. */
export default function globalSetup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = path.join(process.cwd(), "data", `e2e.db${suffix}`);
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}

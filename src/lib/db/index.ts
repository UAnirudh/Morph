import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrations } from "./migrations";
import { seedDemoWorkspace } from "./seed";

const globalForDb = globalThis as unknown as {
  __morphDb?: Database.Database;
  __morphDbPath?: string;
};

export function resolveDbPath(): string {
  const configured = process.env.MORPH_DB_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  return path.join(process.cwd(), "data", "morph.db");
}

export function applyMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    db.prepare<[], { id: string }>("SELECT id FROM _migrations").all().map((r) => r.id),
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        new Date().toISOString(),
      );
    });
    run();
  }
}

export function openDatabase(file: string, options: { seed?: boolean } = {}): Database.Database {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  applyMigrations(db);
  if (options.seed) {
    const users = db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM users").get();
    if (!users || users.c === 0) {
      seedDemoWorkspace(db);
    }
  }
  return db;
}

export function getDb(): Database.Database {
  const file = resolveDbPath();
  const existing = globalForDb.__morphDb;
  if (existing && globalForDb.__morphDbPath === file && existing.open) return existing;
  const db = openDatabase(file, { seed: true });
  // Reuse the connection across hot reloads in development.
  globalForDb.__morphDb = db;
  globalForDb.__morphDbPath = file;
  return db;
}

/** Fresh in-memory database for tests (migrated, optionally seeded). */
export function createTestDb(options: { seed?: boolean } = {}): Database.Database {
  const db = new Database(":memory:");
  applyMigrations(db);
  if (options.seed !== false) seedDemoWorkspace(db);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

export function fromBool(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

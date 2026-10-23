import { createClient, type Client, type InValue, type ResultSet } from "@libsql/client";
import path from "node:path";
import { migrations } from "./migrations";
import { seedDemoWorkspace } from "./seed";

/**
 * Data access layer.
 *
 * Morph talks to SQLite through libSQL so the exact same SQL runs in two places:
 * a local `file:` database during development and Turso (hosted libSQL) in a
 * serverless deployment, where a process-local file cannot survive between
 * invocations. The adapter below gives the rest of the app a small, promise
 * based API (`prepare(...).get/all/run`, `exec`, `transaction`) instead of
 * leaking the client library everywhere.
 */

export type SqlArg = InValue | boolean | undefined | Date;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint | null;
}

export interface Statement<Row = Record<string, unknown>> {
  get<T = Row>(...args: SqlArg[]): Promise<T | undefined>;
  all<T = Row>(...args: SqlArg[]): Promise<T[]>;
  run(...args: SqlArg[]): Promise<RunResult>;
}

export interface Db {
  prepare<Params extends SqlArg[] = SqlArg[], Row = Record<string, unknown>>(
    sql: string,
  ): Statement<Row>;
  /** Run one or more statements separated by semicolons. */
  exec(sql: string): Promise<void>;
  /** Interactive write transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  /** Escape hatch for code that genuinely needs the raw client. */
  readonly client: Client;
  readonly kind: "file" | "remote";
}

interface Executor {
  execute(stmt: { sql: string; args: InValue[] }): Promise<ResultSet>;
  execMultiple(sql: string): Promise<void>;
}

const globalForDb = globalThis as unknown as {
  __morphClient?: Client;
  __morphDb?: Db;
  __morphDbKey?: string;
  __morphReady?: Promise<void>;
};

export function resolveDbPath(): string {
  const configured = process.env.MORPH_DB_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  return path.join(process.cwd(), "data", "morph.db");
}

interface DbConfig {
  url: string;
  authToken?: string;
  kind: "file" | "remote";
  key: string;
}

/**
 * `TURSO_DATABASE_URL` (or a `libsql://` URL in `MORPH_DB_PATH`) selects a
 * hosted database. Everything else falls back to a local file.
 */
export function resolveDbConfig(): DbConfig {
  const urls = [process.env.TURSO_DATABASE_URL, process.env.MORPH_DATABASE_URL, process.env.MORPH_DB_PATH];
  const token = process.env.TURSO_AUTH_TOKEN?.trim() || process.env.MORPH_DB_AUTH_TOKEN?.trim() || undefined;
  for (const candidate of urls) {
    const url = candidate?.trim();
    if (!url) continue;
    if (/^(libsql|https?|wss?):\/\//.test(url) && !url.startsWith("https://data")) {
      return { url, authToken: token, kind: "remote", key: `remote:${url}` };
    }
  }
  if (process.env.VERCEL) {
    throw new Error(
      "No hosted database configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your Vercel project — " +
        "a serverless deployment cannot keep a local SQLite file. See docs/DEPLOYMENT.md.",
    );
  }
  const file = resolveDbPath();
  return { url: `file:${file}`, kind: "file", key: `file:${file}` };
}

function toInValues(args: SqlArg[]): InValue[] {
  return args.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

function toRunResult(result: ResultSet): RunResult {
  return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid ?? null };
}

function createDb(executor: Executor, client: Client, kind: DbConfig["kind"], ready: Promise<void>): Db {
  const prepare: Db["prepare"] = (sql: string) => ({
    async get<T>(...args: SqlArg[]): Promise<T | undefined> {
      await ready;
      const result = await executor.execute({ sql, args: toInValues(args) });
      const row = result.rows[0];
      // libSQL rows carry a null prototype; React refuses to serialize those
      // across the server/client boundary. Copy into plain objects.
      return row ? ({ ...row } as unknown as T) : undefined;
    },
    async all<T>(...args: SqlArg[]): Promise<T[]> {
      await ready;
      const result = await executor.execute({ sql, args: toInValues(args) });
      return result.rows.map((row) => ({ ...row })) as unknown as T[];
    },
    async run(...args: SqlArg[]): Promise<RunResult> {
      await ready;
      return toRunResult(await executor.execute({ sql, args: toInValues(args) }));
    },
  });

  return {
    prepare,
    async exec(sql: string): Promise<void> {
      await ready;
      await executor.execMultiple(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      await ready;
      const transaction = await client.transaction("write");
      const tx = createDb(
        {
          execute: (stmt) => transaction.execute(stmt),
          execMultiple: (sql) => transaction.executeMultiple(sql),
        },
        client,
        kind,
        Promise.resolve(),
      );
      try {
        const result = await fn(tx);
        await transaction.commit();
        return result;
      } catch (error) {
        await transaction.rollback().catch(() => undefined);
        throw error;
      } finally {
        transaction.close();
      }
    },
    client,
    kind,
  };
}

async function configureLocalFile(client: Client): Promise<void> {
  // Pragmas that matter for concurrent writers on a local file. Turso manages
  // this server side, so they are skipped for remote databases.
  for (const pragma of ["journal_mode = WAL", "foreign_keys = ON", "busy_timeout = 5000"]) {
    try {
      await client.execute(`PRAGMA ${pragma}`);
    } catch {
      // Pragmas are best-effort: an unsupported one must not stop startup.
    }
  }
}

/** Apply pending migrations. Exported for scripts and tests. */
export async function applyMigrations(db: Db): Promise<void> {
  if (db.kind === "file") await configureLocalFile(db.client);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (await db.prepare<[], { id: string }>("SELECT id FROM _migrations").all()).map((row) => row.id),
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx
        .prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, new Date().toISOString());
    });
  }
}

/** Seed the demo workspace when the database is empty. */
export async function ensureSeed(db: Db): Promise<void> {
  const row = await db.prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM users").get();
  if (!row || row.c === 0) {
    await seedDemoWorkspace(db);
  }
}

function clientFor(config: DbConfig): Client {
  // Keep one client per process/URL: serverless invocations reuse the module.
  if (globalForDb.__morphClient && globalForDb.__morphDbKey === config.key && !globalForDb.__morphClient.closed) {
    return globalForDb.__morphClient;
  }
  const client = createClient({
    url: config.url,
    authToken: config.authToken,
    timeout: config.kind === "file" ? 5000 : undefined,
  });
  globalForDb.__morphClient = client;
  globalForDb.__morphDbKey = config.key;
  globalForDb.__morphReady = undefined;
  return client;
}

/**
 * The application database. Schema creation and seeding run once per process,
 * lazily, so every caller can just await its query.
 */
export function getDb(): Db {
  const config = resolveDbConfig();
  const client = clientFor(config);
  if (!globalForDb.__morphDb || globalForDb.__morphDb.client !== client) {
    const ready = (async () => {
      const db = createDb(
        { execute: (stmt) => client.execute(stmt), execMultiple: (sql) => client.executeMultiple(sql) },
        client,
        config.kind,
        Promise.resolve(),
      );
      await applyMigrations(db);
      await ensureSeed(db);
    })();
    globalForDb.__morphReady = ready;
    globalForDb.__morphDb = createDb(
      { execute: (stmt) => client.execute(stmt), execMultiple: (sql) => client.executeMultiple(sql) },
      client,
      config.kind,
      ready,
    );
  }
  return globalForDb.__morphDb;
}

/** Fresh in-memory database for tests (migrated, optionally seeded). */
export async function createTestDb(options: { seed?: boolean } = {}): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  const db = createDb(
    { execute: (stmt) => client.execute(stmt), execMultiple: (sql) => client.executeMultiple(sql) },
    client,
    "file",
    Promise.resolve(),
  );
  await configureLocalFile(client);
  await applyMigrations(db);
  if (options.seed !== false) await seedDemoWorkspace(db);
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

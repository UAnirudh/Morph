import { afterEach, describe, expect, it } from "vitest";
import { resolveDbConfig } from "@/lib/db";

/**
 * Database target selection without touching a database: proves the same build
 * uses a local file in development and a hosted libSQL URL on Vercel, and that
 * a serverless deployment without a hosted URL fails loudly instead of silently
 * writing to a file that vanishes after the request.
 */
const KEYS = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "MORPH_DATABASE_URL",
  "MORPH_DB_AUTH_TOKEN",
  "MORPH_DB_PATH",
  "VERCEL",
] as const;

function resetEnv() {
  for (const key of KEYS) delete process.env[key];
}

afterEach(resetEnv);

describe("database target", () => {
  it("defaults to the local file database", () => {
    const config = resolveDbConfig();
    expect(config.kind).toBe("file");
    expect(config.url.startsWith("file:")).toBe(true);
    expect(config.url.endsWith("data/morph.db")).toBe(true);
  });

  it("uses Turso when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set", () => {
    process.env.TURSO_DATABASE_URL = "libsql://morph-test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "token";
    const config = resolveDbConfig();
    expect(config).toMatchObject({
      kind: "remote",
      url: "libsql://morph-test.turso.io",
      authToken: "token",
    });
  });

  it("treats a libsql:// MORPH_DB_PATH as a hosted database", () => {
    process.env.MORPH_DB_PATH = "libsql://morph-alias.turso.io";
    expect(resolveDbConfig().kind).toBe("remote");
  });

  it("keeps a plain MORPH_DB_PATH as a local file", () => {
    process.env.MORPH_DB_PATH = "./tmp/custom.db";
    const config = resolveDbConfig();
    expect(config.kind).toBe("file");
    expect(config.url).toContain("custom.db");
  });

  it("fails loudly on Vercel without a hosted database", () => {
    process.env.VERCEL = "1";
    expect(() => resolveDbConfig()).toThrowError(/TURSO_DATABASE_URL/);
  });

  it("still accepts a hosted database on Vercel", () => {
    process.env.VERCEL = "1";
    process.env.TURSO_DATABASE_URL = "libsql://morph-test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "token";
    expect(resolveDbConfig().kind).toBe("remote");
  });
});

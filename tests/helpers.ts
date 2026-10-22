import type Database from "better-sqlite3";
import { createTestDb } from "@/lib/db";
import type { JobRole, PreferencesRow, UserRow, WorkspaceRow } from "@/lib/db/types";

export interface TestContext {
  db: Database.Database;
  user: UserRow;
  workspace: WorkspaceRow;
  preferences: PreferencesRow;
  role: JobRole;
  scope: { workspaceId: string; userId: string };
}

export function seededContext(): TestContext {
  const db = createTestDb({ seed: true });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get("demo@morph.app") as UserRow;
  const workspace = db
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get("ws_demo_acme") as WorkspaceRow;
  const preferences = db
    .prepare("SELECT * FROM user_preferences WHERE user_id = ? AND workspace_id = ?")
    .get(user.id, workspace.id) as PreferencesRow;
  return {
    db,
    user,
    workspace,
    preferences,
    role: preferences.job_role as JobRole,
    scope: { workspaceId: workspace.id, userId: user.id },
  };
}

export function count(db: Database.Database, table: string, where = "1=1", params: unknown[] = []): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get(...params) as { c: number };
  return row.c;
}

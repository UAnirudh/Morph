import { createTestDb, type Db, type SqlArg } from "@/lib/db";
import type { JobRole, PreferencesRow, UserRow, WorkspaceRow } from "@/lib/db/types";

export interface TestContext {
  db: Db;
  user: UserRow;
  workspace: WorkspaceRow;
  preferences: PreferencesRow;
  role: JobRole;
  scope: { workspaceId: string; userId: string };
}

export async function seededContext(): Promise<TestContext> {
  const db = await createTestDb({ seed: true });
  const user = (await db
    .prepare<[], UserRow>("SELECT * FROM users WHERE email = ?")
    .get("demo@morph.app"))!;
  const workspace = (await db
    .prepare<[], WorkspaceRow>("SELECT * FROM workspaces WHERE id = ?")
    .get("ws_demo_acme"))!;
  const preferences = (await db
    .prepare<[], PreferencesRow>("SELECT * FROM user_preferences WHERE user_id = ? AND workspace_id = ?")
    .get(user.id, workspace.id))!;
  return {
    db,
    user,
    workspace,
    preferences,
    role: preferences.job_role as JobRole,
    scope: { workspaceId: workspace.id, userId: user.id },
  };
}

export async function count(
  db: Db,
  table: string,
  where = "1=1",
  params: unknown[] = [],
): Promise<number> {
  const row = await db
    .prepare<SqlArg[], { c: number }>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`)
    .get(...(params as SqlArg[]));
  return row?.c ?? 0;
}

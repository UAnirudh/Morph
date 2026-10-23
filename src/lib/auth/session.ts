import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { getDb, parseJson } from "@/lib/db";
import type {
  JobRole,
  MembershipRow,
  PreferencesRow,
  SessionUser,
  WorkspaceContext,
  WorkspaceRow,
} from "@/lib/db/types";

export const SESSION_COOKIE = "morph_session";
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const id = hashToken(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    expires.toISOString(),
    new Date().toISOString(),
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  }
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.avatar_color AS avatarColor, s.expires_at AS expiresAt
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(hashToken(token)) as
    | { id: string; email: string; name: string; avatarColor: string; expiresAt: string }
    | undefined;
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, avatarColor: row.avatarColor };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function defaultPreferences(userId: string, workspaceId: string): PreferencesRow {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    workspace_id: workspaceId,
    job_role: "general",
    primary_goals: "[]",
    density: "comfortable",
    preferred_metrics: "[]",
    accessibility: "{}",
    active_interface_id: null,
    onboarding_complete: 0,
    dismissed_suggestions: "[]",
    created_at: now,
    updated_at: now,
  };
}

export async function getWorkspaceContext(options: { requireOnboarded?: boolean } = {}): Promise<WorkspaceContext> {
  const user = await requireUser();
  const db = getDb();
  const membership = await db
    .prepare(
      `SELECT * FROM workspace_members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`,
    )
    .get(user.id) as MembershipRow | undefined;

  if (!membership) redirect("/onboarding");

  const workspace = await db
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(membership.workspace_id) as WorkspaceRow;

  let preferences = await db
    .prepare("SELECT * FROM user_preferences WHERE user_id = ? AND workspace_id = ?")
    .get(user.id, workspace.id) as PreferencesRow | undefined;

  if (!preferences) {
    const fallback = defaultPreferences(user.id, workspace.id);
    await db.prepare(
      `INSERT INTO user_preferences (user_id, workspace_id, job_role, primary_goals, density, preferred_metrics, accessibility, active_interface_id, onboarding_complete, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      fallback.user_id,
      fallback.workspace_id,
      fallback.job_role,
      fallback.primary_goals,
      fallback.density,
      fallback.preferred_metrics,
      fallback.accessibility,
      fallback.active_interface_id,
      fallback.onboarding_complete,
      fallback.created_at,
      fallback.updated_at,
    );
    preferences = fallback;
  }

  if (options.requireOnboarded && preferences.onboarding_complete !== 1) {
    redirect("/onboarding");
  }

  const teammates = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.avatar_color AS avatarColor, m.job_role AS jobRole, m.role
       FROM workspace_members m JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ? ORDER BY m.role = 'owner' DESC, u.name ASC`,
    )
    .all(workspace.id) as Array<SessionUser & { jobRole: JobRole; role: string }>;

  return { workspace, membership, user, preferences, teammates };
}

export function getPreferencesGoals(preferences: PreferencesRow): string[] {
  return parseJson<string[]>(preferences.primary_goals, []);
}

export function getAccessibility(preferences: PreferencesRow) {
  return parseJson<{
    fontSize?: "base" | "lg" | "xl";
    highContrast?: boolean;
    reduceMotion?: boolean;
    reduceClutter?: boolean;
  }>(preferences.accessibility, {});
}

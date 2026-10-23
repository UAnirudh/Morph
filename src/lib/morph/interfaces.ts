import "server-only";
import type { Db } from "@/lib/db";
import { newId, nowIso, parseJson } from "@/lib/db";
import type {
  InterfaceRow,
  InterfaceVersionRow,
  JobRole,
  PreferencesRow,
  VersionSource,
} from "@/lib/db/types";
import { logEvent } from "@/lib/log";
import { morphConfigSchema, type MorphConfig } from "./config";
import { rolePresetConfig } from "./presets";

export interface InterfaceSnapshot {
  iface: InterfaceRow;
  version: InterfaceVersionRow;
  config: MorphConfig;
}

export function parseStoredConfig(raw: string, fallback: MorphConfig): MorphConfig {
  const parsed = morphConfigSchema.safeParse(parseJson<unknown>(raw, null));
  if (!parsed.success) {
    logEvent("warn", {
      event: "morph.config.invalid",
      issues: parsed.error.issues.slice(0, 4).map((issue) => issue.message),
    });
    return fallback;
  }
  return parsed.data;
}

export async function getInterface(db: Db, interfaceId: string): Promise<InterfaceRow | null> {
  return (
    (await db.prepare("SELECT * FROM interfaces WHERE id = ?").get(interfaceId) as InterfaceRow | undefined) ??
    null
  );
}

export async function getCurrentVersion(
  db: Db,
  interfaceId: string,
): Promise<InterfaceVersionRow | null> {
  return (
    (await db
      .prepare(
        "SELECT * FROM interface_versions WHERE interface_id = ? AND is_current = 1 ORDER BY version DESC LIMIT 1",
      )
      .get(interfaceId) as InterfaceVersionRow | undefined) ?? null
  );
}

export async function getSnapshot(db: Db, interfaceId: string): Promise<InterfaceSnapshot | null> {
  const iface = await getInterface(db, interfaceId);
  if (!iface) return null;
  const version = await getCurrentVersion(db, interfaceId);
  if (!version) return null;
  const config = parseStoredConfig(version.config, rolePresetConfig("general"));
  return { iface, version, config };
}

export async function ensurePersonalInterface(
  db: Db,
  input: { workspaceId: string; userId: string; jobRole: JobRole },
): Promise<InterfaceRow> {
  const existing = await db
    .prepare(
      "SELECT * FROM interfaces WHERE workspace_id = ? AND owner_id = ? AND kind = 'personal' LIMIT 1",
    )
    .get(input.workspaceId, input.userId) as InterfaceRow | undefined;
  if (existing) return existing;

  const id = newId();
  const now = nowIso();
  const config = rolePresetConfig(input.jobRole);
  await db.prepare(
    `INSERT INTO interfaces (id, workspace_id, name, slug, kind, owner_id, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'personal', ?, 0, ?, ?)`,
  ).run(id, input.workspaceId, config.name, `personal-${input.userId.slice(0, 6)}`, input.userId, now, now);
  await db.prepare(
    `INSERT INTO interface_versions (id, interface_id, workspace_id, version, config, summary, source, created_by, is_current, created_at)
     VALUES (?, ?, ?, 1, ?, ?, 'template', ?, 1, ?)`,
  ).run(
    newId(),
    id,
    input.workspaceId,
    JSON.stringify(config),
    "Initial layout from your role template.",
    input.userId,
    now,
  );
  return getInterface(db, id) as Promise<InterfaceRow>;
}

export async function getActiveInterface(
  db: Db,
  input: { workspaceId: string; userId: string; preferences: PreferencesRow; jobRole: JobRole },
): Promise<InterfaceSnapshot> {
  let interfaceId = input.preferences.active_interface_id;
  const active = interfaceId ? await getSnapshot(db, interfaceId) : null;
  if (active && active.iface.workspace_id === input.workspaceId) return active;

  const personal = await ensurePersonalInterface(db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    jobRole: input.jobRole,
  });
  await db
    .prepare(
      "UPDATE user_preferences SET active_interface_id = ?, updated_at = ? WHERE user_id = ? AND workspace_id = ?",
    )
    .run(personal.id, nowIso(), input.userId, input.workspaceId);
  return (await getSnapshot(db, personal.id))!;
}

export async function getInterfaceByKind(
  db: Db,
  workspaceId: string,
  kind: "baseline" | "demo",
): Promise<InterfaceSnapshot | null> {
  const row = await db
    .prepare("SELECT id FROM interfaces WHERE workspace_id = ? AND kind = ? ORDER BY created_at ASC LIMIT 1")
    .get(workspaceId, kind) as { id: string } | undefined;
  return row ? await getSnapshot(db, row.id) : null;
}

export async function saveVersion(
  db: Db,
  input: {
    interfaceId: string;
    workspaceId: string;
    config: MorphConfig;
    summary: string;
    source: VersionSource;
    userId: string;
  },
): Promise<InterfaceSnapshot> {
  const validated = morphConfigSchema.parse(input.config);
  const latest = await db
    .prepare("SELECT MAX(version) AS v FROM interface_versions WHERE interface_id = ?")
    .get(input.interfaceId) as { v: number | null };
  const nextVersion = (latest.v ?? 0) + 1;
  const id = newId();
  const now = nowIso();
  const run = db.transaction(async (db) => {
    await db.prepare("UPDATE interface_versions SET is_current = 0 WHERE interface_id = ?").run(input.interfaceId);
    await db.prepare(
      `INSERT INTO interface_versions (id, interface_id, workspace_id, version, config, summary, source, created_by, is_current, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      id,
      input.interfaceId,
      input.workspaceId,
      nextVersion,
      JSON.stringify(validated),
      input.summary.slice(0, 240),
      input.source,
      input.userId,
      now,
    );
    await db.prepare("UPDATE interfaces SET name = ?, updated_at = ? WHERE id = ?").run(
      validated.name,
      now,
      input.interfaceId,
    );
  });
  await run;
  return (await getSnapshot(db, input.interfaceId))!;
}

export async function listVersions(
  db: Db,
  interfaceId: string,
  limit = 25,
): Promise<Array<InterfaceVersionRow & { createdByName: string | null }>> {
  return await db
    .prepare(
      `SELECT v.*, u.name AS createdByName FROM interface_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.interface_id = ? ORDER BY v.version DESC LIMIT ?`,
    )
    .all(interfaceId, limit) as Array<InterfaceVersionRow & { createdByName: string | null }>;
}

export async function listWorkspaceInterfaces(
  db: Db,
  workspaceId: string,
  userId: string,
) {
  return await db
    .prepare(
      `SELECT i.*, u.name AS ownerName,
         (SELECT COUNT(*) FROM interface_versions v WHERE v.interface_id = i.id) AS versionCount,
         (SELECT MAX(created_at) FROM interface_versions v WHERE v.interface_id = i.id) AS lastUpdatedAt
       FROM interfaces i LEFT JOIN users u ON u.id = i.owner_id
       WHERE i.workspace_id = ? AND (i.owner_id IS NULL OR i.owner_id = ?)
       ORDER BY i.kind = 'baseline' DESC, i.updated_at DESC`,
    )
    .all(workspaceId, userId) as Array<
    InterfaceRow & {
      ownerName: string | null;
      versionCount: number;
      lastUpdatedAt: string | null;
    }
  >;
}

export async function previousVersion(
  db: Db,
  interfaceId: string,
): Promise<InterfaceVersionRow | null> {
  const current = await getCurrentVersion(db, interfaceId);
  if (!current) return null;
  return (
    (await db
      .prepare(
        "SELECT * FROM interface_versions WHERE interface_id = ? AND version < ? ORDER BY version DESC LIMIT 1",
      )
      .get(interfaceId, current.version) as InterfaceVersionRow | undefined) ?? null
  );
}

/** Undo = re-apply the previous config as a new version, never history rewriting. */
export async function undoLastChange(
  db: Db,
  input: { interfaceId: string; workspaceId: string; userId: string },
): Promise<InterfaceSnapshot> {
  const previous = await previousVersion(db, input.interfaceId);
  if (!previous) {
    throw new Error("There is no earlier version to undo to.");
  }
  const config = parseStoredConfig(previous.config, rolePresetConfig("general"));
  return saveVersion(db, {
    interfaceId: input.interfaceId,
    workspaceId: input.workspaceId,
    config,
    summary: `Undo — restored version ${previous.version}.`,
    source: "undo",
    userId: input.userId,
  });
}

export async function restoreVersion(
  db: Db,
  input: { versionId: string; workspaceId: string; userId: string },
): Promise<InterfaceSnapshot> {
  const version = await db
    .prepare("SELECT * FROM interface_versions WHERE id = ? AND workspace_id = ?")
    .get(input.versionId, input.workspaceId) as InterfaceVersionRow | undefined;
  if (!version) throw new Error("That version does not exist in this workspace.");
  const config = parseStoredConfig(version.config, rolePresetConfig("general"));
  return saveVersion(db, {
    interfaceId: version.interface_id,
    workspaceId: input.workspaceId,
    config,
    summary: `Restored version ${version.version}${version.summary ? ` — ${version.summary}` : ""}`,
    source: "restore",
    userId: input.userId,
  });
}

/* -------------------------------------------------------------------------- */
/* Response shape helpers                                                     */
/* -------------------------------------------------------------------------- */

export interface VersionSummaryDTO {
  id: string;
  version: number;
  summary: string;
  source: VersionSource;
  createdAt: string;
  createdByName: string | null;
  isCurrent: boolean;
  componentCount: number;
}

export function toVersionDTO(
  db: Db,
  row: InterfaceVersionRow & { createdByName?: string | null },
): VersionSummaryDTO {
  const parsed = morphConfigSchema.safeParse(parseJson<unknown>(row.config, null));
  return {
    id: row.id,
    version: row.version,
    summary: row.summary,
    source: row.source,
    createdAt: row.created_at,
    createdByName: row.createdByName ?? null,
    isCurrent: row.is_current === 1,
    componentCount: parsed.success ? parsed.data.components.length : 0,
  };
}

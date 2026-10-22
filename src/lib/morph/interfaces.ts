import "server-only";
import type Database from "better-sqlite3";
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

export function getInterface(db: Database.Database, interfaceId: string): InterfaceRow | null {
  return (
    (db.prepare("SELECT * FROM interfaces WHERE id = ?").get(interfaceId) as InterfaceRow | undefined) ??
    null
  );
}

export function getCurrentVersion(
  db: Database.Database,
  interfaceId: string,
): InterfaceVersionRow | null {
  return (
    (db
      .prepare(
        "SELECT * FROM interface_versions WHERE interface_id = ? AND is_current = 1 ORDER BY version DESC LIMIT 1",
      )
      .get(interfaceId) as InterfaceVersionRow | undefined) ?? null
  );
}

export function getSnapshot(db: Database.Database, interfaceId: string): InterfaceSnapshot | null {
  const iface = getInterface(db, interfaceId);
  if (!iface) return null;
  const version = getCurrentVersion(db, interfaceId);
  if (!version) return null;
  const config = parseStoredConfig(version.config, rolePresetConfig("general"));
  return { iface, version, config };
}

export function ensurePersonalInterface(
  db: Database.Database,
  input: { workspaceId: string; userId: string; jobRole: JobRole },
): InterfaceRow {
  const existing = db
    .prepare(
      "SELECT * FROM interfaces WHERE workspace_id = ? AND owner_id = ? AND kind = 'personal' LIMIT 1",
    )
    .get(input.workspaceId, input.userId) as InterfaceRow | undefined;
  if (existing) return existing;

  const id = newId();
  const now = nowIso();
  const config = rolePresetConfig(input.jobRole);
  db.prepare(
    `INSERT INTO interfaces (id, workspace_id, name, slug, kind, owner_id, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'personal', ?, 0, ?, ?)`,
  ).run(id, input.workspaceId, config.name, `personal-${input.userId.slice(0, 6)}`, input.userId, now, now);
  db.prepare(
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
  return getInterface(db, id)!;
}

export function getActiveInterface(
  db: Database.Database,
  input: { workspaceId: string; userId: string; preferences: PreferencesRow; jobRole: JobRole },
): InterfaceSnapshot {
  let interfaceId = input.preferences.active_interface_id;
  const active = interfaceId ? getSnapshot(db, interfaceId) : null;
  if (active && active.iface.workspace_id === input.workspaceId) return active;

  const personal = ensurePersonalInterface(db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    jobRole: input.jobRole,
  });
  db.prepare(
    "UPDATE user_preferences SET active_interface_id = ?, updated_at = ? WHERE user_id = ? AND workspace_id = ?",
  ).run(personal.id, nowIso(), input.userId, input.workspaceId);
  return getSnapshot(db, personal.id)!;
}

export function getInterfaceByKind(
  db: Database.Database,
  workspaceId: string,
  kind: "baseline" | "demo",
): InterfaceSnapshot | null {
  const row = db
    .prepare("SELECT id FROM interfaces WHERE workspace_id = ? AND kind = ? ORDER BY created_at ASC LIMIT 1")
    .get(workspaceId, kind) as { id: string } | undefined;
  return row ? getSnapshot(db, row.id) : null;
}

export function saveVersion(
  db: Database.Database,
  input: {
    interfaceId: string;
    workspaceId: string;
    config: MorphConfig;
    summary: string;
    source: VersionSource;
    userId: string;
  },
): InterfaceSnapshot {
  const validated = morphConfigSchema.parse(input.config);
  const latest = db
    .prepare("SELECT MAX(version) AS v FROM interface_versions WHERE interface_id = ?")
    .get(input.interfaceId) as { v: number | null };
  const nextVersion = (latest.v ?? 0) + 1;
  const id = newId();
  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare("UPDATE interface_versions SET is_current = 0 WHERE interface_id = ?").run(input.interfaceId);
    db.prepare(
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
    db.prepare("UPDATE interfaces SET name = ?, updated_at = ? WHERE id = ?").run(
      validated.name,
      now,
      input.interfaceId,
    );
  });
  run();
  return getSnapshot(db, input.interfaceId)!;
}

export function listVersions(
  db: Database.Database,
  interfaceId: string,
  limit = 25,
): Array<InterfaceVersionRow & { createdByName: string | null }> {
  return db
    .prepare(
      `SELECT v.*, u.name AS createdByName FROM interface_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.interface_id = ? ORDER BY v.version DESC LIMIT ?`,
    )
    .all(interfaceId, limit) as Array<InterfaceVersionRow & { createdByName: string | null }>;
}

export function listWorkspaceInterfaces(
  db: Database.Database,
  workspaceId: string,
  userId: string,
) {
  return db
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

export function previousVersion(
  db: Database.Database,
  interfaceId: string,
): InterfaceVersionRow | null {
  const current = getCurrentVersion(db, interfaceId);
  if (!current) return null;
  return (
    (db
      .prepare(
        "SELECT * FROM interface_versions WHERE interface_id = ? AND version < ? ORDER BY version DESC LIMIT 1",
      )
      .get(interfaceId, current.version) as InterfaceVersionRow | undefined) ?? null
  );
}

/** Undo = re-apply the previous config as a new version, never history rewriting. */
export function undoLastChange(
  db: Database.Database,
  input: { interfaceId: string; workspaceId: string; userId: string },
): InterfaceSnapshot {
  const previous = previousVersion(db, input.interfaceId);
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

export function restoreVersion(
  db: Database.Database,
  input: { versionId: string; workspaceId: string; userId: string },
): InterfaceSnapshot {
  const version = db
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
  db: Database.Database,
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

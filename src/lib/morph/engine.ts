import "server-only";
import type { Db } from "@/lib/db";
import { newId, nowIso, parseJson } from "@/lib/db";
import type { JobRole, PreferencesRow, TransformationRow, VersionSource } from "@/lib/db/types";
import { logError, logEvent } from "@/lib/log";
import { resolveConfigData, type ConfigData } from "@/lib/crm/data";
import { workflowDefinitionSchema } from "@/lib/workflows/schema";
import {
  morphConfigSchema,
  type ActionId,
  type DatasetKey,
  type MorphConfig,
} from "./config";
import { applyPatch, diffConfigs, summarizeOperations, type ChangeSummary, type PatchOp } from "./patch";
import { planTransformation } from "./planner";
import { isProviderConfigured, planWithProvider } from "./provider";
import { PROMPT_VERSION } from "./prompt";
import { validateMorphResult, type MorphResult } from "./result";
import { getSnapshot, saveVersion, undoLastChange } from "./interfaces";

export type ProposalKind = "config" | "workflow" | "restore" | "refusal";

export type EngineId = "openai" | "groq" | "local-planner";

export interface ProposalDTO {
  id: string;
  prompt: string;
  engine: EngineId;
  engineLabel: string;
  model: string | null;
  kind: ProposalKind;
  intent: string;
  summary: string;
  explanation: string;
  operations: PatchOp[];
  changes: ChangeSummary[];
  config: MorphConfig | null;
  currentConfig: MorphConfig;
  previewData: ConfigData | null;
  warnings: string[];
  assumptions: string[];
  unresolved: string[];
  requiredDataSources: DatasetKey[];
  requiredActions: ActionId[];
  workflowDraft: MorphResult["workflowDraft"] | null;
  refusal: string | null;
  status: string;
  latencyMs: number;
  createdAt: string;
  diffCounts: { added: number; removed: number; kept: number } | null;
  interfaceId: string;
  promptVersion: string;
}

export function engineLabel(engine: string, model: string | null): string {
  if (engine === "openai") return model ? `OpenAI · ${model}` : "OpenAI";
  if (engine === "groq") return model ? `Groq · ${model}` : "Groq";
  return "Local planner";
}

export function mapProposalRow(row: TransformationRow): ProposalDTO {
  const result = parseJson<MorphResult | null>(row.result, null);
  const currentConfig = parseJson<MorphConfig | null>(row.result_config, null);
  const changes = result ? summarizeOperations(result.operations) : [];
  return {
    id: row.id,
    prompt: row.prompt,
    engine: (["openai", "groq"].includes(row.engine) ? row.engine : "local-planner") as EngineId,
    engineLabel: engineLabel(row.engine, row.model),
    model: row.model,
    kind: (row.kind as ProposalKind) ?? "config",
    intent: row.intent ?? result?.intent ?? "",
    summary: result?.summary ?? row.explanation ?? "",
    explanation: row.explanation ?? "",
    operations: result?.operations ?? [],
    changes,
    config: null,
    currentConfig: currentConfig ?? ({} as MorphConfig),
    previewData: null,
    warnings: parseJson<string[]>(row.warnings, []),
    assumptions: result?.assumptions ?? [],
    unresolved: result?.unresolved ?? [],
    requiredDataSources: result?.requiredDataSources ?? [],
    requiredActions: result?.requiredActions ?? [],
    workflowDraft: result?.workflowDraft ?? null,
    refusal: result?.refusal ?? null,
    status: row.status,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
    diffCounts: null,
    interfaceId: row.interface_id,
    promptVersion: PROMPT_VERSION,
  };
}

export interface ProposeParams {
  db: Db;
  workspaceId: string;
  userId: string;
  jobRole: JobRole;
  goals: string[];
  preferences: PreferencesRow;
  interfaceId: string;
  prompt: string;
}

export interface ProposeOutcome {
  ok: boolean;
  proposal?: ProposalDTO;
  error?: string;
}

/**
 * The Morph pipeline:
 * intent → current config → preferences → registry → generate → validate →
 * preview (with live data) → persist. Nothing is applied here.
 */
export async function proposeTransformation(params: ProposeParams): Promise<ProposeOutcome> {
  const { db, workspaceId, userId, interfaceId } = params;
  const snapshot = await getSnapshot(db, interfaceId);
  if (!snapshot || snapshot.iface.workspace_id !== workspaceId) {
    return { ok: false, error: "That interface does not belong to this workspace." };
  }
  const currentConfig = snapshot.config;
  const started = Date.now();
  const warnings: string[] = [];
  let engine: EngineId = "local-planner";
  let model: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;

  let result: MorphResult | null = null;

  if (isProviderConfigured()) {
    const outcome = await planWithProvider({
      prompt: params.prompt,
      config: currentConfig,
      role: params.jobRole,
      goals: params.goals,
    });
    inputTokens = outcome.inputTokens;
    outputTokens = outcome.outputTokens;
    if (outcome.ok && outcome.result) {
      result = outcome.result;
      engine = outcome.provider === "groq" ? "groq" : "openai";
      model = outcome.model;
      warnings.push(...outcome.warnings);
    } else {
      warnings.push(
        `Live model call failed (${outcome.error ?? "unknown error"}). Morph used the local planner instead — review the proposal carefully.`,
      );
      logEvent("warn", {
        event: "morph.provider.fallback",
        workspaceId,
        reason: outcome.error,
      });
    }
  } else {
    warnings.push(
      "No model provider is configured (set GROQ_API_KEY or OPENAI_API_KEY). This proposal was generated by Morph's deterministic local planner.",
    );
  }

  if (!result) {
    try {
      result = planTransformation({
        prompt: params.prompt,
        config: currentConfig,
        jobRole: params.jobRole,
        goals: params.goals,
      });
    } catch (error) {
      logError("morph.planner.failed", error, { workspaceId });
      return { ok: false, error: "Morph could not interpret that instruction. Try rephrasing it." };
    }
  }

  const validated = validateMorphResult(result);
  if (!validated.ok) {
    logEvent("error", {
      event: "morph.result.invalid",
      workspaceId,
      issues: validated.issues.slice(0, 5),
    });
    return {
      ok: false,
      error: `Morph produced an invalid transformation and rejected it: ${validated.issues.slice(0, 2).join("; ")}`,
    };
  }
  result = validated.result;

  // --- resolve the change ---------------------------------------------------
  const kind: ProposalKind =
    result.kind === "workflow" && result.workflowDraft
      ? "workflow"
      : result.restorePrevious
        ? "restore"
        : result.kind === "refusal" || result.refusal
          ? "refusal"
          : "config";

  let nextConfig: MorphConfig | null = null;
  let protectedConfig: MorphConfig = currentConfig;

  if (kind === "config") {
    if (result.operations.length === 0) {
      return { ok: false, error: "The proposal contained no changes to apply." };
    }
    const patched = applyPatch(currentConfig, result.operations);
    if (patched.issues.length > 0 && patched.applied.length === 0) {
      return {
        ok: false,
        error: `Generated changes failed validation and were rejected: ${patched.issues.slice(0, 3).join("; ")}`,
      };
    }
    if (patched.issues.length > 0) {
      warnings.push(...patched.issues.slice(0, 3).map((issue) => `Skipped: ${issue}`));
    }
    const parsed = morphConfigSchema.safeParse(patched.config);
    if (!parsed.success) {
      return { ok: false, error: "The resulting interface failed validation and was rejected." };
    }
    nextConfig = parsed.data;
    protectedConfig = parsed.data;
  }

  const previewData = nextConfig
    ? await resolveConfigData(db, { workspaceId, userId }, nextConfig.components)
    : null;
  const diff = nextConfig ? diffConfigs(currentConfig, nextConfig) : null;

  // --- persist --------------------------------------------------------------
  const id = newId();
  const status = kind === "refusal" ? "rejected" : "proposed";
  const latency = Date.now() - started;
  await db.prepare(
    `INSERT INTO transformation_requests
      (id, workspace_id, interface_id, user_id, prompt, engine, model, status, kind, intent, operations, result,
       result_config, explanation, warnings, error, latency_ms, input_tokens, output_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    interfaceId,
    userId,
    params.prompt.slice(0, 1000),
    engine,
    model,
    status,
    kind,
    result.intent,
    JSON.stringify(result.operations),
    JSON.stringify(result),
    nextConfig ? JSON.stringify(nextConfig) : null,
    result.summary,
    JSON.stringify(warnings),
    kind === "refusal" ? (result.refusal ?? result.summary) : null,
    latency,
    inputTokens,
    outputTokens,
    nowIso(),
  );

  await db.prepare(
    `INSERT INTO ai_usage (id, workspace_id, user_id, engine, model, prompt_tokens, completion_tokens, latency_ms, ok, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    workspaceId,
    userId,
    engine,
    model,
    inputTokens,
    outputTokens,
    latency,
    kind === "refusal" ? 0 : 1,
    nowIso(),
  );

  logEvent("info", {
    event: "morph.proposal.created",
    workspaceId,
    userId,
    engine,
    kind,
    operationCount: result.operations.length,
    latencyMs: latency,
    promptVersion: PROMPT_VERSION,
  });

  return {
    ok: true,
    proposal: {
      id,
      prompt: params.prompt,
      engine,
      engineLabel: engineLabel(engine, model),
      model,
      kind,
      intent: result.intent,
      summary: result.summary,
      explanation: result.summary,
      operations: result.operations,
      changes: summarizeOperations(result.operations),
      config: nextConfig,
      currentConfig,
      previewData,
      warnings,
      assumptions: result.assumptions,
      unresolved: result.unresolved,
      requiredDataSources: result.requiredDataSources,
      requiredActions: result.requiredActions,
      workflowDraft: result.workflowDraft ?? null,
      refusal: result.refusal ?? null,
      status,
      latencyMs: latency,
      createdAt: nowIso(),
      diffCounts: diff
        ? { added: diff.added.length, removed: diff.removed.length, kept: diff.kept.length }
        : null,
      interfaceId,
      promptVersion: PROMPT_VERSION,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Apply / discard                                                            */
/* -------------------------------------------------------------------------- */

export interface ApplyOutcome {
  ok: boolean;
  error?: string;
  versionId?: string;
  workflowId?: string;
  kind?: ProposalKind;
  summary?: string;
}

export async function applyTransformation(params: {
  db: Db;
  workspaceId: string;
  userId: string;
  proposalId: string;
}): Promise<ApplyOutcome> {
  const { db, workspaceId, userId, proposalId } = params;
  const row = await db
    .prepare("SELECT * FROM transformation_requests WHERE id = ? AND workspace_id = ?")
    .get(proposalId, workspaceId) as TransformationRow | undefined;
  if (!row) return { ok: false, error: "That proposal no longer exists." };
  if (row.user_id !== userId) return { ok: false, error: "You can only apply your own proposals." };
  if (row.status !== "proposed") {
    return { ok: false, error: `This proposal was already ${row.status}.` };
  }
  const result = parseJson<MorphResult | null>(row.result, null);
  if (!result) return { ok: false, error: "The proposal payload is missing." };

  const source: VersionSource = row.engine === "local-planner" ? "local-planner" : "ai";

  try {
    if (row.kind === "workflow") {
      if (!result.workflowDraft) return { ok: false, error: "The workflow draft is missing." };
      const draft = workflowDefinitionSchema.parse(result.workflowDraft);
      const existing = await db
        .prepare(
          "SELECT id FROM workflow_definitions WHERE workspace_id = ? AND lower(name) = lower(?)",
        )
        .get(workspaceId, draft.name) as { id: string } | undefined;
      if (existing) {
        await db.prepare(
          "UPDATE workflow_definitions SET definition = ?, description = ?, trigger_type = ?, enabled = 0, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(draft), draft.description, draft.trigger.type, nowIso(), existing.id);
        await db.prepare(
          "UPDATE transformation_requests SET status = 'applied', applied_at = ? WHERE id = ?",
        ).run(nowIso(), proposalId);
        return { ok: true, workflowId: existing.id, kind: "workflow", summary: "Workflow updated — review and enable it." };
      }
      const workflowId = newId();
      await db.prepare(
        `INSERT INTO workflow_definitions (id, workspace_id, name, description, enabled, definition, trigger_type, created_by, created_at, updated_at, last_run_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        workflowId,
        workspaceId,
        draft.name,
        draft.description,
        JSON.stringify(draft),
        draft.trigger.type,
        userId,
        nowIso(),
        nowIso(),
      );
      await db.prepare("UPDATE transformation_requests SET status = 'applied', applied_at = ? WHERE id = ?").run(
        nowIso(),
        proposalId,
      );
      logEvent("info", { event: "workflow.created", workspaceId, workflowId, userId });
      return { ok: true, workflowId, kind: "workflow", summary: "Workflow drafted. Review it and enable it when ready." };
    }

    if (row.kind === "restore") {
      const snapshot = await undoLastChange(db, {
        interfaceId: row.interface_id,
        workspaceId,
        userId,
      });
      await db.prepare(
        "UPDATE transformation_requests SET status = 'applied', applied_at = ? WHERE id = ?",
      ).run(nowIso(), proposalId);
      return {
        ok: true,
        versionId: snapshot.version.id,
        kind: "restore",
        summary: `Restored version ${snapshot.version.version}.`,
      };
    }

    if (row.kind !== "config") return { ok: false, error: "This proposal cannot be applied." };
    if (!row.result_config) return { ok: false, error: "The preview configuration is missing." };
    const reparsed = morphConfigSchema.safeParse(parseJson<unknown>(row.result_config, null));
    if (!reparsed.success) {
      return { ok: false, error: "The stored preview configuration failed validation and cannot be applied." };
    }
    const config = reparsed.data;
    const snapshot = await getSnapshot(db, row.interface_id);
    if (!snapshot) return { ok: false, error: "The interface no longer exists." };
    const saved = await saveVersion(db, {
      interfaceId: row.interface_id,
      workspaceId,
      config,
      summary: result.summary.slice(0, 200),
      source,
      userId,
    });
    await db.prepare(
      "UPDATE transformation_requests SET status = 'applied', applied_at = ? WHERE id = ?",
    ).run(nowIso(), proposalId);
    logEvent("info", {
      event: "morph.proposal.applied",
      workspaceId,
      userId,
      interfaceId: row.interface_id,
      version: saved.version.version,
      engine: row.engine,
    });
    return {
      ok: true,
      versionId: saved.version.id,
      kind: "config",
      summary: `Applied — version ${saved.version.version} is now live.`,
    };
  } catch (error) {
    logError("morph.apply.failed", error, { workspaceId, proposalId });
    return { ok: false, error: error instanceof Error ? error.message : "Could not apply the proposal." };
  }
}

export async function discardProposal(params: {
  db: Db;
  workspaceId: string;
  userId: string;
  proposalId: string;
}): Promise<{ ok: boolean }> {
  await params.db
    .prepare(
      "UPDATE transformation_requests SET status = 'discarded' WHERE id = ? AND workspace_id = ? AND user_id = ? AND status = 'proposed'",
    )
    .run(params.proposalId, params.workspaceId, params.userId);
  return { ok: true };
}

export async function listProposals(
  db: Db,
  interfaceId: string,
  limit = 12,
): Promise<Array<{
  id: string;
  prompt: string;
  summary: string;
  engine: string;
  engineLabel: string;
  kind: string;
  status: string;
  createdAt: string;
  latencyMs: number;
  warnings: string[];
  operationCount: number;
  refusal: string | null;
}>> {
  const rows = await db
    .prepare(
      "SELECT * FROM transformation_requests WHERE interface_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(interfaceId, limit) as TransformationRow[];
  return rows.map((row) => {
    const result = parseJson<MorphResult | null>(row.result, null);
    return {
      id: row.id,
      prompt: row.prompt,
      summary: result?.summary ?? row.explanation ?? "",
      engine: row.engine,
      engineLabel: engineLabel(row.engine, row.model),
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
      latencyMs: row.latency_ms,
      warnings: parseJson<string[]>(row.warnings, []),
      operationCount: result?.operations.length ?? 0,
      refusal: result?.refusal ?? null,
    };
  });
}

export async function recentAiUsage(db: Db, workspaceId: string) {
  return await db
    .prepare(
      `SELECT engine, model, COUNT(*) AS requests, SUM(prompt_tokens) AS inputTokens,
         SUM(completion_tokens) AS outputTokens, AVG(latency_ms) AS avgLatency, SUM(ok) AS okCount
       FROM ai_usage WHERE workspace_id = ? AND created_at >= ? GROUP BY engine, model`,
    )
    .all(workspaceId, new Date(Date.now() - 30 * 86_400_000).toISOString()) as Array<{
    engine: string;
    model: string | null;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    avgLatency: number;
    okCount: number;
  }>;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, newId, nowIso, parseJson } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/log";
import {
  morphConfigSchema,
  type JobRole,
} from "@/lib/morph/config";
import { rolePresetConfig } from "@/lib/morph/presets";
import {
  getActiveInterface,
  getInterface,
  getInterfaceByKind,
  saveVersion,
  undoLastChange,
  restoreVersion,
} from "@/lib/morph/interfaces";
import {
  applyTransformation,
  discardProposal,
  proposeTransformation,
  type ProposalDTO,
} from "@/lib/morph/engine";
import { classicCrmConfig } from "@/lib/morph/presets";
import { getScenario } from "@/lib/demo";
import { runDailyChecks, runWorkflow } from "@/lib/workflows/engine";
import {
  validateWorkflowDefinition,
  workflowDefinitionSchema,
} from "@/lib/workflows/schema";
import type { WorkflowRow } from "@/lib/db/types";

function revalidateStudio() {
  for (const path of [
    "/studio",
    "/studio/compare",
    "/studio/versions",
    "/studio/workflows",
    "/studio/settings",
    "/studio/saved",
    "/studio/crm/leads",
    "/studio/crm/deals",
    "/studio/crm/tasks",
    "/studio/crm/activities",
  ]) {
    revalidatePath(path);
  }
}

async function context() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  return { ...ctx, db: getDb() };
}

/* -------------------------------------------------------------------------- */
/* Morph transformations                                                      */
/* -------------------------------------------------------------------------- */

export interface ProposeActionResult {
  ok: boolean;
  proposal?: ProposalDTO;
  error?: string;
  retryAfterSeconds?: number;
}

export async function proposeAction(prompt: string): Promise<ProposeActionResult> {
  const ctx = await context();
  const trimmed = prompt.trim();
  if (trimmed.length < 3) return { ok: false, error: "Describe the change you want in a few words." };
  if (trimmed.length > 800) return { ok: false, error: "Keep the instruction under 800 characters." };

  const limit = rateLimit(`morph:propose:${ctx.user.id}`, { limit: 12, windowMs: 60_000 });
  if (!limit.ok) {
    return {
      ok: false,
      error: `You're sending changes quickly — Morph allows ${limit.limit} transformations a minute. Try again in ${limit.retryAfterSeconds}s.`,
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  const active = await getActiveInterface(ctx.db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });

  const outcome = await proposeTransformation({
    db: ctx.db,
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    jobRole: ctx.preferences.job_role as JobRole,
    goals: parseJson<string[]>(ctx.preferences.primary_goals, []),
    preferences: ctx.preferences,
    interfaceId: active.iface.id,
    prompt: trimmed,
  });

  if (!outcome.ok || !outcome.proposal) {
    return { ok: false, error: outcome.error ?? "Morph could not build that transformation." };
  }
  return { ok: true, proposal: outcome.proposal };
}

export async function applyProposalAction(proposalId: string): Promise<{
  ok: boolean;
  error?: string;
  summary?: string;
  kind?: string;
  workflowId?: string;
}> {
  const ctx = await context();
  const outcome = await applyTransformation({
    db: ctx.db,
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    proposalId,
  });
  if (outcome.ok) revalidateStudio();
  return {
    ok: outcome.ok,
    error: outcome.error,
    summary: outcome.summary,
    kind: outcome.kind,
    workflowId: outcome.workflowId,
  };
}

export async function discardProposalAction(proposalId: string): Promise<{ ok: boolean }> {
  const ctx = await context();
  const outcome = await discardProposal({
    db: ctx.db,
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    proposalId,
  });
  revalidateStudio();
  return outcome;
}

export async function undoAction(): Promise<{ ok: boolean; error?: string; summary?: string }> {
  const ctx = await context();
  const active = await getActiveInterface(ctx.db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });
  try {
    const snapshot = await undoLastChange(ctx.db, {
      interfaceId: active.iface.id,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
    });
    revalidateStudio();
    return { ok: true, summary: `Restored version ${snapshot.version.version}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Nothing to undo." };
  }
}

export async function restoreVersionAction(versionId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  try {
    await restoreVersion(ctx.db, {
      versionId,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
    });
    revalidateStudio();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not restore that version." };
  }
}

export async function saveCanvasAction(configInput: unknown): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  const active = await getActiveInterface(ctx.db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });
  const parsed = morphConfigSchema.safeParse(configInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `That layout is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    };
  }
  await saveVersion(ctx.db, {
    interfaceId: active.iface.id,
    workspaceId: ctx.workspace.id,
    config: parsed.data,
    summary: "Manual layout change",
    source: "manual",
    userId: ctx.user.id,
  });
  revalidateStudio();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

const preferenceSchema = z.object({
  jobRole: z.enum(["sales_manager", "sales_rep", "ops_manager", "general"]).optional(),
  goals: z.array(z.string().max(80)).max(4).optional(),
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  fontSize: z.enum(["base", "lg", "xl"]).optional(),
  highContrast: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  reduceClutter: z.boolean().optional(),
  preferredMetrics: z.array(z.string().max(40)).max(6).optional(),
});

export async function updatePreferencesAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those settings are not valid." };
  const value = parsed.data;
  const db = ctx.db;

  const accessibility = {
    fontSize: value.fontSize ?? "base",
    highContrast: value.highContrast ?? false,
    reduceMotion: value.reduceMotion ?? false,
    reduceClutter: value.reduceClutter ?? false,
  };

  await db.prepare(
    `UPDATE user_preferences SET job_role = COALESCE(?, job_role), primary_goals = COALESCE(?, primary_goals),
       density = COALESCE(?, density), preferred_metrics = COALESCE(?, preferred_metrics),
       accessibility = ?, updated_at = ?
     WHERE user_id = ? AND workspace_id = ?`,
  ).run(
    value.jobRole ?? null,
    value.goals ? JSON.stringify(value.goals) : null,
    value.density ?? null,
    value.preferredMetrics ? JSON.stringify(value.preferredMetrics) : null,
    JSON.stringify(accessibility),
    nowIso(),
    ctx.user.id,
    ctx.workspace.id,
  );

  const active = await getActiveInterface(db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: (value.jobRole ?? ctx.preferences.job_role) as JobRole,
  });

  if (value.fontSize || value.highContrast !== undefined || value.reduceMotion !== undefined || value.reduceClutter !== undefined || value.density) {
    const next = morphConfigSchema.parse({
      ...active.config,
      layout: { ...active.config.layout, density: value.density ?? active.config.layout.density },
      accessibility: { ...active.config.accessibility, ...accessibility },
    });
    await saveVersion(db, {
      interfaceId: active.iface.id,
      workspaceId: ctx.workspace.id,
      config: next,
      summary: "Accessibility and density settings updated",
      source: "manual",
      userId: ctx.user.id,
    });
  }

  revalidateStudio();
  return { ok: true };
}

export async function dismissSuggestionAction(id: string): Promise<{ ok: boolean }> {
  const ctx = await context();
  const dismissed = parseJson<string[]>(ctx.preferences.dismissed_suggestions ?? "[]", []);
  if (!dismissed.includes(id)) dismissed.push(id);
  await ctx.db
    .prepare("UPDATE user_preferences SET dismissed_suggestions = ?, updated_at = ? WHERE user_id = ? AND workspace_id = ?")
    .run(JSON.stringify(dismissed.slice(-40)), nowIso(), ctx.user.id, ctx.workspace.id);
  revalidateStudio();
  return { ok: true };
}

export async function switchInterfaceAction(interfaceId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  const iface = await getInterface(ctx.db, interfaceId);
  if (!iface || iface.workspace_id !== ctx.workspace.id) {
    return { ok: false, error: "That interface is not in this workspace." };
  }
  if (iface.owner_id && iface.owner_id !== ctx.user.id) {
    return { ok: false, error: "That interface belongs to someone else." };
  }
  await ctx.db
    .prepare("UPDATE user_preferences SET active_interface_id = ?, updated_at = ? WHERE user_id = ? AND workspace_id = ?")
    .run(interfaceId, nowIso(), ctx.user.id, ctx.workspace.id);
  revalidateStudio();
  return { ok: true };
}

export async function applyTemplateAction(role: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  const parsed = z.enum(["sales_manager", "sales_rep", "ops_manager", "general"]).safeParse(role);
  if (!parsed.success) return { ok: false, error: "Unknown template." };
  const active = await getActiveInterface(ctx.db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });
  await saveVersion(ctx.db, {
    interfaceId: active.iface.id,
    workspaceId: ctx.workspace.id,
    config: rolePresetConfig(parsed.data),
    summary: `Applied the ${parsed.data.replace("_", " ")} template`,
    source: "template",
    userId: ctx.user.id,
  });
  revalidateStudio();
  return { ok: true };
}

export async function resetToRolePresetAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  const active = await getActiveInterface(ctx.db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });
  await saveVersion(ctx.db, {
    interfaceId: active.iface.id,
    workspaceId: ctx.workspace.id,
    config: rolePresetConfig(ctx.preferences.job_role as JobRole),
    summary: "Reset to the role template",
    source: "template",
    userId: ctx.user.id,
  });
  revalidateStudio();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Demo mode                                                                  */
/* -------------------------------------------------------------------------- */

export interface DemoRunResult {
  ok: boolean;
  error?: string;
  engineLabel?: string;
  engine?: string;
  summary?: string;
  intent?: string;
  warnings?: string[];
  refusal?: string;
}

export async function runScenarioAction(scenarioId: string): Promise<DemoRunResult> {
  const scenario = getScenario(scenarioId);
  if (!scenario) return { ok: false, error: "Unknown scenario." };
  const ctx = await context();

  const limit = rateLimit(`morph:demo:${ctx.user.id}`, { limit: 6, windowMs: 60_000 });
  if (!limit.ok) {
    return { ok: false, error: `Demo runs are limited to ${limit.limit}/minute. Retry in ${limit.retryAfterSeconds}s.` };
  }

  const demo = await getInterfaceByKind(ctx.db, ctx.workspace.id, "demo");
  if (!demo) return { ok: false, error: "This workspace has no demo interface." };

  const outcome = await proposeTransformation({
    db: ctx.db,
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    jobRole: scenario.role,
    goals: [scenario.prompt],
    preferences: ctx.preferences,
    interfaceId: demo.iface.id,
    prompt: scenario.prompt,
  });
  if (!outcome.ok || !outcome.proposal) {
    return { ok: false, error: outcome.error ?? "The demo transformation failed." };
  }
  const proposal = outcome.proposal;
  if (proposal.kind !== "config") {
    return {
      ok: false,
      refusal: proposal.refusal ?? proposal.summary,
      error: proposal.refusal ?? "That scenario did not produce an interface change.",
      engineLabel: proposal.engineLabel,
    };
  }
  const applied = await applyTransformation({
    db: ctx.db,
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    proposalId: proposal.id,
  });
  if (!applied.ok) return { ok: false, error: applied.error ?? "Could not apply the demo transformation." };

  await ctx.db.prepare(
    "INSERT INTO demo_runs (id, workspace_id, scenario, engine, status, created_at) VALUES (?, ?, ?, ?, 'applied', ?)",
  ).run(newId(), ctx.workspace.id, scenario.id, proposal.engine, nowIso());

  logEvent("info", {
    event: "demo.scenario.run",
    workspaceId: ctx.workspace.id,
    scenario: scenario.id,
    engine: proposal.engine,
  });
  revalidateStudio();
  return {
    ok: true,
    engineLabel: proposal.engineLabel,
    engine: proposal.engine,
    summary: proposal.summary,
    intent: proposal.intent,
    warnings: proposal.warnings,
  };
}

export async function resetDemoAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  const demo = await getInterfaceByKind(ctx.db, ctx.workspace.id, "demo");
  if (!demo) return { ok: false, error: "This workspace has no demo interface." };
  await saveVersion(ctx.db, {
    interfaceId: demo.iface.id,
    workspaceId: ctx.workspace.id,
    config: classicCrmConfig(),
    summary: "Demo reset to the classic CRM baseline",
    source: "restore",
    userId: ctx.user.id,
  });
  await ctx.db
    .prepare("DELETE FROM demo_runs WHERE workspace_id = ?")
    .run(ctx.workspace.id);
  revalidateStudio();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Workflows                                                                  */
/* -------------------------------------------------------------------------- */

export async function createWorkflowAction(input: unknown): Promise<{
  ok: boolean;
  error?: string;
  workflowId?: string;
  issues?: string[];
}> {
  const ctx = await context();
  const validated = validateWorkflowDefinition(input);
  if (!validated.ok) {
    return { ok: false, error: "That workflow is not valid.", issues: validated.issues };
  }
  const existing = await ctx.db
    .prepare("SELECT id FROM workflow_definitions WHERE workspace_id = ? AND lower(name) = lower(?)")
    .get(ctx.workspace.id, validated.definition.name) as { id: string } | undefined;

  if (existing) {
    await ctx.db.prepare(
      "UPDATE workflow_definitions SET definition = ?, description = ?, trigger_type = ?, updated_at = ? WHERE id = ?",
    ).run(
      JSON.stringify(validated.definition),
      validated.definition.description,
      validated.definition.trigger.type,
      nowIso(),
      existing.id,
    );
    revalidateStudio();
    return { ok: true, workflowId: existing.id };
  }

  const id = newId();
  await ctx.db.prepare(
    `INSERT INTO workflow_definitions (id, workspace_id, name, description, enabled, definition, trigger_type, created_by, created_at, updated_at, last_run_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    ctx.workspace.id,
    validated.definition.name,
    validated.definition.description,
    JSON.stringify(validated.definition),
    validated.definition.trigger.type,
    ctx.user.id,
    nowIso(),
    nowIso(),
  );
  revalidateStudio();
  return { ok: true, workflowId: id };
}

export async function toggleWorkflowAction(workflowId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  const workflow = await ctx.db
    .prepare("SELECT * FROM workflow_definitions WHERE id = ? AND workspace_id = ?")
    .get(workflowId, ctx.workspace.id) as WorkflowRow | undefined;
  if (!workflow) return { ok: false, error: "Workflow not found." };
  await ctx.db
    .prepare("UPDATE workflow_definitions SET enabled = ?, updated_at = ? WHERE id = ?")
    .run(enabled ? 1 : 0, nowIso(), workflowId);
  revalidateStudio();
  return { ok: true };
}

export async function runWorkflowNowAction(
  workflowId: string,
  dryRun: boolean,
): Promise<{ ok: boolean; error?: string; matched?: number; summary?: string; logs?: unknown[] }> {
  const ctx = await context();
  const workflow = await ctx.db
    .prepare("SELECT * FROM workflow_definitions WHERE id = ? AND workspace_id = ?")
    .get(workflowId, ctx.workspace.id) as WorkflowRow | undefined;
  if (!workflow) return { ok: false, error: "Workflow not found." };
  if (!dryRun && workflow.enabled !== 1) {
    return { ok: false, error: "Enable the workflow before running it for real — or use a test run." };
  }
  const definition = workflowDefinitionSchema.safeParse(parseJson(workflow.definition, null));
  if (!definition.success) return { ok: false, error: "This workflow definition is invalid." };

  const result = await runWorkflow({
    db: ctx.db,
    workflow,
    trigger: definition.data.trigger.type,
    actorId: ctx.user.id,
    dryRun,
    dedupe: !dryRun,
  });
  revalidateStudio();
  const counts = result.counts;
  return {
    ok: result.status !== "failed",
    error: result.error,
    matched: result.matched,
    summary: dryRun
      ? `Test run: ${result.matched} record(s) match. ${counts.skipped} action(s) would be skipped as duplicates.`
      : `${result.status === "skipped" ? "Skipped" : "Ran"}: ${result.matched} matched, ${counts.tasks} task(s), ${counts.flags} flag(s), ${counts.notifications} notification(s), ${counts.updates} update(s).`,
    logs: result.logs,
  };
}

export async function runDailyChecksAction(): Promise<{ ok: boolean; results: Array<{ name: string; matched: number; status: string }> }> {
  const ctx = await context();
  const results = await runDailyChecks({
    db: ctx.db,
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
  });
  revalidateStudio();
  return {
    ok: true,
    results: results.map((result) => ({
      name: result.workflowName,
      matched: result.matched,
      status: result.status,
    })),
  };
}

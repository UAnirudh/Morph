import { z } from "zod";
import { ACTION_IDS, ALL_DATASET_KEYS, type ActionId, type DatasetKey } from "./config";
import { patchOpSchema } from "./patch";
import { workflowDefinitionSchema } from "@/lib/workflows/schema";

/**
 * The contract every planning engine must satisfy — the OpenAI-backed planner
 * and the deterministic local planner alike. Anything that fails this schema
 * never reaches the user as a proposed change.
 */
export const morphResultSchema = z.object({
  kind: z.enum(["config", "workflow", "restore", "refusal"]).default("config"),
  intent: z.string().min(1).max(140),
  summary: z.string().min(1).max(500),
  operations: z.array(patchOpSchema).max(12).default([]),
  requiredDataSources: z
    .array(z.enum(ALL_DATASET_KEYS as [DatasetKey, ...DatasetKey[]]))
    .max(12)
    .default([]),
  requiredActions: z
    .array(z.enum(ACTION_IDS as [ActionId, ...ActionId[]]))
    .max(12)
    .default([]),
  assumptions: z.array(z.string().max(220)).max(5).default([]),
  unresolved: z.array(z.string().max(220)).max(5).default([]),
  restorePrevious: z.boolean().default(false),
  workflowDraft: workflowDefinitionSchema.optional(),
  refusal: z.string().max(500).optional(),
});

export type MorphResult = z.infer<typeof morphResultSchema>;

export function validateMorphResult(input: unknown) {
  const parsed = morphResultSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, result: parsed.data, issues: [] as string[] };
  return {
    ok: false as const,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
    ),
  };
}

export function refusalResult(message: string): MorphResult {
  return {
    kind: "refusal",
    intent: "Unsupported request",
    summary: message,
    operations: [],
    requiredDataSources: [],
    requiredActions: [],
    assumptions: [],
    unresolved: [],
    restorePrevious: false,
    refusal: message,
  };
}

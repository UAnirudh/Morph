/**
 * Real-provider smoke test.
 *
 * Skipped unless OPENAI_API_KEY is set (tests/setup.ts clears it for the
 * deterministic suite). When a key IS present this makes one real call, then
 * asserts that whatever comes back already satisfies the transformation schema
 * — the same validator the app runs before it will preview anything.
 *
 *   OPENAI_API_KEY=... npx vitest run tests/provider.smoke.test.ts
 */
import { describe, expect, it } from "vitest";
import { isProviderConfigured, planWithProvider, providerModel } from "@/lib/morph/provider";
import { validateMorphResult } from "@/lib/morph/result";
import { classicCrmConfig } from "@/lib/morph/presets";

const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());

describe.skipIf(!hasKey)("live model provider (smoke)", () => {
  it("returns a schema-valid transformation for a supported request", async () => {
    expect(isProviderConfigured()).toBe(true);

    const outcome = await planWithProvider({
      prompt: "Show my pipeline by stage and the overdue follow-ups I need to work.",
      config: classicCrmConfig(),
      role: "sales_manager",
      goals: [],
    });

    expect(outcome.model).toBe(providerModel());
    expect(outcome.latencyMs).toBeGreaterThan(0);
    expect(outcome.ok, outcome.ok ? "" : `provider error: ${outcome.error}`).toBe(true);
    if (!outcome.ok || !outcome.result) return;

    // Independent re-validation: the payload must satisfy the contract again.
    const revalidated = validateMorphResult(outcome.result);
    expect(revalidated.ok, revalidated.ok ? "" : revalidated.issues.join("; ")).toBe(true);
    expect(["config", "workflow", "restore", "refusal"]).toContain(outcome.result.kind);
  }, 90_000);
});

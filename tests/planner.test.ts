import { describe, expect, it } from "vitest";
import { planTransformation } from "@/lib/morph/planner";
import { applyPatch } from "@/lib/morph/patch";
import { morphConfigSchema } from "@/lib/morph/config";
import { classicCrmConfig, rolePresetConfig } from "@/lib/morph/presets";
import { validateMorphResult } from "@/lib/morph/result";

const base = classicCrmConfig();

function plan(prompt: string, role: "sales_manager" | "sales_rep" | "ops_manager" | "general" = "sales_manager") {
  return planTransformation({ prompt, config: base, jobRole: role, goals: [] });
}

describe("local planner", () => {
  it("builds a manager workspace from a role instruction", () => {
    const result = plan("I'm a sales manager. Show my pipeline, overdue follow-ups, and top opportunities.");
    expect(result.kind).toBe("config");
    expect(result.refusal).toBeUndefined();

    const applied = applyPatch(base, result.operations);
    expect(applied.issues).toEqual([]);
    const ids = applied.config.components.map((component) => component.id);
    expect(ids).toContain("focus-pipeline-board");
    expect(ids).toContain("focus-overdue-list");
    expect(ids.some((id) => id.includes("deals-table"))).toBe(true);
    expect(applied.config.navigation.items.some((item) => item.href === "/studio/crm/leads")).toBe(true);
    expect(result.assumptions.join(" ")).toContain("Rebuilt");
  });

  it("is deterministic", () => {
    const first = plan("Show team workload, unfinished tasks, and bottlenecks.");
    const second = plan("Show team workload, unfinished tasks, and bottlenecks.");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("simplifies the interface and reduces clutter", () => {
    const result = plan("Simplify this interface. I only want my tasks and today's priorities.", "sales_rep");
    const applied = applyPatch(base, result.operations);
    expect(applied.issues).toEqual([]);
    expect(applied.config.accessibility.reduceClutter).toBe(true);
    expect(applied.config.layout.density).toBe("compact");
    expect(applied.config.components.length).toBeLessThan(base.components.length);
    expect(applied.config.components.every((component) => component.group !== "records")).toBe(true);
  });

  it("keeps unrelated panels when the request is additive", () => {
    const result = plan("Add a quick action to mark leads as contacted.", "sales_rep");
    expect(result.kind).toBe("config");
    const applied = applyPatch(base, result.operations);
    expect(applied.issues).toEqual([]);
    const quick = applied.config.components.find((component) => component.type === "quick-actions");
    expect(quick).toBeTruthy();
    if (quick?.type === "quick-actions") {
      expect(quick.actions).toContain("mark_lead_contacted");
    }
    // Everything from the classic baseline survives.
    for (const component of base.components) {
      expect(applied.config.components.some((existing) => existing.id === component.id)).toBe(true);
    }
  });

  it("applies accessibility settings without changing data bindings", () => {
    const withData = rolePresetConfig("general");
    const result = planTransformation({
      prompt: "Make the interface more accessible with larger text and fewer distractions.",
      config: withData,
      jobRole: "general",
      goals: [],
    });
    const applied = applyPatch(withData, result.operations);
    expect(applied.issues).toEqual([]);
    expect(applied.config.accessibility.fontSize).toBe("lg");
    expect(applied.config.accessibility.highContrast).toBe(true);
    expect(applied.config.accessibility.reduceMotion).toBe(true);
    const chartBefore = withData.components.find((component) => component.type === "chart");
    expect(applied.config.components.some((component) => component.id === chartBefore?.id)).toBe(true);
    const datasetsBefore = new Set(
      withData.components.flatMap((component) => ("dataset" in component ? [component.dataset] : [])),
    );
    for (const component of applied.config.components) {
      if ("dataset" in component) expect(datasetsBefore.has(component.dataset)).toBe(true);
    }
  });

  it("maps revert instructions to a restore proposal", () => {
    const result = plan("Revert to the previous layout.");
    expect(result.kind).toBe("restore");
    expect(result.restorePrevious).toBe(true);
    expect(result.operations).toEqual([]);
  });

  it("drafts a valid disabled stale-lead workflow", () => {
    const result = plan("Create a workflow that flags leads that haven't been contacted in seven days.");
    expect(result.kind).toBe("workflow");
    expect(result.workflowDraft).toBeTruthy();
    expect(result.workflowDraft?.trigger).toMatchObject({ type: "daily_check", entity: "lead" });
    expect(result.workflowDraft?.conditions[0]).toMatchObject({ type: "days_since_contact_gte", value: 7 });
    expect(result.workflowDraft?.actions.map((action) => action.type)).toEqual(["flag_record", "create_task"]);
    // Drafts are validated by the same schema the engine uses.
    const check = validateMorphResult(result);
    expect(check.ok).toBe(true);
  });

  it("drafts a stage-change notification workflow", () => {
    const result = plan("When a deal reaches negotiation, notify the owner.");
    expect(result.kind).toBe("workflow");
    expect(result.workflowDraft?.trigger.type).toBe("deal_stage_changed");
    expect(result.workflowDraft?.conditions[0]).toMatchObject({ field: "stage", value: "negotiation" });
    expect(result.workflowDraft?.actions[0]?.type).toBe("notify");
  });

  it("refuses unsupported requests instead of pretending", () => {
    const result = plan("Make the logo animate and delete all records in the database.");
    expect(result.kind).toBe("refusal");
    expect(result.refusal).toBeTruthy();
    expect(result.operations).toEqual([]);
  });

  it("refuses an unsupported automation pattern", () => {
    const result = plan("Create a workflow that calls an external API every hour.");
    expect(result.kind).toBe("refusal");
    expect(result.refusal).toContain("Supported automations");
  });

  it("produces only valid configurations for every preset", () => {
    const prompts = [
      "Prioritize revenue, pipeline health, and overdue follow-ups.",
      "I want a simple workspace focused on my assigned leads and today's tasks.",
      "Show team workload, unfinished tasks, and bottlenecks.",
      "Create a dashboard showing revenue by month, lead conversion, and deals by stage.",
      "Make the interface more accessible with larger text and fewer distractions.",
    ];
    for (const role of ["sales_manager", "sales_rep", "ops_manager", "general"] as const) {
      for (const prompt of prompts) {
        const config = rolePresetConfig(role);
        const result = planTransformation({ prompt, config, jobRole: role, goals: [] });
        const applied = applyPatch(config, result.operations);
        expect(applied.issues, `${role} / ${prompt}`).toEqual([]);
        expect(morphConfigSchema.safeParse(applied.config).success).toBe(true);
      }
    }
  });

  it("supports a requested chart dashboard", () => {
    const result = plan("Create a dashboard showing revenue by month, lead conversion, and deals by stage.");
    const applied = applyPatch(base, result.operations);
    const datasets = applied.config.components
      .filter((component) => component.type === "chart")
      .map((component) => (component.type === "chart" ? component.dataset : ""));
    expect(datasets).toContain("revenue_by_month");
    expect(datasets).toContain("conversion_funnel");
    expect(datasets).toContain("deals_by_stage");
  });
});

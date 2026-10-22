import { describe, expect, it } from "vitest";
import { applyPatch, diffConfigs, summarizeOperations, type PatchOp } from "@/lib/morph/patch";
import { classicCrmConfig, rolePresetConfig } from "@/lib/morph/presets";
import { componentSchema } from "@/lib/morph/config";

describe("schema patches", () => {
  it("adds a component without touching the rest", () => {
    const before = classicCrmConfig();
    const ops: PatchOp[] = [
      {
        op: "add_component",
        component: componentSchema.parse({
          type: "insight",
          id: "new-insight",
          body: "Pipeline coverage is thin in the west.",
          tone: "warning",
        }),
      },
    ];
    const result = applyPatch(before, ops);
    expect(result.issues).toEqual([]);
    expect(result.config.components).toHaveLength(before.components.length + 1);
    expect(result.config.components.at(-1)?.id).toBe("new-insight");
    expect(result.config.components[0]!.id).toBe(before.components[0]!.id);
  });

  it("rejects adding a duplicate component id", () => {
    const before = classicCrmConfig();
    const duplicate = before.components[0]!;
    const result = applyPatch(before, [{ op: "add_component", component: duplicate }]);
    expect(result.applied).toHaveLength(0);
    expect(result.issues.join(" ")).toContain("already exists");
  });

  it("removes a component and refuses to empty the interface", () => {
    const before = classicCrmConfig();
    const removed = applyPatch(before, [{ op: "remove_component", id: before.components[0]!.id }]);
    expect(removed.config.components).toHaveLength(before.components.length - 1);
    expect(removed.issues).toEqual([]);

    const one = rolePresetConfig("sales_rep");
    const single = { ...one, components: [one.components[0]!] };
    const emptied = applyPatch(single, [{ op: "remove_component", id: single.components[0]!.id }]);
    expect(emptied.applied).toHaveLength(0);
    expect(emptied.issues.join(" ")).toContain("at least one component");
  });

  it("updates a component but never its type or id", () => {
    const before = classicCrmConfig();
    const target = before.components.find((component) => component.type === "chart")!;
    const updated = applyPatch(before, [
      { op: "update_component", id: target.id, changes: { title: "Revenue (renamed)", chartType: "line" } },
    ]);
    expect(updated.issues).toEqual([]);
    expect(updated.config.components.find((component) => component.id === target.id)).toMatchObject({
      title: "Revenue (renamed)",
      chartType: "line",
    });

    const typeChange = applyPatch(before, [
      { op: "update_component", id: target.id, changes: { type: "form" } },
    ]);
    expect(typeChange.applied).toHaveLength(0);
    expect(typeChange.issues.join(" ")).toContain("Cannot change component type");

    const idChange = applyPatch(before, [
      { op: "update_component", id: target.id, changes: { id: "new-id" } },
    ]);
    expect(idChange.applied).toHaveLength(0);
  });

  it("rejects invalid property updates after merge", () => {
    const before = classicCrmConfig();
    const target = before.components.find((component) => component.type === "table")!;
    const result = applyPatch(before, [
      { op: "update_component", id: target.id, changes: { dataset: "users" } },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("moves components and preserves the others", () => {
    const before = classicCrmConfig();
    const last = before.components.at(-1)!;
    const result = applyPatch(before, [{ op: "move_component", id: last.id, index: 0 }]);
    expect(result.issues).toEqual([]);
    expect(result.config.components[0]!.id).toBe(last.id);
    expect(result.config.components).toHaveLength(before.components.length);
  });

  it("replaces one group and keeps unrelated groups intact", () => {
    const before = classicCrmConfig();
    const automationComponent = componentSchema.parse({
      type: "workflow-panel",
      id: "keep-me",
      title: "Automations",
      limit: 4,
      span: 6,
      group: "automation",
      showRuns: true,
    });
    const withAutomation = applyPatch(before, [{ op: "add_component", component: automationComponent }]).config;
    const result = applyPatch(withAutomation, [
      {
        op: "replace_group",
        group: "overview",
        components: [
          componentSchema.parse({
            type: "metric",
            id: "only-metric",
            metric: "won_revenue",
            title: "Won revenue",
          }),
        ],
      },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.config.components.some((component) => component.id === "keep-me")).toBe(true);
    expect(result.config.components.filter((component) => component.group === "overview")).toHaveLength(1);
    expect(result.config.components.some((component) => component.id === "c-revenue")).toBe(false);
  });

  it("applies accessibility, layout, navigation and header settings", () => {
    const before = classicCrmConfig();
    const result = applyPatch(before, [
      { op: "set_accessibility", accessibility: { fontSize: "lg", reduceClutter: true } },
      { op: "set_layout", layout: { density: "compact", gap: "sm" } },
      { op: "set_navigation", items: [{ id: "nav-home", label: "Home", href: "/studio", icon: "layout-dashboard" }] },
      { op: "set_header", header: { title: "Focus", subtitle: "Only what matters" } },
      { op: "set_meta", name: "Focus view" },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.config.accessibility.fontSize).toBe("lg");
    expect(result.config.accessibility.reduceClutter).toBe(true);
    expect(result.config.layout.density).toBe("compact");
    expect(result.config.navigation.items).toHaveLength(1);
    expect(result.config.header.title).toBe("Focus");
    expect(result.config.name).toBe("Focus view");
  });

  it("collects partial failures without applying anything", () => {
    const before = classicCrmConfig();
    const result = applyPatch(before, [
      { op: "remove_component", id: "does-not-exist" },
      { op: "set_layout", layout: { density: "spacious" } },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.issues.join(" ")).toContain("not found");
    expect(result.config.layout.density).toBe("spacious");
  });

  it("summarises operations and diffs configurations", () => {
    const before = rolePresetConfig("general");
    const ops: PatchOp[] = [
      { op: "update_component", id: before.components[0]!.id, changes: { title: "Renamed" } },
      { op: "set_layout", layout: { density: "compact" } },
    ];
    const changes = summarizeOperations(ops);
    expect(changes[0]?.kind).toBe("update");
    expect(changes[1]?.kind).toBe("layout");

    const after = applyPatch(before, ops).config;
    const diff = diffConfigs(before, after);
    expect(diff.kept).toHaveLength(before.components.length);
    expect(diff.layoutChanged).toBe(true);
    expect(diff.accessibilityChanged).toBe(false);
  });
});

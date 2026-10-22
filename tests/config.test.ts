import { describe, expect, it } from "vitest";
import {
  ALL_DATASET_KEYS,
  datasetFields,
  morphConfigSchema,
  validateConfig,
  type MorphConfig,
} from "@/lib/morph/config";
import { classicCrmConfig, rolePresetConfig } from "@/lib/morph/presets";

const ROLES = ["sales_manager", "sales_rep", "ops_manager", "general"] as const;

function withComponents(base: MorphConfig, components: unknown[]): unknown {
  return { ...base, components };
}

describe("interface schema", () => {
  it("validates every role preset and the classic baseline", () => {
    for (const role of ROLES) {
      const result = validateConfig(rolePresetConfig(role));
      expect(result.ok, role).toBe(true);
      expect(result.config!.components.length).toBeGreaterThan(0);
    }
    const classic = validateConfig(classicCrmConfig());
    expect(classic.ok).toBe(true);
    expect(classic.config!.navigation.items.map((item) => item.href)).toContain("/studio/crm/leads");
  });

  it("applies registry defaults to components", () => {
    const parsed = morphConfigSchema.parse({
      schemaVersion: 1,
      name: "Defaults",
      layout: {},
      accessibility: {},
      navigation: { items: [{ id: "nav", label: "Home", href: "/studio", icon: "layout-dashboard" }] },
      header: { title: "Hello" },
      components: [
        { type: "metric", id: "m1", metric: "pipeline_value" },
        { type: "table", id: "t1", dataset: "leads", columns: ["name"] },
      ],
    });
    expect(parsed.components[0]).toMatchObject({ span: 6, group: "overview", hidden: false });
    expect(parsed.components[1]).toMatchObject({ limit: 10, search: false, rowActions: [] });
    expect(parsed.layout.columns).toBe(12);
  });

  it("rejects duplicate component ids", () => {
    const base = rolePresetConfig("general");
    const result = validateConfig(
      withComponents(base, [
        { type: "metric", id: "same", metric: "pipeline_value" },
        { type: "metric", id: "same", metric: "won_revenue" },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("Duplicate component id");
  });

  it("rejects unsupported component types", () => {
    const base = rolePresetConfig("general");
    const result = validateConfig(
      withComponents(base, [{ type: "iframe", id: "evil", src: "https://example.com" }]),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects data bindings to fields that do not exist", () => {
    const base = rolePresetConfig("general");
    const result = validateConfig(
      withComponents(base, [
        { type: "table", id: "bad-field", dataset: "leads", columns: ["name", "social_security_number"] },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("is not available on dataset");

    const badSort = validateConfig(
      withComponents(base, [
        { type: "table", id: "bad-sort", dataset: "deals", columns: ["name"], sortField: "password" },
      ]),
    );
    expect(badSort.ok).toBe(false);
  });

  it("rejects datasets outside the registry", () => {
    const base = rolePresetConfig("general");
    const result = validateConfig(
      withComponents(base, [{ type: "table", id: "bad-dataset", dataset: "users", columns: ["name"] }]),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects actions outside the allowlist", () => {
    const base = rolePresetConfig("general");
    const result = validateConfig(
      withComponents(base, [
        {
          type: "table",
          id: "bad-action",
          dataset: "leads",
          columns: ["name"],
          rowActions: ["drop_database"],
        },
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects navigation routes outside the allowlist", () => {
    const base = rolePresetConfig("general");
    const result = validateConfig({
      ...base,
      navigation: { items: [{ id: "nav", label: "Admin", href: "/admin", icon: "settings" }] },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty component list", () => {
    const base = rolePresetConfig("general");
    const result = validateConfig(withComponents(base, []));
    expect(result.ok).toBe(false);
  });

  it("exposes a resolvable field registry for every dataset", () => {
    for (const key of ALL_DATASET_KEYS) {
      const fields = datasetFields(key);
      expect(fields.length).toBeGreaterThan(0);
      expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
    }
  });

  it("keeps the classic baseline strictly larger than the simplified rep preset", () => {
    const classic = classicCrmConfig();
    const rep = rolePresetConfig("sales_rep");
    expect(classic.components.length).toBeGreaterThan(rep.components.length);
    expect(rep.accessibility.reduceClutter).toBe(true);
  });
});

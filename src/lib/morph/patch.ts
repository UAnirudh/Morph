/**
 * Schema patches.
 *
 * The Morph Engine never regenerates an entire interface unless it has to.
 * It emits a small list of typed operations which are applied to the current
 * configuration, then the *result* is re-validated against the registry.
 * Preserving unrelated components is a product requirement, not a nicety.
 */
import { z } from "zod";
import {
  accessibilitySchema,
  componentSchema,
  layoutSchema,
  morphConfigSchema,
  navigationItemSchema,
  type MorphComponent,
  type MorphConfig,
} from "./config";

export const patchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_component"),
    component: componentSchema,
    index: z.number().int().min(0).max(24).optional(),
  }),
  z.object({ op: z.literal("remove_component"), id: z.string().min(1).max(64) }),
  z.object({
    op: z.literal("update_component"),
    id: z.string().min(1).max(64),
    changes: z.record(z.unknown()),
  }),
  z.object({
    op: z.literal("move_component"),
    id: z.string().min(1).max(64),
    index: z.number().int().min(0).max(23),
  }),
  z.object({
    op: z.literal("replace_group"),
    group: z.enum(["overview", "pipeline", "work", "activity", "automation", "records"]),
    components: z.array(componentSchema).max(12),
  }),
  z.object({ op: z.literal("set_layout"), layout: layoutSchema.partial() }),
  z.object({ op: z.literal("set_accessibility"), accessibility: accessibilitySchema.partial() }),
  z.object({ op: z.literal("set_navigation"), items: z.array(navigationItemSchema).min(1).max(10) }),
  z.object({
    op: z.literal("set_header"),
    header: z
      .object({
        title: z.string().min(1).max(60).optional(),
        subtitle: z.string().max(160).optional(),
        badge: z.string().max(40).optional(),
      })
      .strict(),
  }),
  z.object({
    op: z.literal("set_meta"),
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(240).optional(),
  }),
]);

export type PatchOp = z.infer<typeof patchOpSchema>;

export interface PatchResult {
  config: MorphConfig;
  applied: PatchOp[];
  issues: string[];
}

export function applyPatch(config: MorphConfig, operations: PatchOp[]): PatchResult {
  let working = structuredClone(config) as MorphConfig;
  const applied: PatchOp[] = [];
  const issues: string[] = [];

  for (const op of operations) {
    const result = applyOne(working, op);
    if (result.error) {
      issues.push(result.error);
      continue;
    }
    working = result.config;
    applied.push(op);
  }

  const parsed = morphConfigSchema.safeParse(working);
  if (!parsed.success) {
    return {
      config,
      applied: [],
      issues: [
        ...issues,
        ...parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`),
      ],
    };
  }
  return { config: parsed.data, applied, issues };
}

function applyOne(config: MorphConfig, op: PatchOp): { config: MorphConfig; error?: string } {
  const components = [...config.components];
  switch (op.op) {
    case "add_component": {
      if (components.some((component) => component.id === op.component.id)) {
        return { config, error: `Component "${op.component.id}" already exists` };
      }
      const index = op.index ?? components.length;
      components.splice(Math.min(index, components.length), 0, op.component);
      return { config: { ...config, components } };
    }
    case "remove_component": {
      const next = components.filter((component) => component.id !== op.id);
      if (next.length === components.length) {
        return { config, error: `Component "${op.id}" not found` };
      }
      if (next.length === 0) return { config, error: "An interface must keep at least one component" };
      return { config: { ...config, components: next } };
    }
    case "update_component": {
      const index = components.findIndex((component) => component.id === op.id);
      if (index === -1) return { config, error: `Component "${op.id}" not found` };
      const current = components[index]!;
      if (op.changes.type && op.changes.type !== current.type) {
        return { config, error: `Cannot change component type via update ("${op.id}")` };
      }
      if (op.changes.id && op.changes.id !== current.id) {
        return { config, error: `Cannot change component id ("${op.id}")` };
      }
      const merged = { ...current, ...op.changes } as MorphComponent;
      const parsed = componentSchema.safeParse(merged);
      if (!parsed.success) {
        return {
          config,
          error: `Invalid update for "${op.id}": ${parsed.error.issues
            .map((issue) => issue.message)
            .join("; ")}`,
        };
      }
      components[index] = parsed.data;
      return { config: { ...config, components } };
    }
    case "move_component": {
      const from = components.findIndex((component) => component.id === op.id);
      if (from === -1) return { config, error: `Component "${op.id}" not found` };
      const [moved] = components.splice(from, 1);
      if (!moved) return { config, error: `Component "${op.id}" not found` };
      components.splice(Math.min(op.index, components.length), 0, moved);
      return { config: { ...config, components } };
    }
    case "replace_group": {
      const firstIndex = components.findIndex((component) => component.group === op.group);
      const remaining = components.filter((component) => component.group !== op.group);
      const insertAt = firstIndex === -1 ? remaining.length : Math.min(firstIndex, remaining.length);
      remaining.splice(insertAt, 0, ...op.components);
      if (remaining.length === 0) {
        return { config, error: "An interface must keep at least one component" };
      }
      return { config: { ...config, components: remaining.slice(0, 24) } };
    }
    case "set_layout":
      return { config: { ...config, layout: { ...config.layout, ...op.layout } } };
    case "set_accessibility":
      return {
        config: { ...config, accessibility: { ...config.accessibility, ...op.accessibility } },
      };
    case "set_navigation":
      return { config: { ...config, navigation: { items: op.items } } };
    case "set_header":
      return { config: { ...config, header: { ...config.header, ...op.header } } };
    case "set_meta":
      return {
        config: {
          ...config,
          name: op.name ?? config.name,
          description: op.description ?? config.description,
        },
      };
    default:
      return { config, error: "Unsupported operation" };
  }
}

/* -------------------------------------------------------------------------- */
/* Human-readable diffs (used by the preview panel)                           */
/* -------------------------------------------------------------------------- */

export interface ChangeSummary {
  kind: "add" | "remove" | "update" | "move" | "layout" | "accessibility" | "navigation" | "meta";
  label: string;
  detail?: string;
}

export function summarizeOperations(operations: PatchOp[]): ChangeSummary[] {
  return operations.map((op) => {
    switch (op.op) {
      case "add_component":
        return {
          kind: "add",
          label: `Add ${op.component.type.replace("-", " ")}`,
          detail: op.component.title ?? op.component.id,
        };
      case "remove_component":
        return { kind: "remove", label: "Remove component", detail: op.id };
      case "update_component":
        return {
          kind: "update",
          label: "Update component",
          detail: `${op.id} → ${Object.keys(op.changes).join(", ")}`,
        };
      case "move_component":
        return { kind: "move", label: "Rearrange layout", detail: `${op.id} → #${op.index + 1}` };
      case "replace_group":
        return {
          kind: "update",
          label: `Rebuild ${op.group} section`,
          detail: `${op.components.length} component(s)`,
        };
      case "set_layout":
        return { kind: "layout", label: "Adjust layout", detail: JSON.stringify(op.layout) };
      case "set_accessibility":
        return {
          kind: "accessibility",
          label: "Accessibility settings",
          detail: JSON.stringify(op.accessibility),
        };
      case "set_navigation":
        return { kind: "navigation", label: "Update navigation", detail: `${op.items.length} item(s)` };
      case "set_header":
        return { kind: "meta", label: "Update page header", detail: op.header.title };
      case "set_meta":
        return { kind: "meta", label: "Rename interface", detail: op.name };
      default:
        return { kind: "update", label: "Change" };
    }
  });
}

/** Structural diff between two validated configs, used by before/after views. */
export function diffConfigs(before: MorphConfig, after: MorphConfig) {
  const beforeIds = new Set(before.components.map((c) => c.id));
  const afterIds = new Set(after.components.map((c) => c.id));
  return {
    added: after.components.filter((c) => !beforeIds.has(c.id)),
    removed: before.components.filter((c) => !afterIds.has(c.id)),
    kept: after.components.filter((c) => beforeIds.has(c.id)),
    layoutChanged: JSON.stringify(before.layout) !== JSON.stringify(after.layout),
    accessibilityChanged:
      JSON.stringify(before.accessibility) !== JSON.stringify(after.accessibility),
    navigationChanged:
      JSON.stringify(before.navigation) !== JSON.stringify(after.navigation),
  };
}

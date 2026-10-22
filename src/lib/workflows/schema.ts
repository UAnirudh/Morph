/**
 * Workflow definitions: triggers, conditions and actions.
 *
 * This is another allowlist. A workflow can only reference known triggers,
 * known fields and known actions — it can never run code, shell commands or
 * arbitrary HTTP requests. Every action is executed with the same workspace
 * authorization checks as the equivalent manual UI action.
 */
import { z } from "zod";

export const WORKFLOW_ENTITIES = ["lead", "deal", "task"] as const;
export const workflowEntitySchema = z.enum(WORKFLOW_ENTITIES);
export type WorkflowEntity = z.infer<typeof workflowEntitySchema>;

export const TRIGGER_TYPES = [
  "record_created",
  "record_updated",
  "deal_stage_changed",
  "daily_check",
] as const;
export const triggerTypeSchema = z.enum(TRIGGER_TYPES);
export type TriggerType = z.infer<typeof triggerTypeSchema>;

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  record_created: "Record created",
  record_updated: "Record updated",
  deal_stage_changed: "Deal stage changed",
  daily_check: "Scheduled daily check",
};

/** Fields a workflow may read in a condition. */
export const CONDITION_FIELDS = {
  lead: {
    status: ["new", "contacted", "qualified", "unqualified", "converted"],
    source: ["inbound", "outbound", "referral", "event", "partner"],
    score: "number",
  },
  deal: {
    stage: ["prospecting", "qualification", "proposal", "negotiation", "won", "lost"],
    amount: "number",
    probability: "number",
  },
  task: {
    status: ["open", "in_progress", "done"],
    priority: ["low", "medium", "high"],
  },
} as const;

/** Fields a workflow may write. Anything else is rejected at validation time. */
export const WRITABLE_FIELDS = {
  lead: ["status", "score", "flagged"],
  deal: ["stage", "probability"],
  task: ["status", "priority"],
} as const;

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("field_equals"),
    field: z.enum(["status", "stage", "source", "priority"]),
    value: z.string().min(1).max(40),
  }),
  z.object({
    type: z.literal("field_gte"),
    field: z.enum(["score", "amount", "probability"]),
    value: z.number().min(0).max(10_000_000),
  }),
  z.object({
    type: z.literal("field_lte"),
    field: z.enum(["score", "amount", "probability"]),
    value: z.number().min(0).max(10_000_000),
  }),
  z.object({
    type: z.literal("days_since_contact_gte"),
    value: z.number().int().min(1).max(365),
    appliesTo: z.literal("lead").default("lead"),
  }),
  z.object({
    type: z.literal("days_since_update_gte"),
    value: z.number().int().min(1).max(365),
    appliesTo: z.literal("deal").default("deal"),
  }),
  z.object({
    type: z.literal("assigned_to_owner"),
    appliesTo: z.enum(WORKFLOW_ENTITIES).default("lead"),
  }),
  z.object({
    type: z.literal("overdue_task"),
    appliesTo: z.literal("task").default("task"),
  }),
  z.object({
    type: z.literal("flagged"),
    value: z.boolean().default(true),
  }),
]);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1).max(120),
    priority: z.enum(["low", "medium", "high"]).default("high"),
    dueInDays: z.number().int().min(0).max(60).default(1),
    assignTo: z.enum(["owner", "record_owner", "me"]).default("record_owner"),
  }),
  z.object({
    type: z.literal("update_field"),
    field: z.string().min(1).max(40),
    value: z.union([z.string().max(40), z.number().min(0).max(10_000_000)]),
  }),
  z.object({
    type: z.literal("flag_record"),
    reason: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal("notify"),
    title: z.string().min(1).max(80),
    body: z.string().max(200).default(""),
  }),
]);

export type WorkflowCondition = z.infer<typeof conditionSchema>;
export type WorkflowAction = z.infer<typeof actionSchema>;

export const workflowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(3).max(80),
    description: z.string().max(240).default(""),
    trigger: z.object({
      type: triggerTypeSchema,
      entity: workflowEntitySchema.default("lead"),
    }),
    conditions: z.array(conditionSchema).max(5).default([]),
    actions: z.array(actionSchema).min(1).max(5),
  })
  .superRefine((definition, ctx) => {
    const entity = definition.trigger.entity;
    definition.conditions.forEach((condition, index) => {
      switch (condition.type) {
        case "field_equals": {
          const allowed = CONDITION_FIELDS[entity] as Record<string, unknown>;
          if (!(condition.field in allowed)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Field "${condition.field}" cannot be read on ${entity} records`,
              path: ["conditions", index, "field"],
            });
          }
          const values = allowed[condition.field];
          if (Array.isArray(values) && !values.includes(condition.value)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `"${condition.value}" is not a valid value for ${entity}.${condition.field}`,
              path: ["conditions", index, "value"],
            });
          }
          break;
        }
        case "field_gte":
        case "field_lte": {
          const allowed = CONDITION_FIELDS[entity] as Record<string, unknown>;
          if (allowed[condition.field] !== "number") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Field "${condition.field}" is not numeric on ${entity} records`,
              path: ["conditions", index, "field"],
            });
          }
          break;
        }
        case "days_since_contact_gte":
          if (entity !== "lead") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Contact recency conditions apply to leads only",
              path: ["conditions", index],
            });
          }
          break;
        case "days_since_update_gte":
          if (entity !== "deal") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Update recency conditions apply to deals only",
              path: ["conditions", index],
            });
          }
          break;
        case "overdue_task":
          if (entity !== "task") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Overdue conditions apply to tasks only",
              path: ["conditions", index],
            });
          }
          break;
        default:
          break;
      }
    });
    if (definition.trigger.type === "deal_stage_changed" && entity !== "deal") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A deal stage trigger must point at deals",
        path: ["trigger", "entity"],
      });
    }
    definition.actions.forEach((action, index) => {
      if (action.type === "update_field") {
        const writable = WRITABLE_FIELDS[entity] as readonly string[];
        if (!writable.includes(action.field)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${action.field}" is not a writable field on ${entity} records (allowed: ${writable.join(", ")})`,
            path: ["actions", index, "field"],
          });
        }
        const fieldValues = (CONDITION_FIELDS[entity] as Record<string, unknown>)[action.field];
        if (Array.isArray(fieldValues) && !fieldValues.includes(action.value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${String(action.value)}" is not a valid value for ${entity}.${action.field}`,
            path: ["actions", index, "value"],
          });
        }
      }
    });
  });

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export function validateWorkflowDefinition(input: unknown) {
  const parsed = workflowDefinitionSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, definition: parsed.data, issues: [] as string[] };
  return {
    ok: false as const,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "definition"}: ${issue.message}`,
    ),
  };
}

export function describeCondition(condition: WorkflowCondition): string {
  switch (condition.type) {
    case "field_equals":
      return `${condition.field} is ${condition.value}`;
    case "field_gte":
      return `${condition.field} ≥ ${condition.value}`;
    case "field_lte":
      return `${condition.field} ≤ ${condition.value}`;
    case "days_since_contact_gte":
      return `no contact in ${condition.value}+ days`;
    case "days_since_update_gte":
      return `no update in ${condition.value}+ days`;
    case "assigned_to_owner":
      return "assigned to the workflow owner";
    case "overdue_task":
      return "task is overdue";
    case "flagged":
      return condition.value ? "record is flagged" : "record is not flagged";
    default:
      return "condition";
  }
}

export function describeAction(action: WorkflowAction): string {
  switch (action.type) {
    case "create_task":
      return `create ${action.priority}-priority task “${action.title}”`;
    case "update_field":
      return `set ${action.field} to ${action.value}`;
    case "flag_record":
      return `flag record: ${action.reason}`;
    case "notify":
      return `notify “${action.title}”`;
    default:
      return "action";
  }
}

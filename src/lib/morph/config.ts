/**
 * The Morph interface schema.
 *
 * Morph never runs AI-generated React or JavaScript. A model (or the local
 * planner) can only emit a *configuration* built from the registries below:
 * approved component types, approved datasets, approved fields, approved
 * actions and approved routes. Everything is validated with Zod before a
 * single pixel changes.
 *
 * Generated UI is untrusted input: the registry is the security boundary.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/* Roles, groups, routes, icons                                               */
/* -------------------------------------------------------------------------- */

export const JOB_ROLES = ["sales_manager", "sales_rep", "ops_manager", "general"] as const;
export const jobRoleSchema = z.enum(JOB_ROLES);
export type JobRole = z.infer<typeof jobRoleSchema>;

export const ROLE_LABELS: Record<JobRole, string> = {
  sales_manager: "Sales manager",
  sales_rep: "Sales representative",
  ops_manager: "Operations manager",
  general: "General user",
};

export const COMPONENT_GROUPS = [
  "overview",
  "pipeline",
  "work",
  "activity",
  "automation",
  "records",
] as const;
export const groupSchema = z.enum(COMPONENT_GROUPS);
export type ComponentGroup = z.infer<typeof groupSchema>;

export const GROUP_LABELS: Record<ComponentGroup, string> = {
  overview: "Overview",
  pipeline: "Pipeline",
  work: "Work queue",
  activity: "Activity",
  automation: "Automation",
  records: "Records",
};

export const ROUTES = [
  "/studio",
  "/studio/crm/leads",
  "/studio/crm/deals",
  "/studio/crm/tasks",
  "/studio/crm/companies",
  "/studio/crm/activities",
  "/studio/workflows",
  "/studio/versions",
  "/studio/compare",
  "/studio/settings",
  "/studio/workspaces",
  "/studio/templates",
] as const;
export const routeSchema = z.enum(ROUTES);
export type AppRoute = z.infer<typeof routeSchema>;

export const ICONS = [
  "layout-dashboard",
  "users",
  "user-check",
  "briefcase",
  "check-square",
  "building",
  "activity",
  "workflow",
  "settings",
  "sparkles",
  "trending-up",
  "target",
  "alert-triangle",
  "clock",
  "dollar-sign",
  "filter",
  "zap",
  "list-checks",
  "chart-bar",
  "arrow-right",
  "plus",
  "layers",
  "git-compare",
  "flag",
] as const;
export const iconSchema = z.enum(ICONS);
export type IconName = z.infer<typeof iconSchema>;

/* -------------------------------------------------------------------------- */
/* Field + dataset registry (the data-binding allowlist)                      */
/* -------------------------------------------------------------------------- */

export type FieldType =
  | "text"
  | "currency"
  | "number"
  | "percent"
  | "date"
  | "relative_date"
  | "badge"
  | "person"
  | "boolean";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
}

const f = (key: string, label: string, type: FieldType = "text"): FieldSpec => ({
  key,
  label,
  type,
});

const LEAD_FIELDS: FieldSpec[] = [
  f("name", "Lead"),
  f("company", "Company"),
  f("status", "Status", "badge"),
  f("score", "Score", "number"),
  f("owner", "Owner", "person"),
  f("source", "Source"),
  f("lastContacted", "Last contacted", "relative_date"),
  f("daysSinceContact", "Days since contact", "number"),
  f("email", "Email"),
  f("phone", "Phone"),
  f("flagged", "Flagged", "boolean"),
  f("createdAt", "Created", "date"),
];

const DEAL_FIELDS: FieldSpec[] = [
  f("name", "Deal"),
  f("company", "Company"),
  f("stage", "Stage", "badge"),
  f("amount", "Amount", "currency"),
  f("probability", "Probability", "percent"),
  f("owner", "Owner", "person"),
  f("expectedCloseDate", "Expected close", "date"),
  f("daysInStage", "Days in stage", "number"),
  f("updatedAt", "Updated", "relative_date"),
];

const TASK_FIELDS: FieldSpec[] = [
  f("title", "Task"),
  f("status", "Status", "badge"),
  f("priority", "Priority", "badge"),
  f("dueDate", "Due", "date"),
  f("assignee", "Assignee", "person"),
  f("relatedType", "Related to"),
  f("notes", "Notes"),
  f("createdAt", "Created", "date"),
];

const COMPANY_FIELDS: FieldSpec[] = [
  f("name", "Company"),
  f("industry", "Industry"),
  f("size", "Size"),
  f("city", "City"),
  f("openDeals", "Open deals", "number"),
  f("revenue", "Won revenue", "currency"),
];

const CONTACT_FIELDS: FieldSpec[] = [
  f("name", "Contact"),
  f("title", "Title"),
  f("email", "Email"),
  f("company", "Company"),
  f("phone", "Phone"),
];

const ACTIVITY_FIELDS: FieldSpec[] = [
  f("subject", "Activity"),
  f("kind", "Type", "badge"),
  f("actor", "By", "person"),
  f("createdAt", "When", "relative_date"),
  f("body", "Details"),
];

const WORKFLOW_FIELDS: FieldSpec[] = [
  f("name", "Workflow"),
  f("triggerType", "Trigger", "badge"),
  f("enabled", "Active", "boolean"),
  f("lastRunAt", "Last run", "relative_date"),
  f("runCount", "Runs", "number"),
];

export const RECORD_DATASETS = {
  leads: { label: "Leads", fields: LEAD_FIELDS, entity: "lead" as const },
  my_leads: { label: "My leads", fields: LEAD_FIELDS, entity: "lead" as const },
  overdue_followups: { label: "Overdue follow-ups", fields: LEAD_FIELDS, entity: "lead" as const },
  priority_leads: { label: "Priority leads", fields: LEAD_FIELDS, entity: "lead" as const },
  flagged_leads: { label: "Flagged leads", fields: LEAD_FIELDS, entity: "lead" as const },
  deals: { label: "Deals", fields: DEAL_FIELDS, entity: "deal" as const },
  at_risk_deals: { label: "At-risk deals", fields: DEAL_FIELDS, entity: "deal" as const },
  tasks: { label: "Tasks", fields: TASK_FIELDS, entity: "task" as const },
  my_tasks: { label: "My tasks", fields: TASK_FIELDS, entity: "task" as const },
  today_tasks: { label: "Today's tasks", fields: TASK_FIELDS, entity: "task" as const },
  overdue_tasks: { label: "Overdue tasks", fields: TASK_FIELDS, entity: "task" as const },
  companies: { label: "Companies", fields: COMPANY_FIELDS, entity: "company" as const },
  contacts: { label: "Contacts", fields: CONTACT_FIELDS, entity: "contact" as const },
  activities: { label: "Activity feed", fields: ACTIVITY_FIELDS, entity: "activity" as const },
  workflows: { label: "Workflows", fields: WORKFLOW_FIELDS, entity: "workflow" as const },
} as const;

export type RecordDataset = keyof typeof RECORD_DATASETS;
export const RECORD_DATASET_KEYS = Object.keys(RECORD_DATASETS) as RecordDataset[];

export const CHART_DATASETS = {
  revenue_by_month: {
    label: "Revenue by month",
    x: "month",
    y: "revenue",
    yLabel: "Revenue",
    secondary: "deals",
    fields: [f("month", "Month"), f("revenue", "Revenue", "currency"), f("deals", "Deals", "number")],
  },
  deals_by_stage: {
    label: "Deals by stage",
    x: "stage",
    y: "count",
    yLabel: "Deals",
    secondary: "value",
    fields: [f("stage", "Stage"), f("count", "Deals", "number"), f("value", "Value", "currency")],
  },
  leads_by_source: {
    label: "Leads by source",
    x: "source",
    y: "count",
    yLabel: "Leads",
    secondary: "converted",
    fields: [f("source", "Source"), f("count", "Leads", "number"), f("converted", "Converted", "number")],
  },
  conversion_funnel: {
    label: "Lead conversion",
    x: "stage",
    y: "count",
    yLabel: "Leads",
    fields: [f("stage", "Stage"), f("count", "Leads", "number")],
  },
  task_status: {
    label: "Task status",
    x: "status",
    y: "count",
    yLabel: "Tasks",
    fields: [f("status", "Status"), f("count", "Tasks", "number")],
  },
  workload_by_owner: {
    label: "Workload by owner",
    x: "owner",
    y: "openTasks",
    yLabel: "Open tasks",
    secondary: "overdue",
    fields: [
      f("owner", "Owner"),
      f("openTasks", "Open tasks", "number"),
      f("overdue", "Overdue", "number"),
      f("openDeals", "Open deals", "number"),
    ],
  },
  activity_trend: {
    label: "Activity trend",
    x: "day",
    y: "count",
    yLabel: "Activities",
    fields: [f("day", "Day"), f("count", "Activities", "number")],
  },
  pipeline_aging: {
    label: "Pipeline aging",
    x: "bucket",
    y: "count",
    yLabel: "Deals",
    secondary: "value",
    fields: [f("bucket", "Age"), f("count", "Deals", "number"), f("value", "Value", "currency")],
  },
} as const;

export type ChartDataset = keyof typeof CHART_DATASETS;
export const CHART_DATASET_KEYS = Object.keys(CHART_DATASETS) as ChartDataset[];
export const ALL_DATASET_KEYS = [...RECORD_DATASET_KEYS, ...CHART_DATASET_KEYS] as const;
export type DatasetKey = (typeof ALL_DATASET_KEYS)[number];

export function datasetFields(key: DatasetKey): FieldSpec[] {
  return key in RECORD_DATASETS
    ? [...RECORD_DATASETS[key as RecordDataset].fields]
    : [...CHART_DATASETS[key as ChartDataset].fields];
}

export function datasetLabel(key: DatasetKey): string {
  return key in RECORD_DATASETS
    ? RECORD_DATASETS[key as RecordDataset].label
    : CHART_DATASETS[key as ChartDataset].label;
}

export function datasetEntity(key: RecordDataset) {
  return RECORD_DATASETS[key].entity;
}

/* -------------------------------------------------------------------------- */
/* Metrics + actions (the action allowlist)                                   */
/* -------------------------------------------------------------------------- */

export const METRICS = {
  pipeline_value: { label: "Pipeline value", format: "currency", hint: "Open deal value" },
  won_revenue: { label: "Won revenue", format: "currency", hint: "Closed-won in period" },
  open_deals: { label: "Open deals", format: "number", hint: "Deals not closed" },
  win_rate: { label: "Win rate", format: "percent", hint: "Won ÷ closed deals" },
  overdue_followups: {
    label: "Overdue follow-ups",
    format: "number",
    hint: "Leads untouched for 7+ days",
  },
  task_due_today: { label: "Due today", format: "number", hint: "Open tasks due today" },
  my_open_tasks: { label: "My open tasks", format: "number", hint: "Assigned to you" },
  avg_deal_size: { label: "Avg deal size", format: "currency", hint: "Mean open deal value" },
  team_workload: { label: "Team workload", format: "number", hint: "Open tasks across team" },
  lead_conversion: { label: "Lead conversion", format: "percent", hint: "Qualified ÷ all leads" },
  active_leads: { label: "Active leads", format: "number", hint: "Leads not closed" },
  at_risk_deals: { label: "At-risk deals", format: "number", hint: "Stalled 21+ days" },
  flagged_leads: { label: "Flagged leads", format: "number", hint: "Flagged by workflows" },
  tasks_completed_week: { label: "Tasks completed", format: "number", hint: "Last 7 days" },
} as const;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export const ACTION_DEFS = {
  mark_lead_contacted: {
    label: "Mark contacted",
    entity: "lead",
    kind: "mutation",
    icon: "user-check",
    description: "Sets the lead status to contacted and stamps last-contact time.",
  },
  qualify_lead: {
    label: "Qualify lead",
    entity: "lead",
    kind: "mutation",
    icon: "target",
    description: "Moves a lead to qualified.",
  },
  create_followup_task: {
    label: "Create follow-up",
    entity: "lead",
    kind: "mutation",
    icon: "check-square",
    description: "Creates a follow-up task due tomorrow.",
  },
  advance_deal_stage: {
    label: "Advance stage",
    entity: "deal",
    kind: "mutation",
    icon: "arrow-right",
    description: "Moves a deal to the next pipeline stage.",
  },
  complete_task: {
    label: "Complete",
    entity: "task",
    kind: "mutation",
    icon: "check-square",
    description: "Marks a task done.",
  },
  new_lead: {
    label: "New lead",
    entity: "record",
    kind: "dialog",
    icon: "plus",
    description: "Opens the lead creation form.",
  },
  new_task: {
    label: "New task",
    entity: "record",
    kind: "dialog",
    icon: "plus",
    description: "Opens the task creation form.",
  },
  log_activity: {
    label: "Log activity",
    entity: "record",
    kind: "dialog",
    icon: "activity",
    description: "Records a call, email or meeting.",
  },
  open_record: {
    label: "Open",
    entity: "record",
    kind: "navigate",
    icon: "arrow-right",
    description: "Navigates to the full record list.",
  },
  run_workflow: {
    label: "Run workflow",
    entity: "workflow",
    kind: "mutation",
    icon: "zap",
    description: "Executes a workflow check now.",
  },
  toggle_workflow: {
    label: "Toggle",
    entity: "workflow",
    kind: "mutation",
    icon: "workflow",
    description: "Enables or disables a workflow.",
  },
} as const;

export type ActionId = keyof typeof ACTION_DEFS;
export const ACTION_IDS = Object.keys(ACTION_DEFS) as ActionId[];

/** Actions that mutate a record, grouped by the entity they operate on. */
export function actionsForEntity(entity: "lead" | "deal" | "task" | "workflow" | "company" | "contact" | "activity"): ActionId[] {
  return ACTION_IDS.filter((id) => ACTION_DEFS[id].entity === entity);
}

/* -------------------------------------------------------------------------- */
/* Zod schemas                                                                */
/* -------------------------------------------------------------------------- */

const idSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, "Component ids must be lowercase kebab-case");

const spanSchema = z.number().int().min(1).max(12);

const baseComponent = {
  id: idSchema,
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(200).optional(),
  span: spanSchema.default(6),
  group: groupSchema.default("overview"),
  hidden: z.boolean().default(false),
  visibleFor: z.array(jobRoleSchema).max(4).optional(),
};

export const chartTypeSchema = z.enum(["bar", "line", "area", "pie", "funnel"]);
export type ChartType = z.infer<typeof chartTypeSchema>;

function recordDatasetSchema() {
  return z.enum(RECORD_DATASET_KEYS as [RecordDataset, ...RecordDataset[]]);
}
function chartDatasetSchema() {
  return z.enum(CHART_DATASET_KEYS as [ChartDataset, ...ChartDataset[]]);
}

export const metricComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("metric"),
  metric: z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]),
  format: z.enum(["auto", "currency", "number", "percent"]).default("auto"),
  hint: z.string().max(80).optional(),
  compare: z.boolean().default(false),
});

export const chartComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("chart"),
  dataset: chartDatasetSchema(),
  chartType: chartTypeSchema.default("bar"),
  height: z.number().int().min(120).max(420).default(220),
  showLegend: z.boolean().default(true),
  stack: z.boolean().default(false),
});

export const tableComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("table"),
  dataset: recordDatasetSchema(),
  columns: z.array(z.string().min(1).max(40)).min(1).max(8),
  limit: z.number().int().min(3).max(50).default(10),
  sortField: z.string().max(40).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  search: z.boolean().default(false),
  compact: z.boolean().default(false),
  rowActions: z.array(z.enum(ACTION_IDS as [ActionId, ...ActionId[]])).max(3).default([]),
  filterField: z.string().max(40).optional(),
  filterValues: z.array(z.string().max(40)).max(10).optional(),
  emptyHint: z.string().max(160).optional(),
});

export const listComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("list"),
  dataset: recordDatasetSchema(),
  fields: z.array(z.string().min(1).max(40)).min(1).max(4),
  limit: z.number().int().min(3).max(25).default(6),
  tone: z.enum(["neutral", "warning", "danger", "success"]).default("neutral"),
  action: z.enum(ACTION_IDS as [ActionId, ...ActionId[]]).optional(),
  emptyHint: z.string().max(160).optional(),
});

export const quickActionsComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("quick-actions"),
  actions: z.array(z.enum(ACTION_IDS as [ActionId, ...ActionId[]])).min(1).max(6),
  variant: z.enum(["buttons", "list"]).default("buttons"),
});

export const filtersComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("filters"),
  dataset: recordDatasetSchema(),
  fields: z
    .array(
      z.object({
        field: z.string().min(1).max(40),
        label: z.string().min(1).max(40),
      }),
    )
    .min(1)
    .max(4),
});

export const formComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("form"),
  entity: z.enum(["lead", "deal", "task"]),
  fields: z.array(z.string().min(1).max(40)).min(1).max(8),
  submitLabel: z.string().min(1).max(40).default("Create"),
});

export const insightComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("insight"),
  tone: z.enum(["info", "warning", "success", "danger", "primary"]).default("info"),
  body: z.string().min(1).max(320),
  source: z.enum(["static", "computed"]).default("static"),
  metric: z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]).optional(),
});

export const progressComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("progress"),
  metric: z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]).default("pipeline_value"),
  target: z.number().positive().max(100_000_000).default(1_000_000),
  label: z.string().max(60).default("Quarterly target"),
});

export const workflowPanelComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("workflow-panel"),
  limit: z.number().int().min(1).max(8).default(4),
  showRuns: z.boolean().default(true),
});

export const activityFeedComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("activity-feed"),
  limit: z.number().int().min(3).max(20).default(8),
});

export const taskListComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("task-list"),
  scope: z.enum(["mine", "team"]).default("mine"),
  filter: z.enum(["today", "overdue", "open", "all"]).default("open"),
  limit: z.number().int().min(3).max(25).default(8),
});

export const navShortcutsComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("nav-shortcuts"),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(30),
        href: routeSchema,
        icon: iconSchema.default("arrow-right"),
      }),
    )
    .min(1)
    .max(6),
});

export const pipelineBoardComponentSchema = z.object({
  ...baseComponent,
  type: z.literal("pipeline-board"),
  groupBy: z.literal("stage").default("stage"),
  metric: z.enum(["amount", "count"]).default("amount"),
  limitPerStage: z.number().int().min(1).max(10).default(4),
});

export const COMPONENT_TYPES = [
  "metric",
  "chart",
  "table",
  "list",
  "quick-actions",
  "filters",
  "form",
  "insight",
  "progress",
  "workflow-panel",
  "activity-feed",
  "task-list",
  "nav-shortcuts",
  "pipeline-board",
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const componentSchema = z.discriminatedUnion("type", [
  metricComponentSchema,
  chartComponentSchema,
  tableComponentSchema,
  listComponentSchema,
  quickActionsComponentSchema,
  filtersComponentSchema,
  formComponentSchema,
  insightComponentSchema,
  progressComponentSchema,
  workflowPanelComponentSchema,
  activityFeedComponentSchema,
  taskListComponentSchema,
  navShortcutsComponentSchema,
  pipelineBoardComponentSchema,
]);

export type MorphComponent = z.infer<typeof componentSchema>;
export type MetricComponent = z.infer<typeof metricComponentSchema>;
export type ChartComponent = z.infer<typeof chartComponentSchema>;
export type TableComponent = z.infer<typeof tableComponentSchema>;
export type ListComponent = z.infer<typeof listComponentSchema>;
export type InsightComponent = z.infer<typeof insightComponentSchema>;
export type FormComponent = z.infer<typeof formComponentSchema>;
export type TaskListComponent = z.infer<typeof taskListComponentSchema>;

export const layoutSchema = z.object({
  columns: z.literal(12).default(12),
  gap: z.enum(["sm", "md", "lg"]).default("md"),
  density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  showGroupHeadings: z.boolean().default(true),
});

export const accessibilitySchema = z.object({
  fontSize: z.enum(["base", "lg", "xl"]).default("base"),
  highContrast: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
  reduceClutter: z.boolean().default(false),
});

export const navigationItemSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(32),
  href: routeSchema,
  icon: iconSchema.default("arrow-right"),
  badge: z.enum(["overdue_followups", "task_due_today", "flagged_leads"]).optional(),
});
export type NavigationItem = z.infer<typeof navigationItemSchema>;

export const navigationSchema = z.object({
  items: z.array(navigationItemSchema).min(1).max(10),
});

export const morphConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(80),
    description: z.string().max(240).optional(),
    role: jobRoleSchema.optional(),
    layout: layoutSchema,
    accessibility: accessibilitySchema,
    navigation: navigationSchema,
    header: z.object({
      title: z.string().min(1).max(60),
      subtitle: z.string().max(160).optional(),
      badge: z.string().max(40).optional(),
    }),
    components: z.array(componentSchema).min(1).max(24),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    const componentIds = new Set<string>();
    for (const component of config.components) {
      if (componentIds.has(component.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate component id "${component.id}"`,
          path: ["components"],
        });
      }
      componentIds.add(component.id);
    }
    for (const item of config.navigation.items) {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate navigation id "${item.id}"`,
          path: ["navigation", "items"],
        });
      }
      ids.add(item.id);
    }
    // Data bindings must reference fields that exist in the dataset registry.
    config.components.forEach((component, index) => {
      if (
        component.type === "table" ||
        component.type === "list" ||
        component.type === "filters" ||
        component.type === "chart"
      ) {
        const allowed = new Set(datasetFields(component.dataset).map((field) => field.key));
        const referenced = [
          ...(component.type === "table" ? component.columns : []),
          ...(component.type === "list" ? component.fields : []),
          ...(component.type === "filters" ? component.fields.map((field) => field.field) : []),
        ];
        for (const field of referenced) {
          if (!allowed.has(field)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Field "${field}" is not available on dataset "${component.dataset}"`,
              path: ["components", index],
            });
          }
        }
        if (component.type === "table" && component.sortField && !allowed.has(component.sortField)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Sort field "${component.sortField}" is not available on dataset "${component.dataset}"`,
            path: ["components", index],
          });
        }
        if (
          component.type === "table" &&
          component.filterField &&
          !allowed.has(component.filterField)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Filter field "${component.filterField}" is not available on "${component.dataset}"`,
            path: ["components", index],
          });
        }
      }
    });
  });

export type MorphConfig = z.infer<typeof morphConfigSchema>;

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

export interface ValidationResult {
  ok: boolean;
  config?: MorphConfig;
  issues: string[];
}

export function validateConfig(input: unknown): ValidationResult {
  const parsed = morphConfigSchema.safeParse(input);
  if (parsed.success) return { ok: true, config: parsed.data, issues: [] };
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
    ),
  };
}

/** Parse with registry defaults applied (used by the renderer and presets). */
export function parseConfig(input: unknown): MorphConfig {
  return morphConfigSchema.parse(input);
}

export function componentLabel(component: MorphComponent): string {
  if (component.title) return component.title;
  switch (component.type) {
    case "metric":
      return METRICS[component.metric].label;
    case "chart":
      return CHART_DATASETS[component.dataset].label;
    case "table":
    case "list":
    case "filters":
      return datasetLabel(component.dataset);
    case "quick-actions":
      return "Quick actions";
    case "form":
      return `New ${component.entity}`;
    case "insight":
      return "Insight";
    case "progress":
      return "Progress";
    case "workflow-panel":
      return "Automations";
    case "activity-feed":
      return "Recent activity";
    case "task-list":
      return component.scope === "mine" ? "My tasks" : "Team tasks";
    case "nav-shortcuts":
      return "Shortcuts";
    case "pipeline-board":
      return "Pipeline board";
    default:
      return "Component";
  }
}

export function describeComponent(component: MorphComponent): string {
  switch (component.type) {
    case "metric":
      return `metric · ${METRICS[component.metric].label}`;
    case "chart":
      return `${component.chartType} chart · ${CHART_DATASETS[component.dataset].label}`;
    case "table":
      return `table · ${datasetLabel(component.dataset)} (${component.columns.length} cols)`;
    case "list":
      return `list · ${datasetLabel(component.dataset)}`;
    case "quick-actions":
      return `actions · ${component.actions.join(", ")}`;
    case "filters":
      return `filters · ${datasetLabel(component.dataset)}`;
    case "form":
      return `form · new ${component.entity}`;
    case "insight":
      return "insight callout";
    case "progress":
      return "progress toward target";
    case "workflow-panel":
      return "workflow controls";
    case "activity-feed":
      return "activity feed";
    case "task-list":
      return `task list · ${component.scope}/${component.filter}`;
    case "nav-shortcuts":
      return "navigation shortcuts";
    case "pipeline-board":
      return "pipeline board";
    default:
      return "component";
  }
}

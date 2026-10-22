/**
 * The local planner.
 *
 * When no model provider is configured (or the provider is down) Morph still
 * transforms interfaces — using a deterministic intent parser over the same
 * allowlist registry the model uses. It is a real planner, not a canned
 * response table: it parses the instruction into focus areas and modifiers and
 * synthesises schema operations, then the same validator gates the result.
 *
 * The UI always labels which engine produced a proposal, so a demo never
 * pretends local output came from a language model.
 */
import {
  componentSchema,
  type ComponentGroup,
  type JobRole,
  type MorphComponent,
  type MorphConfig,
  type NavigationItem,
  type ActionId,
  type DatasetKey,
} from "./config";
import { morphResultSchema, type MorphResult } from "./result";
import { workflowDefinitionSchema } from "@/lib/workflows/schema";

export interface PlannerInput {
  prompt: string;
  config: MorphConfig;
  jobRole: JobRole;
  goals: string[];
}

type FocusKey =
  | "revenue"
  | "pipeline"
  | "followups"
  | "tasks"
  | "workload"
  | "conversion"
  | "leads"
  | "deals"
  | "activity"
  | "automation";

const FOCUS_PATTERNS: Record<FocusKey, RegExp> = {
  revenue: /\b(revenue|arr|bookings|forecast|income|sales numbers|monthly sales|quota)\b/,
  pipeline: /\b(pipeline|stages?|funnel|deal flow|coverage|opportunit(y|ies) by stage)\b/,
  followups:
    /\b(follow[- ]?ups?|overdue|stale|gone quiet|not contacted|untouched|touchpoint|check[- ]?ins?|went cold)\b/,
  tasks: /\b(tasks?|to-?dos?|priorit(y|ies)|my day|today|due|work queue|next steps?)\b/,
  workload: /\b(workload|capacity|bottleneck|stalled|blocked|team|distribution|overloaded|throughput|ops)\b/,
  conversion: /\b(conversion|win rate|close rate|funnel|lead quality|source)\b/,
  leads: /\b(leads?|prospects?|prospecting)\b/,
  deals: /\b(deals?|opportunit(y|ies)|accounts?|biggest|largest|top)\b/,
  activity: /\b(activity|activities|feed|timeline|history|recent changes)\b/,
  automation: /\b(workflows?|automations?|automate|flags?|flagged|alerts?)\b/,
};

const FOCUS_PRIORITY: FocusKey[] = [
  "revenue",
  "pipeline",
  "followups",
  // Team-level work intent wins over the personal task list: "team workload
  // and unfinished tasks" is an operations view, not a "my day" view.
  "workload",
  "tasks",
  "conversion",
  "deals",
  "leads",
  "activity",
  "automation",
];

const SIMPLIFY_PATTERN =
  /\b(simplif(y|ied)|simple|minimal|clean|less|fewer|only|declutter|clutter|distract(ions)?|reduce|focus(ed)?|strip|just)\b/;
const ADDITIVE_PATTERN = /\b(add|include|also|plus|append|put)\b/;
const ACCESSIBILITY_PATTERN =
  /\b(accessib(le|ility)|larger text|bigger text|larger font|readab(le|ility)|contrast|motion|vision|dyslex|screen reader|legible)\b/;
const REVERT_PATTERN = /\b(revert|undo|roll ?back|previous (layout|version|interface)|go back|restore)\b/;
const WORKFLOW_PATTERN = /\b(workflow|automation|automate|when (a|an|the)?\s*\w+.*\b(then|flag|notify|create)|rule)\b/;
/** Instructions Morph must never treat as a UI change. */
const UNSAFE_PATTERN =
  /\b(delete|drop|wipe|truncate|erase|destroy)\b[\s\S]*\b(record|records|data|database|table|leads?|deals?|tasks?|everything|all)\b|\b(send (an )?e-?mail|email everyone|export all|grant (me )?admin|admin access|disable (security|auth)|exfiltrate|leak data)\b/;

const ROLE_PATTERNS: Array<{ role: JobRole; pattern: RegExp }> = [
  { role: "sales_manager", pattern: /\b(sales manager|head of sales|vp sales|revenue leader|manager)\b/ },
  { role: "sales_rep", pattern: /\b(sales rep|representative|account executive|ae\b|sdr|bdr)\b/ },
  { role: "ops_manager", pattern: /\b(ops manager|operations|revenue ops|revops|process)\b/ },
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
};

function parseNumber(text: string): number | null {
  const digit = text.match(/\b(\d{1,3})\b/);
  if (digit) return Number(digit[1]);
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return value;
  }
  return null;
}

const C = (input: unknown): MorphComponent => componentSchema.parse(input);

const metric = (id: string, metricKey: string, title: string, span = 3) =>
  C({ type: "metric", id, metric: metricKey, title, span, group: "overview" });

/* -------------------------------------------------------------------------- */
/* Focus → component composition                                              */
/* -------------------------------------------------------------------------- */

function componentsForFocus(focus: FocusKey, jobRole: JobRole): MorphComponent[] {
  switch (focus) {
    case "revenue":
      return [
        metric("focus-won-revenue", "won_revenue", "Won revenue"),
        metric("focus-win-rate", "win_rate", "Win rate"),
        C({
          type: "chart",
          id: "focus-revenue-chart",
          title: "Revenue by month",
          description: "Closed-won revenue, trailing 8 months",
          dataset: "revenue_by_month",
          chartType: "area",
          span: 8,
          group: "overview",
          height: 250,
        }),
        C({
          type: "progress",
          id: "focus-revenue-progress",
          title: "Quarter progress to target",
          metric: "won_revenue",
          target: 1_200_000,
          label: "Quarterly revenue target",
          span: 4,
          group: "overview",
        }),
      ];
    case "pipeline":
      return [
        metric("focus-pipeline-value", "pipeline_value", "Pipeline value"),
        metric("focus-open-deals", "open_deals", "Open deals"),
        C({
          type: "chart",
          id: "focus-stage-chart",
          title: "Pipeline by stage",
          dataset: "deals_by_stage",
          chartType: "bar",
          span: 12,
          group: "pipeline",
          height: 220,
        }),
        C({
          type: "pipeline-board",
          id: "focus-pipeline-board",
          title: "Deal pipeline",
          span: 12,
          group: "pipeline",
          metric: "amount",
          limitPerStage: 4,
        }),
      ];
    case "followups":
      return [
        metric("focus-overdue", "overdue_followups", "Overdue follow-ups"),
        metric("focus-flagged", "flagged_leads", "Flagged leads"),
        C({
          type: "list",
          id: "focus-overdue-list",
          title: "Follow-ups that slipped",
          description: "No contact in 7+ days",
          dataset: "overdue_followups",
          fields: ["name", "company", "daysSinceContact", "owner"],
          limit: 6,
          span: 6,
          group: "work",
          tone: "warning",
          action: "mark_lead_contacted",
        }),
        C({
          type: "table",
          id: "focus-overdue-table",
          title: "Overdue follow-ups",
          dataset: "overdue_followups",
          columns: ["name", "company", "status", "lastContacted", "owner"],
          limit: 8,
          span: 6,
          group: "work",
          rowActions: ["mark_lead_contacted", "create_followup_task"],
          sortField: "daysSinceContact",
          sortDirection: "asc",
        }),
      ];
    case "tasks":
      return [
        metric("focus-due-today", "task_due_today", "Due today"),
        metric("focus-my-tasks", "my_open_tasks", "My open tasks"),
        C({
          type: "task-list",
          id: "focus-task-list",
          title: "Today's priorities",
          scope: jobRole === "sales_rep" ? "mine" : "mine",
          filter: "today",
          limit: 8,
          span: 5,
          group: "work",
        }),
        C({
          type: "table",
          id: "focus-task-table",
          title: "My task queue",
          dataset: "my_tasks",
          columns: ["title", "status", "priority", "dueDate", "relatedType"],
          limit: 8,
          span: 7,
          group: "work",
          rowActions: ["complete_task"],
          sortField: "dueDate",
          sortDirection: "asc",
        }),
      ];
    case "workload":
      return [
        metric("focus-workload", "team_workload", "Open tasks"),
        metric("focus-at-risk", "at_risk_deals", "Stalled deals"),
        C({
          type: "chart",
          id: "focus-workload-chart",
          title: "Workload by owner",
          dataset: "workload_by_owner",
          chartType: "bar",
          span: 6,
          group: "overview",
          height: 240,
        }),
        C({
          type: "chart",
          id: "focus-task-status",
          title: "Task status",
          dataset: "task_status",
          chartType: "pie",
          span: 6,
          group: "overview",
          height: 240,
        }),
        C({
          type: "insight",
          id: "focus-bottleneck",
          title: "Bottleneck watch",
          tone: "warning",
          body: "Deals that have not moved in 21+ days and tasks past due are the two biggest drags on throughput. Work the stalled list before adding new pipeline.",
          source: "static",
          span: 4,
          group: "pipeline",
        }),
        C({
          type: "table",
          id: "focus-at-risk-table",
          title: "Stalled deals",
          dataset: "at_risk_deals",
          columns: ["name", "company", "stage", "amount", "owner", "daysInStage"],
          limit: 7,
          span: 8,
          group: "pipeline",
          rowActions: ["advance_deal_stage"],
          sortField: "daysInStage",
        }),
        C({
          type: "table",
          id: "focus-all-tasks",
          title: "Work in flight",
          dataset: "tasks",
          columns: ["title", "status", "priority", "dueDate", "assignee"],
          limit: 10,
          span: 12,
          group: "work",
          rowActions: ["complete_task"],
          filterField: "status",
          filterValues: ["open", "in_progress"],
          sortField: "dueDate",
          sortDirection: "asc",
        }),
      ];
    case "conversion":
      return [
        metric("focus-conversion", "lead_conversion", "Lead conversion"),
        metric("focus-win-rate", "win_rate", "Win rate"),
        C({
          type: "chart",
          id: "focus-funnel",
          title: "Lead conversion funnel",
          dataset: "conversion_funnel",
          chartType: "funnel",
          span: 6,
          group: "overview",
          height: 240,
        }),
        C({
          type: "chart",
          id: "focus-source",
          title: "Leads by source",
          dataset: "leads_by_source",
          chartType: "pie",
          span: 6,
          group: "overview",
          height: 240,
        }),
      ];
    case "leads":
      return [
        metric("focus-active-leads", "active_leads", "Active leads"),
        C({
          type: "table",
          id: "focus-leads-table",
          title: jobRole === "sales_rep" ? "My leads" : "Leads",
          dataset: jobRole === "sales_rep" ? "my_leads" : "leads",
          columns: ["name", "company", "status", "score", "owner", "lastContacted"],
          limit: 10,
          span: 12,
          group: "records",
          rowActions: ["mark_lead_contacted", "create_followup_task"],
          sortField: "score",
          search: true,
        }),
      ];
    case "deals":
      return [
        metric("focus-pipeline-value", "pipeline_value", "Pipeline value"),
        C({
          type: "table",
          id: "focus-deals-table",
          title: "Top opportunities",
          dataset: "deals",
          columns: ["name", "company", "stage", "amount", "probability", "owner"],
          limit: 10,
          span: 12,
          group: "pipeline",
          rowActions: ["advance_deal_stage"],
          sortField: "amount",
          sortDirection: "desc",
        }),
      ];
    case "activity":
      return [
        C({
          type: "activity-feed",
          id: "focus-activity",
          title: "Recent activity",
          limit: 10,
          span: 7,
          group: "activity",
        }),
        metric("focus-completed", "tasks_completed_week", "Done this week"),
      ];
    case "automation":
      return [
        C({
          type: "workflow-panel",
          id: "focus-workflows",
          title: "Automations",
          limit: 5,
          span: 6,
          group: "automation",
          showRuns: true,
        }),
        metric("focus-flagged", "flagged_leads", "Flagged leads"),
      ];
    default:
      return [];
  }
}

const GROUP_ORDER: ComponentGroup[] = ["overview", "pipeline", "work", "records", "automation", "activity"];

function dedupeComponents(components: MorphComponent[]): MorphComponent[] {
  const seen = new Set<string>();
  const byTypeAndDataset = new Set<string>();
  const result: MorphComponent[] = [];
  for (const component of components) {
    const signature = `${component.type}:${"dataset" in component ? component.dataset : ""}:${
      "metric" in component ? component.metric : ""
    }`;
    if (seen.has(component.id) || byTypeAndDataset.has(signature)) continue;
    seen.add(component.id);
    byTypeAndDataset.add(signature);
    result.push(component);
  }
  return result;
}

function navForFocuses(focuses: FocusKey[], simplified: boolean): NavigationItem[] {
  const items: NavigationItem[] = [
    { id: "nav-home", label: simplified ? "Focus" : "Command center", href: "/studio", icon: "layout-dashboard" },
  ];
  const has = (focus: FocusKey) => focuses.includes(focus);
  if (has("pipeline") || has("deals") || has("revenue")) {
    items.push({ id: "nav-pipeline", label: "Pipeline", href: "/studio/crm/deals", icon: "briefcase", badge: "task_due_today" });
  }
  if (has("followups") || has("leads") || has("conversion")) {
    items.push({ id: "nav-leads", label: "Leads", href: "/studio/crm/leads", icon: "users", badge: "overdue_followups" });
  }
  if (has("tasks") || has("workload")) {
    items.push({ id: "nav-tasks", label: "Tasks", href: "/studio/crm/tasks", icon: "check-square" });
  }
  if (has("automation")) {
    items.push({ id: "nav-workflows", label: "Workflows", href: "/studio/workflows", icon: "workflow" });
  }
  if (!simplified) {
    if (!items.some((item) => item.href === "/studio/crm/leads")) {
      items.push({ id: "nav-leads", label: "Leads", href: "/studio/crm/leads", icon: "users", badge: "overdue_followups" });
    }
    if (!items.some((item) => item.href === "/studio/crm/deals")) {
      items.push({ id: "nav-deals", label: "Deals", href: "/studio/crm/deals", icon: "briefcase" });
    }
    items.push({ id: "nav-compare", label: "Compare", href: "/studio/compare", icon: "git-compare" });
  }
  return items.slice(0, simplified ? 4 : 6);
}

const HEADLINES: Record<FocusKey, { title: string; subtitle: string }> = {
  revenue: { title: "Revenue focus", subtitle: "Won revenue, win rate and progress against target" },
  pipeline: { title: "Pipeline command center", subtitle: "Every stage, every stalled deal, one screen" },
  followups: { title: "Follow-up desk", subtitle: "Leads that slipped and the next touch that fixes it" },
  tasks: { title: "My day", subtitle: "Only the tasks that need you today" },
  workload: { title: "Operations control room", subtitle: "Team workload, stalled deals and bottlenecks" },
  conversion: { title: "Conversion lab", subtitle: "Where leads drop off and which sources actually close" },
  leads: { title: "Lead workspace", subtitle: "Scored, owned and ready for the next touch" },
  deals: { title: "Opportunity board", subtitle: "The largest open deals and where they stand" },
  activity: { title: "Activity stream", subtitle: "Everything that moved recently" },
  automation: { title: "Automation desk", subtitle: "Rules that keep the workspace clean" },
};

/* -------------------------------------------------------------------------- */
/* Workflow planning                                                          */
/* -------------------------------------------------------------------------- */

function planWorkflow(prompt: string, role: JobRole): MorphResult | null {
  const text = prompt.toLowerCase();
  const isWorkflowish =
    WORKFLOW_PATTERN.test(text) ||
    /\b(flag|notify|create a task|follow.?up task)\b/.test(text) ||
    /\bwhen\b.*\b(then|flag|notify|create)\b/.test(text);
  if (!isWorkflowish) return null;

  const days = parseNumber(text.match(/\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen|twenty|thirty)[ -]?days?\b/)?.[0] ?? "") ?? 7;

  // A) stale leads / no contact
  if (/(contact|touch|reach(ed)? out|quiet|stale|respond)/.test(text) && /(lead|prospect|record)/.test(text)) {
    const statusMatch = text.match(/\b(new|contacted|qualified)\b/);
    const definition = workflowDefinitionSchema.safeParse({
      schemaVersion: 1,
      name: "Stale lead follow-up",
      description: `Flag leads with no contact in ${days}+ days and create a follow-up task for the owner.`,
      trigger: { type: "daily_check", entity: "lead" },
      conditions: [
        { type: "days_since_contact_gte", value: days },
        ...(statusMatch ? [{ type: "field_equals", field: "status", value: statusMatch[1] }] : []),
      ],
      actions: [
        { type: "flag_record", reason: `No contact in ${days}+ days` },
        {
          type: "create_task",
          title: "Follow up with {{name}} ({{company}})",
          priority: "high",
          dueInDays: 1,
          assignTo: "record_owner",
        },
      ],
    });
    if (!definition.success) {
      return {
        kind: "refusal",
        intent: "Create a follow-up workflow",
        summary: "I could not translate that into a supported workflow definition.",
        operations: [],
        requiredDataSources: ["leads"],
        requiredActions: [],
        assumptions: [],
        unresolved: definition.error.issues.map((issue) => issue.message),
        restorePrevious: false,
        refusal: definition.error.issues.map((issue) => issue.message).join("; "),
      };
    }
    return morphResultSchema.parse({
      kind: "workflow",
      intent: `Create a workflow that flags leads with no contact for ${days}+ days`,
      summary: `A daily check flags ${role === "ops_manager" ? "stale leads" : "your stale leads"} and creates a follow-up task for the record owner. You review and activate it — nothing runs until you do.`,
      operations: [],
      requiredDataSources: ["leads", "tasks"],
      requiredActions: [],
      assumptions: [
        `Contact recency is measured from the lead's last logged activity timestamp.`,
        `Only leads with a status you chose are matched; adjust conditions before activating.`,
      ],
      unresolved: [],
      restorePrevious: false,
      workflowDraft: definition.data,
    });
  }

  // B) deal stage change
  const stageMatch = text.match(/\b(prospecting|qualification|proposal|negotiation|won|lost)\b/);
  if (stageMatch && /(deal|opportunit|stage|move|reach|enter)/.test(text)) {
    const stage = stageMatch[1]!;
    const definition = workflowDefinitionSchema.safeParse({
      schemaVersion: 1,
      name: `Deal entered ${stage}`,
      description: `Notify the owner when a deal moves into ${stage}.`,
      trigger: { type: "deal_stage_changed", entity: "deal" },
      conditions: [{ type: "field_equals", field: "stage", value: stage }],
      actions: [
        {
          type: "notify",
          title: `Deal reached ${stage}`,
          body: "{{name}} just moved into " + stage + ".",
        },
      ],
    });
    if (definition.success) {
      return morphResultSchema.parse({
        kind: "workflow",
        intent: `Notify the deal owner when a deal reaches ${stage}`,
        summary: `A stage-change trigger watches deals and sends an in-app notification when they enter ${stage}. You can test it before activating.`,
        operations: [],
        requiredDataSources: ["deals"],
        requiredActions: [],
        assumptions: ["Notifications go to the deal owner; the workflow creator gets a copy."],
        unresolved: [],
        restorePrevious: false,
        workflowDraft: definition.data,
      });
    }
  }

  // C) high-value deals
  const amountMatch = text.match(/\$?([\d,]{4,})/);
  if (amountMatch && /(deal|opportunit|amount|value|above|over|more than)/.test(text)) {
    const amount = Number(amountMatch[1]!.replace(/,/g, ""));
    const definition = workflowDefinitionSchema.safeParse({
      schemaVersion: 1,
      name: "High-value deal alert",
      description: `Notify the owner when a deal above $${amount.toLocaleString()} is updated.`,
      trigger: { type: "record_updated", entity: "deal" },
      conditions: [{ type: "field_gte", field: "amount", value: amount }],
      actions: [
        {
          type: "notify",
          title: "High-value deal updated",
          body: "{{name}} is worth more than your threshold.",
        },
      ],
    });
    if (definition.success) {
      return morphResultSchema.parse({
        kind: "workflow",
        intent: `Alert on deals over $${amount.toLocaleString()}`,
        summary: "A record-update trigger raises an in-app notification for high-value deals.",
        operations: [],
        requiredDataSources: ["deals"],
        requiredActions: [],
        assumptions: [],
        unresolved: [],
        restorePrevious: false,
        workflowDraft: definition.data,
      });
    }
  }

  // D) overdue tasks
  if (/(overdue|past due|late)/.test(text) && /(task|work)/.test(text)) {
    const definition = workflowDefinitionSchema.safeParse({
      schemaVersion: 1,
      name: "Overdue task escalation",
      description: "Raise priority on tasks that are past due.",
      trigger: { type: "daily_check", entity: "task" },
      conditions: [{ type: "overdue_task" }],
      actions: [
        { type: "update_field", field: "priority", value: "high" },
        { type: "notify", title: "Task is overdue", body: "{{title}} is past its due date." },
      ],
    });
    if (definition.success) {
      return morphResultSchema.parse({
        kind: "workflow",
        intent: "Escalate overdue tasks",
        summary: "A daily check raises priority on overdue tasks and notifies the assignee.",
        operations: [],
        requiredDataSources: ["tasks"],
        requiredActions: [],
        assumptions: [],
        unresolved: [],
        restorePrevious: false,
        workflowDraft: definition.data,
      });
    }
  }

  return {
    kind: "refusal",
    intent: "Automation request",
    summary:
      "I can build three kinds of automation today: stale-lead follow-ups, deal-stage alerts, and overdue-task escalation. Rephrase with one of those (for example “when a deal reaches negotiation, notify the owner”) and I'll draft it for you to review.",
    operations: [],
    requiredDataSources: [],
    requiredActions: [],
    assumptions: [],
    unresolved: ["That automation pattern is not supported yet."],
    restorePrevious: false,
    refusal:
      "Supported automations: stale-lead follow-up, deal-stage alerts, high-value deal alerts, overdue-task escalation.",
  };
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

export function planTransformation(input: PlannerInput): MorphResult {
  const prompt = input.prompt.trim();
  const text = prompt.toLowerCase();
  const assumptions: string[] = [];
  const unresolved: string[] = [];

  if (prompt.length < 3) {
    return {
      kind: "refusal",
      intent: "Empty request",
      summary: "Tell Morph what you want to see or change — for example “show my pipeline and overdue follow-ups”.",
      operations: [],
      requiredDataSources: [],
      requiredActions: [],
      assumptions: [],
      unresolved: [],
      restorePrevious: false,
      refusal: "No instruction was provided.",
    };
  }

  if (UNSAFE_PATTERN.test(text)) {
    return {
      kind: "refusal",
      intent: "Request outside Morph's safety boundary",
      summary:
        "Morph changes how the workspace is presented and how work is automated — it never deletes records, sends email, or changes permissions. Rephrase as a layout or automation request and I'll build that instead.",
      operations: [],
      requiredDataSources: [],
      requiredActions: [],
      assumptions: [],
      unresolved: ["Data deletion, outbound email and permission changes are not supported."],
      restorePrevious: false,
      refusal:
        "Blocked: Morph has no capability to delete data, send email externally, or change workspace permissions.",
    };
  }

  if (REVERT_PATTERN.test(text) && !/workflow/.test(text)) {
    return morphResultSchema.parse({
      kind: "restore",
      intent: "Restore the previous interface version",
      summary: "Rolling the workspace back to the version that was active before the last change.",
      operations: [],
      requiredDataSources: [],
      requiredActions: [],
      assumptions: [],
      unresolved: [],
      restorePrevious: true,
    });
  }

  const workflow = planWorkflow(prompt, input.jobRole);
  if (workflow) return workflow;

  // --- intent detection ---------------------------------------------------
  const detectedRole = ROLE_PATTERNS.find((entry) => entry.pattern.test(text))?.role;
  const focuses = FOCUS_PRIORITY.filter((focus) => FOCUS_PATTERNS[focus].test(text));
  const simplified = SIMPLIFY_PATTERN.test(text);
  const additive = ADDITIVE_PATTERN.test(text) && !simplified;
  const accessible = ACCESSIBILITY_PATTERN.test(text);
  const role = detectedRole ?? input.jobRole;

  const wantsQuickAction = /\b(quick action|quick-actions?|button|shortcut|one[- ]click|action)\b/.test(text);
  const wantsContactAction =
    wantsQuickAction && /(contact|reach out|touch|follow.?up)/.test(text);
  const wantsStageAction = wantsQuickAction && /(stage|advance|move)/.test(text);

  if (focuses.length === 0 && !simplified && !accessible && !wantsQuickAction) {
    return {
      kind: "refusal",
      intent: "Unrecognised request",
      summary:
        "I could not map that to something I can safely build. Try describing the information you need (pipeline, revenue, follow-ups, tasks, workload, conversion, activity) or ask for an automation.",
      operations: [],
      requiredDataSources: [],
      requiredActions: [],
      assumptions: [],
      unresolved: ["No supported intent was detected."],
      restorePrevious: false,
      refusal:
        "Unsupported instruction. Morph only builds from its component registry: metrics, charts, tables, lists, boards, task lists, activity feeds, forms and automations.",
    };
  }

  // --- compose the new primary surface ------------------------------------
  const desired: MorphComponent[] = [];
  for (const focus of focuses) desired.push(...componentsForFocus(focus, role));

  const operations: MorphResult["operations"] = [];
  const requiredDataSources = new Set<DatasetKey>();
  const requiredActions = new Set<ActionId>();

  for (const component of desired) {
    if ("dataset" in component && component.dataset) requiredDataSources.add(component.dataset as DatasetKey);
    if (component.type === "pipeline-board") requiredDataSources.add("deals");
    if (component.type === "task-list") requiredDataSources.add("tasks");
    if (component.type === "activity-feed") requiredDataSources.add("activities");
    if (component.type === "workflow-panel") requiredDataSources.add("workflows");
    if ("rowActions" in component) component.rowActions.forEach((action) => requiredActions.add(action));
    if ("action" in component && component.action) requiredActions.add(component.action);
  }

  let composed = dedupeComponents(desired);
  if (simplified) composed = composed.slice(0, 6);

  if (wantsQuickAction) {
    const actions: ActionId[] = wantsContactAction
      ? ["mark_lead_contacted", "create_followup_task", "new_task"]
      : wantsStageAction
        ? ["advance_deal_stage", "new_task"]
        : ["new_lead", "new_task"];
    const existing = input.config.components.find((component) => component.type === "quick-actions");
    if (existing) {
      operations.push({
        op: "update_component",
        id: existing.id,
        changes: { actions },
      });
    } else {
      operations.push({
        op: "add_component",
        component: C({
          type: "quick-actions",
          id: "focus-quick-actions",
          title: "Quick actions",
          actions,
          span: 4,
          group: "work",
          variant: "buttons",
        }),
      });
    }
    actions.forEach((action) => requiredActions.add(action));
  }

  // Groups that this instruction rebuilds.
  const targetGroups = new Set<ComponentGroup>(composed.map((component) => component.group));
  if (simplified) {
    if (!focuses.includes("activity") && !focuses.includes("automation")) targetGroups.add("activity");
    targetGroups.add("records");
  }
  const preserveActivity = targetGroups.has("activity") && !simplified;

  // Preserve auxiliary panels that were not asked about.
  const preserved = additive
    ? []
    : input.config.components.filter((component) => {
        const inTarget = targetGroups.has(component.group);
        if (!inTarget) return true;
        if (component.group === "activity" && preserveActivity && !focuses.includes("activity")) return true;
        return false;
      });

  if (additive) {
    for (const component of composed) {
      if (!input.config.components.some((existing) => existing.id === component.id)) {
        operations.push({ op: "add_component", component });
      }
    }
    if (operations.length === 0) {
      return {
        kind: "refusal",
        intent: "Additive change",
        summary: "That content is already on your canvas, so there is nothing to add.",
        operations: [],
        requiredDataSources: [...requiredDataSources],
        requiredActions: [...requiredActions],
        assumptions: [],
        unresolved: [],
        restorePrevious: false,
        refusal: "No new components were required.",
      };
    }
  } else {
    const groupsToReplace = new Set<ComponentGroup>([...targetGroups]);
    for (const group of GROUP_ORDER) {
      if (!groupsToReplace.has(group)) continue;
      const groupComponents = composed.filter((component) => component.group === group);
      const currentlyHas = input.config.components.some((component) => component.group === group);
      if (groupComponents.length === 0 && !currentlyHas) continue;
      operations.push({ op: "replace_group", group, components: groupComponents });
    }
    if (preserved.length === 0 && composed.length === 0) {
      return {
        kind: "refusal",
        intent: "Empty interface",
        summary: "That request would leave the workspace with nothing on it, which is not allowed.",
        operations: [],
        requiredDataSources: [],
        requiredActions: [],
        assumptions: [],
        unresolved: [],
        restorePrevious: false,
        refusal: "An interface must keep at least one component.",
      };
    }
  }

  // --- layout, accessibility, navigation, header ---------------------------
  if (simplified) {
    operations.push({
      op: "set_layout",
      layout: { density: "compact", gap: "md", showGroupHeadings: true },
    });
    operations.push({ op: "set_accessibility", accessibility: { reduceClutter: true } });
    assumptions.push("“Simplify” removes secondary panels and switches to compact density. Saved data is untouched.");
  }
  if (accessible) {
    operations.push({
      op: "set_accessibility",
      accessibility: {
        fontSize: "lg",
        highContrast: true,
        reduceMotion: true,
        reduceClutter: simplified,
      },
    });
    assumptions.push("Accessibility changes are interface preferences — CRM records and permissions are unaffected.");
  }
  if (role !== input.jobRole) {
    assumptions.push(`Detected role “${role.replace("_", " ")}” from your instruction; the layout was built for it.`);
  }

  operations.push({ op: "set_navigation", items: navForFocuses(focuses, simplified) });

  const primaryFocus = focuses.find((focus) => HEADLINES[focus]) ?? null;
  if (primaryFocus) {
    const headline = HEADLINES[primaryFocus];
    operations.push({
      op: "set_header",
      header: {
        // Keep the intent-specific headline even when simplifying; "Focus" is
        // only a fallback for requests with no named focus area.
        title: headline.title,
        subtitle: headline.subtitle,
        badge: role.replace("_", " "),
      },
    });
  }
  operations.push({
    op: "set_meta",
    name: primaryFocus ? HEADLINES[primaryFocus].title : simplified ? "Focus view" : "Custom workspace",
  });

  if (composed.length > 0 && !additive) {
    assumptions.push(
      `Rebuilt ${[...targetGroups].length} section(s); panels outside the request were preserved.`,
    );
    if (input.config.components.some((component) => component.group === "automation") && !focuses.includes("automation")) {
      assumptions.push("Your existing automation panel was kept in place.");
    }
  }
  if (focuses.length === 0 && accessible) {
    assumptions.push("Only accessibility and clutter settings changed.");
  }

  const intentParts = focuses.map((focus) => focus.replace("_", " "));
  const summary = additive
    ? `Added ${composed.length} new component(s) to the existing canvas${focuses.length ? ` focused on ${intentParts.join(", ")}` : ""}.`
    : `Reshaped the workspace around ${intentParts.length ? intentParts.join(", ") : "accessibility"}${simplified ? ", with a simplified single-focus layout" : ""}. ${composed.length} components across ${targetGroups.size} sections.`;

  return morphResultSchema.parse({
    kind: "config",
    intent: `Build a ${intentParts.join(" + ") || "simplified"} workspace`,
    summary,
    operations,
    requiredDataSources: [...requiredDataSources],
    requiredActions: [...requiredActions],
    assumptions: assumptions.slice(0, 5),
    unresolved: unresolved.slice(0, 5),
    restorePrevious: false,
  });
}

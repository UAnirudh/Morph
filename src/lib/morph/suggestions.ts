import type { JobRole, MetricKey } from "./config";

export interface PersonalizationSuggestion {
  id: string;
  title: string;
  why: string;
  prompt: string;
  metric: MetricKey;
  metricValue: number;
}

export interface SuggestionInput {
  role: JobRole;
  metrics: Partial<Record<MetricKey, number>>;
  dismissed: string[];
}

/**
 * Suggestions are derived from *live workspace data*, never from clicks.
 * Each one carries the observation that produced it so the user can judge it,
 * accept it (which still goes through preview + apply) or reject it for good.
 */
export function buildSuggestions(input: SuggestionInput): PersonalizationSuggestion[] {
  const { metrics } = input;
  const candidates: PersonalizationSuggestion[] = [];
  const value = (key: MetricKey) => metrics[key] ?? 0;

  if (value("overdue_followups") >= 3) {
    candidates.push({
      id: "overdue-queue",
      title: "Pull overdue follow-ups onto your canvas",
      why: `${value("overdue_followups")} leads have had no contact in 7+ days (live data, not a click pattern).`,
      prompt: "Add an overdue follow-up queue with a one-click 'mark contacted' action.",
      metric: "overdue_followups",
      metricValue: value("overdue_followups"),
    });
  }

  if (value("at_risk_deals") >= 2) {
    candidates.push({
      id: "stalled-deals",
      title: "Surface deals that stopped moving",
      why: `${value("at_risk_deals")} open deals have not changed stage in 21+ days.`,
      prompt: "Show me stalled deals and a bottleneck indicator.",
      metric: "at_risk_deals",
      metricValue: value("at_risk_deals"),
    });
  }

  if (value("task_due_today") >= 3) {
    candidates.push({
      id: "today-tasks",
      title: "Start the day with today's tasks",
      why: `${value("task_due_today")} tasks are due today and still open.`,
      prompt: "Simplify this interface. I only want my tasks and today's priorities.",
      metric: "task_due_today",
      metricValue: value("task_due_today"),
    });
  }

  if (value("flagged_leads") >= 2) {
    candidates.push({
      id: "automation-review",
      title: "Check what the automation flagged",
      why: `${value("flagged_leads")} leads are currently flagged by a workflow.`,
      prompt: "Show flagged leads and my automations so I can review them.",
      metric: "flagged_leads",
      metricValue: value("flagged_leads"),
    });
  }

  if (input.role === "sales_manager" && value("win_rate") > 0) {
    candidates.push({
      id: "revenue-focus",
      title: "Put revenue and win rate first",
      why: "You're set up as a sales manager, and win rate is computed from your closed deals.",
      prompt: "Prioritize revenue, pipeline health, and overdue follow-ups.",
      metric: "win_rate",
      metricValue: value("win_rate"),
    });
  }

  if (input.role === "ops_manager" && value("team_workload") >= 10) {
    candidates.push({
      id: "workload-balance",
      title: "Look at workload balance",
      why: `${value("team_workload")} tasks are open across the team right now.`,
      prompt: "Show team workload, unfinished tasks, and bottlenecks.",
      metric: "team_workload",
      metricValue: value("team_workload"),
    });
  }

  return candidates.filter((candidate) => !input.dismissed.includes(candidate.id)).slice(0, 3);
}

export const STARTER_PROMPTS: Record<JobRole, string[]> = {
  sales_manager: [
    "Prioritize revenue, pipeline health, and overdue follow-ups.",
    "Create a dashboard showing revenue by month, lead conversion, and deals by stage.",
    "Create a workflow that flags leads that haven't been contacted in seven days.",
  ],
  sales_rep: [
    "I want a simple workspace focused on my assigned leads and today's tasks.",
    "Add a quick action to mark leads as contacted.",
    "Show only my overdue tasks and my leads.",
  ],
  ops_manager: [
    "Show team workload, unfinished tasks, and bottlenecks.",
    "Create a workflow that flags leads that haven't been contacted in seven days.",
    "Make the interface more accessible with larger text and fewer distractions.",
  ],
  general: [
    "Create a dashboard showing revenue by month, lead conversion, and deals by stage.",
    "Simplify this interface. I only want my tasks and today's priorities.",
    "Make the interface more accessible with larger text and fewer distractions.",
  ],
};

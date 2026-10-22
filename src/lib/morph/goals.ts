import type { JobRole } from "./config";

export const GOALS_BY_ROLE: Record<JobRole, string[]> = {
  sales_manager: [
    "Grow pipeline coverage",
    "Protect the revenue forecast",
    "Coach follow-up discipline",
    "Spot at-risk deals early",
  ],
  sales_rep: [
    "Hit my monthly number",
    "Never miss a follow-up",
    "Keep my task list under control",
    "Spend less time in dashboards",
  ],
  ops_manager: [
    "Reduce bottlenecks",
    "Balance team workload",
    "Keep CRM hygiene clean",
    "Automate repetitive checks",
  ],
  general: [
    "See what matters first",
    "Reduce interface clutter",
    "Learn the product quickly",
    "Automate my routine",
  ],
};

export const ALL_GOALS = Array.from(new Set(Object.values(GOALS_BY_ROLE).flat()));

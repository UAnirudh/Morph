import type { JobRole } from "./morph/config";

export interface DemoScenario {
  id: "sales-manager" | "sales-rep" | "ops-manager";
  label: string;
  title: string;
  role: JobRole;
  persona: string;
  prompt: string;
  expected: string[];
  resetHint: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "sales-manager",
    label: "Demo A",
    title: "Sales manager",
    role: "sales_manager",
    persona: "Maya — runs a 4-person revenue team, owns the forecast",
    prompt: "Prioritize revenue, pipeline health, and overdue follow-ups.",
    expected: [
      "Revenue trend and win rate up front",
      "Pipeline board with every stage",
      "At-risk deals with one-click stage advance",
      "Overdue follow-up queue",
    ],
    resetHint: "Resets the demo interface back to the classic CRM every user starts with.",
  },
  {
    id: "sales-rep",
    label: "Demo B",
    title: "Sales representative",
    role: "sales_rep",
    persona: "Daniel — carries a personal quota, lives in his task list",
    prompt: "I want a simple workspace focused on my assigned leads and today's tasks.",
    expected: [
      "Only my leads and my tasks",
      "Today's priorities first",
      "Quick actions for logging a touch",
      "Far less dashboard clutter",
    ],
    resetHint: "Resets the demo interface back to the classic CRM.",
  },
  {
    id: "ops-manager",
    label: "Demo C",
    title: "Operations manager",
    role: "ops_manager",
    persona: "Alex — responsible for throughput and process hygiene",
    prompt: "Show team workload, unfinished tasks, and bottlenecks.",
    expected: [
      "Workload distribution across the team",
      "Task status breakdown",
      "Stalled deals and bottleneck watch",
      "Live automation controls",
    ],
    resetHint: "Resets the demo interface back to the classic CRM.",
  },
];

export function getScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id);
}

export function isScenarioId(id: string): id is DemoScenario["id"] {
  return DEMO_SCENARIOS.some((scenario) => scenario.id === id);
}

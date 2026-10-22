// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/misc";
import { ToastProvider } from "@/components/ui/toast";
import { MorphCanvas } from "@/components/studio/canvas";
import { morphConfigSchema, type MorphConfig } from "@/lib/morph/config";
import { resolveConfigData } from "@/lib/crm/data";
import { seededContext } from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/studio",
}));

beforeAll(() => {
  // Recharts measures its container; jsdom reports 0 unless we stub it.
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  global.ResizeObserver = window.ResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => cleanup());

const CONFIG_INPUT = {
  schemaVersion: 1,
  name: "Every component",
  layout: { columns: 12, gap: "md", density: "comfortable", showGroupHeadings: true },
  accessibility: { fontSize: "base", highContrast: false, reduceMotion: false, reduceClutter: false },
  navigation: { items: [{ id: "nav-home", label: "Home", href: "/studio", icon: "layout-dashboard" }] },
  header: { title: "All widgets" },
  components: [
    { type: "metric", id: "w-metric", title: "Pipeline metric", metric: "pipeline_value", span: 3 },
    { type: "chart", id: "w-chart", title: "Revenue chart", dataset: "revenue_by_month", chartType: "area", span: 6 },
    {
      type: "table",
      id: "w-table",
      title: "Lead table",
      dataset: "leads",
      columns: ["name", "company", "status", "owner"],
      limit: 5,
      span: 6,
      rowActions: ["mark_lead_contacted"],
      search: true,
    },
    {
      type: "list",
      id: "w-list",
      title: "Overdue list",
      dataset: "overdue_followups",
      fields: ["name", "company", "daysSinceContact"],
      limit: 4,
      span: 4,
      action: "mark_lead_contacted",
    },
    { type: "quick-actions", id: "w-actions", title: "Quick actions", actions: ["new_lead", "new_task"], span: 4 },
    { type: "filters", id: "w-filters", title: "Filters", dataset: "leads", fields: [{ field: "status", label: "Status" }], span: 4 },
    { type: "form", id: "w-form", title: "New lead form", entity: "lead", fields: ["name", "company"], submitLabel: "Create", span: 4 },
    { type: "insight", id: "w-insight", title: "Insight", body: "Two deals are stalled.", tone: "warning", span: 4 },
    { type: "progress", id: "w-progress", title: "Target", metric: "won_revenue", target: 500000, label: "Quarter", span: 4 },
    { type: "workflow-panel", id: "w-workflows", title: "Automations", limit: 3, span: 4 },
    { type: "activity-feed", id: "w-feed", title: "Activity feed", limit: 4, span: 4 },
    { type: "task-list", id: "w-tasks", title: "My tasks", scope: "mine", filter: "open", limit: 4, span: 4 },
    {
      type: "nav-shortcuts",
      id: "w-nav",
      title: "Shortcuts",
      items: [{ label: "Leads", href: "/studio/crm/leads", icon: "users" }],
      span: 3,
    },
    { type: "pipeline-board", id: "w-board", title: "Board", metric: "amount", limitPerStage: 2, span: 12 },
  ],
} as const;

function renderCanvas(overrides: { config?: MorphConfig; editable?: boolean } = {}) {
  const ctx = seededContext();
  const config = overrides.config ?? morphConfigSchema.parse(CONFIG_INPUT);
  const data = resolveConfigData(ctx.db, ctx.scope, config.components);
  const { container } = render(
    <ToastProvider>
      <TooltipProvider>
        <MorphCanvas
          config={config}
          data={data}
          options={{
            owners: [{ id: ctx.user.id, name: ctx.user.name }],
            leads: [{ id: "lead-1", name: "Lead One", company: "Northwind" }],
            deals: [],
            companies: [],
          }}
          role={ctx.role}
          currentUserName={ctx.user.name}
          editable={overrides.editable ?? true}
        />
      </TooltipProvider>
    </ToastProvider>,
  );
  return { container, ctx, config };
}

describe("schema-driven renderer", () => {
  it("renders every supported component type", () => {
    renderCanvas();
    for (const title of [
      "Pipeline metric",
      "Revenue chart",
      "Lead table",
      "Overdue list",
      "Quick actions",
      "Filters",
      "New lead form",
      "Insight",
      "Target",
      "Automations",
      "Activity feed",
      "My tasks",
      "Shortcuts",
      "Board",
    ]) {
      expect(screen.getAllByText(title).length, title).toBeGreaterThan(0);
    }
  });

  it("renders live workspace rows inside tables", () => {
    const { container, ctx } = renderCanvas();
    const firstLead = ctx.db
      .prepare("SELECT name FROM leads WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1")
      .get(ctx.workspace.id) as { name: string };
    const table = screen.getByText("Lead table").closest("article")!;
    expect(within(table).getByText(firstLead.name)).toBeTruthy();
    expect(container.querySelector("table")).toBeTruthy();
  });

  it("exposes row actions with accessible labels", () => {
    renderCanvas();
    const table = screen.getByText("Lead table").closest("article")!;
    expect(within(table).getAllByLabelText("Mark contacted").length).toBeGreaterThan(0);
  });

  it("hides drag affordances in read-only mode", () => {
    renderCanvas({ editable: false });
    expect(screen.queryAllByLabelText(/^Reorder /)).toHaveLength(0);
  });

  it("respects hidden and role visibility rules", () => {
    const config = morphConfigSchema.parse({
      ...CONFIG_INPUT,
      components: [
        { ...CONFIG_INPUT.components[0], hidden: true, title: "Hidden metric" },
        { ...CONFIG_INPUT.components[7], title: "Visible insight" },
        { ...CONFIG_INPUT.components[7], id: "w-insight-manager", title: "Manager only", visibleFor: ["sales_manager"] },
      ],
    });
    renderCanvas({ config });
    expect(screen.queryByText("Hidden metric")).toBeNull();
    expect(screen.getAllByText("Visible insight").length).toBeGreaterThan(0);
    // The seeded demo user is a sales manager, so the gated component renders.
    expect(screen.getAllByText("Manager only").length).toBeGreaterThan(0);
  });
});

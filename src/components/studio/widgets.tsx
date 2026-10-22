"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleDashed,
  Flag,
  Loader2,
  Play,
  Plus,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { DataTable } from "@/components/crm/data-table";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import {
  CreateLeadDialog,
  CreateTaskDialog,
  LogActivityDialog,
  RecordActions,
  RecordPickerDialog,
  useRecordMutations,
} from "@/components/crm/record-actions";
import { useToast } from "@/components/ui/toast";
import { MorphIcon } from "@/components/studio/icon";
import { formatFieldValue } from "@/components/studio/value";
import {
  ACTION_DEFS,
  METRICS,
  datasetFields,
  type JobRole,
  type MorphComponent,
} from "@/lib/morph/config";
import type { ConfigData, RecordRow } from "@/lib/crm/data";
import type { FormOptions } from "@/lib/crm/form-options";
import { createLeadAction, createTaskAction } from "@/lib/actions/crm";
import {
  runWorkflowNowAction,
  toggleWorkflowAction,
} from "@/lib/actions/studio";
import { cn, formatCurrency, formatNumber, formatRelative, titleCase } from "@/lib/utils";

const ChartWidget = dynamic(() => import("@/components/studio/widgets/chart-widget").then((m) => m.ChartWidget), {
  ssr: false,
  loading: () => <div className="skeleton h-[200px] w-full" />,
});

export interface FilterState {
  field: string;
  value: string;
}

export const CanvasFilterContext = React.createContext<{
  filters: Record<string, FilterState | undefined>;
  setFilter: (dataset: string, filter: FilterState | undefined) => void;
}>({ filters: {}, setFilter: () => undefined });

export interface WidgetContext {
  options: FormOptions;
  role: JobRole;
  currentUserName: string;
}

function MetricFormat({ value, format }: { value: number; format: string }) {
  if (format === "currency") return <>{formatCurrency(value, value >= 100_000)}</>;
  if (format === "percent") return <>{`${formatNumber(value)}%`}</>;
  return <>{formatNumber(value)}</>;
}

function widgetRows(data: ConfigData, dataset: string): RecordRow[] {
  return data.datasets[dataset as keyof typeof data.datasets]?.rows ?? [];
}

function fieldsFor(dataset: string) {
  return datasetFields(dataset as never);
}

/* -------------------------------------------------------------------------- */
/* Individual widgets                                                         */
/* -------------------------------------------------------------------------- */

function MetricWidget({ component, data }: { component: Extract<MorphComponent, { type: "metric" }>; data: ConfigData }) {
  const meta = METRICS[component.metric];
  const value = data.metrics[component.metric] ?? 0;
  const format = component.format === "auto" ? meta.format : component.format;
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {component.title ?? meta.label}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          <MetricFormat value={value} format={format} />
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground">{component.hint ?? meta.hint}</p>
    </div>
  );
}

function InsightWidget({ component, data }: { component: Extract<MorphComponent, { type: "insight" }>; data: ConfigData }) {
  const tones = {
    info: "border-sky-500/25 bg-sky-500/[0.07]",
    warning: "border-amber-500/25 bg-amber-500/[0.07]",
    success: "border-emerald-500/25 bg-emerald-500/[0.07]",
    danger: "border-rose-500/25 bg-rose-500/[0.07]",
    primary: "border-primary/25 bg-primary/[0.07]",
  } as const;
  const icons = {
    info: TrendingUp,
    warning: Flag,
    success: TrendingUp,
    danger: Flag,
    primary: Zap,
  } as const;
  const Icon = icons[component.tone];
  const metricValue =
    component.source === "computed" && component.metric ? data.metrics[component.metric] : undefined;
  return (
    <div className={cn("flex h-full gap-3 rounded-lg border p-3", tones[component.tone])}>
      <Icon className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden />
      <div>
        {component.title ? <p className="text-xs font-semibold text-foreground">{component.title}</p> : null}
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{component.body}</p>
        {metricValue !== undefined ? (
          <p className="mt-2 text-sm font-semibold tabular-nums text-foreground">
            {formatNumber(metricValue)} right now
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProgressWidget({ component, data }: { component: Extract<MorphComponent, { type: "progress" }>; data: ConfigData }) {
  const value = data.metrics[component.metric] ?? 0;
  const pct = Math.min(100, Math.round((value / component.target) * 100));
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {component.title ?? component.label}
        </p>
        <p className="text-sm font-semibold tabular-nums">{pct}%</p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={component.label}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatCurrency(value, true)} of {formatCurrency(component.target, true)} · {component.label}
      </p>
    </div>
  );
}

function FiltersWidget({ component, data }: { component: Extract<MorphComponent, { type: "filters" }>; data: ConfigData }) {
  const { filters, setFilter } = React.useContext(CanvasFilterContext);
  const rows = widgetRows(data, component.dataset);
  const active = filters[component.dataset];

  return (
    <div className="flex flex-wrap items-end gap-3">
      {component.fields.map((field) => {
        const options = Array.from(
          new Set(rows.map((row) => String(row[field.field] ?? "")).filter(Boolean)),
        ).slice(0, 12);
        return (
          <div key={field.field} className="min-w-[130px]">
            <Label htmlFor={`filter-${component.id}-${field.field}`}>{field.label}</Label>
            <Select
              value={active?.field === field.field ? active.value : "all"}
              onValueChange={(value) =>
                setFilter(component.dataset, value === "all" ? undefined : { field: field.field, value })
              }
            >
              <SelectTrigger id={`filter-${component.id}-${field.field}`} className="mt-1.5 h-8 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {titleCase(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      {active ? (
        <Button variant="ghost" size="xs" onClick={() => setFilter(component.dataset, undefined)}>
          Clear
        </Button>
      ) : (
        <p className="text-[11px] text-muted-foreground">Filters apply to every {titleCase(component.dataset.replace(/_/g, " "))} widget on this canvas.</p>
      )}
    </div>
  );
}

function QuickActionsWidget({ component, options }: { component: Extract<MorphComponent, { type: "quick-actions" }>; options: FormOptions }) {
  const router = useRouter();
  return (
    <div className={cn("flex flex-wrap gap-2", component.variant === "list" && "flex-col items-stretch")}>
      {component.actions.map((action) => {
        const def = ACTION_DEFS[action];
        if (action === "new_lead") {
          return (
            <CreateLeadDialog
              key={action}
              options={options}
              trigger={
                <Button size="sm" variant="secondary">
                  <Plus />
                  New lead
                </Button>
              }
            />
          );
        }
        if (action === "new_task") {
          return (
            <CreateTaskDialog
              key={action}
              options={options}
              trigger={
                <Button size="sm" variant="secondary">
                  <Plus />
                  New task
                </Button>
              }
            />
          );
        }
        if (action === "log_activity") {
          return (
            <LogActivityDialog
              key={action}
              options={options}
              trigger={
                <Button size="sm" variant="secondary">
                  <CalendarClock />
                  Log activity
                </Button>
              }
            />
          );
        }
        if (action === "advance_deal_stage" || action === "open_record") {
          return (
            <Button
              key={action}
              size="sm"
              variant="secondary"
              onClick={() => router.push("/studio/crm/deals")}
            >
              {def.label}
              <ArrowRight />
            </Button>
          );
        }
        if (def.entity === "lead" || def.entity === "deal") {
          return (
            <RecordPickerDialog
              key={action}
              action={action}
              options={options}
              trigger={
                <Button size="sm" variant="secondary">
                  <MorphIcon name={def.icon} />
                  {def.label}
                </Button>
              }
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function TaskListWidget({
  component,
  data,
  context,
}: {
  component: Extract<MorphComponent, { type: "task-list" }>;
  data: ConfigData;
  context: WidgetContext;
}) {
  const rows = widgetRows(data, "tasks");
  const { run, pending } = useRecordMutations();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const filtered = rows
    .filter((row) => {
      if (component.scope === "mine" && String(row.assignee) !== context.currentUserName) return false;
      if (component.filter === "today") {
        if (!row.dueDate) return false;
        const due = new Date(String(row.dueDate)).getTime();
        return due >= today.getTime() && due < tomorrow.getTime() && row.status !== "done";
      }
      if (component.filter === "overdue") {
        if (!row.dueDate) return false;
        return new Date(String(row.dueDate)).getTime() < today.getTime() && row.status !== "done";
      }
      if (component.filter === "open") return row.status !== "done";
      return true;
    })
    .slice(0, component.limit);

  if (filtered.length === 0) {
    return (
      <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center">
        <CircleDashed className="size-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {component.filter === "today" ? "Nothing due today — inbox zero." : "No tasks here right now."}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {filtered.map((task) => (
        <li
          key={task.id}
          className="group flex items-start gap-2.5 rounded-md border border-transparent px-1.5 py-1.5 transition-colors hover:border-border/60 hover:bg-secondary/40"
        >
          <button
            type="button"
            aria-label={`Complete ${task.title}`}
            disabled={pending !== null}
            onClick={() => void run("complete_task", task)}
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors",
              task.status === "done"
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                : "border-border hover:border-primary/60",
            )}
          >
            {pending === "complete_task" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : task.status === "done" ? (
              <span className="text-[9px]">✓</span>
            ) : null}
          </button>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-xs font-medium", task.status === "done" && "text-muted-foreground line-through")}>
              {task.title}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatFieldValue(task.dueDate, { type: "relative_date" })}</span>
              <span className="text-border">·</span>
              <span>{String(task.assignee)}</span>
              {task.priority === "high" ? <Badge tone="danger">High</Badge> : null}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function WorkflowPanelWidget({ component, data }: { component: Extract<MorphComponent, { type: "workflow-panel" }>; data: ConfigData }) {
  const rows = widgetRows(data, "workflows").slice(0, component.limit);
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <p className="text-xs text-muted-foreground">No automations yet.</p>
        <Link href="/studio/workflows" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Build one <ArrowRight className="size-3" />
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((workflow) => {
        const enabled = Boolean(workflow.enabled);
        return (
          <li key={workflow.id} className="rounded-lg border border-border/70 bg-surface-sunken/40 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{String(workflow.name)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {titleCase(String(workflow.triggerType).replace(/_/g, " "))} ·{" "}
                  {workflow.lastRunAt ? `ran ${formatRelative(String(workflow.lastRunAt))}` : "never run"}
                </p>
              </div>
              <Switch
                checked={enabled}
                aria-label={`Toggle ${String(workflow.name)}`}
                disabled={pending !== null}
                onCheckedChange={async (checked) => {
                  setPending(String(workflow.id));
                  const result = await toggleWorkflowAction(String(workflow.id), checked);
                  setPending(null);
                  if (result.ok) {
                    toast({ title: checked ? "Workflow enabled" : "Workflow paused", tone: "success" });
                    router.refresh();
                  } else {
                    toast({ title: "Could not update workflow", description: result.error, tone: "error" });
                  }
                }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1">
              <Button
                size="xs"
                variant="ghost"
                disabled={pending !== null}
                onClick={async () => {
                  setPending(String(workflow.id));
                  const result = await runWorkflowNowAction(String(workflow.id), true);
                  setPending(null);
                  toast({
                    title: result.ok ? "Test run complete" : "Test run failed",
                    description: result.error ?? result.summary,
                    tone: result.ok ? "success" : "error",
                  });
                  router.refresh();
                }}
              >
                {pending === String(workflow.id) ? <Loader2 className="animate-spin" /> : <Play />}
                Test
              </Button>
              <Link href="/studio/workflows" className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                Details <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PipelineBoardWidget({ component, data }: { component: Extract<MorphComponent, { type: "pipeline-board" }>; data: ConfigData }) {
  return (
    <PipelineBoard
      rows={widgetRows(data, "deals")}
      limitPerStage={component.limitPerStage}
      metric={component.metric}
    />
  );
}

function InlineFormWidget({ component, options }: { component: Extract<MorphComponent, { type: "form" }>; options: FormOptions }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        component.entity === "task"
          ? await createTaskAction({
              title: formData.get("title"),
              priority: formData.get("priority") ?? "medium",
              dueDate: formData.get("dueDate"),
              assigneeId: formData.get("assigneeId"),
              relatedType: "none",
            })
          : await createLeadAction({
              name: formData.get("name"),
              company: formData.get("company"),
              email: formData.get("email"),
              status: "new",
              score: formData.get("score") ?? 50,
              ownerId: formData.get("ownerId"),
              source: "inbound",
            });
      if (!result.ok) {
        setError(result.error ?? "Could not save.");
        return;
      }
      toast({ title: component.entity === "task" ? "Task created" : "Lead created", tone: "success" });
      (document.getElementById(`form-${component.id}`) as HTMLFormElement | null)?.reset();
      router.refresh();
    });
  }

  const show = (key: string) => component.fields.includes(key);

  return (
    <form id={`form-${component.id}`} action={submit} className="space-y-3">
      {component.entity === "task" ? (
        <>
          {show("title") ? (
            <div>
              <Label htmlFor={`${component.id}-title`}>Task</Label>
              <Input id={`${component.id}-title`} name="title" required className="mt-1.5" placeholder="Follow up on proposal" />
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {show("dueDate") ? (
              <div>
                <Label htmlFor={`${component.id}-due`}>Due</Label>
                <Input id={`${component.id}-due`} name="dueDate" type="date" className="mt-1.5" />
              </div>
            ) : null}
            {show("priority") ? (
              <div>
                <Label htmlFor={`${component.id}-priority`}>Priority</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger id={`${component.id}-priority`} className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["low", "medium", "high"].map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {titleCase(priority)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {show("name") ? (
              <div>
                <Label htmlFor={`${component.id}-name`}>Name</Label>
                <Input id={`${component.id}-name`} name="name" required className="mt-1.5" placeholder="Alex Morgan" />
              </div>
            ) : null}
            {show("company") ? (
              <div>
                <Label htmlFor={`${component.id}-company`}>Company</Label>
                <Input id={`${component.id}-company`} name="company" required className="mt-1.5" placeholder="Kestrel Systems" />
              </div>
            ) : null}
            {show("email") ? (
              <div>
                <Label htmlFor={`${component.id}-email`}>Email</Label>
                <Input id={`${component.id}-email`} name="email" type="email" className="mt-1.5" />
              </div>
            ) : null}
            {show("score") ? (
              <div>
                <Label htmlFor={`${component.id}-score`}>Score</Label>
                <Input id={`${component.id}-score`} name="score" type="number" min={0} max={100} defaultValue={55} className="mt-1.5" />
              </div>
            ) : null}
          </div>
          {show("owner") ? (
            <div>
              <Label htmlFor={`${component.id}-owner`}>Owner</Label>
              <Select name="ownerId" defaultValue={options.owners[0]?.id}>
                <SelectTrigger id={`${component.id}-owner`} className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        {component.submitLabel}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Main renderer                                                              */
/* -------------------------------------------------------------------------- */

export function MorphWidget({
  component,
  data,
  context,
}: {
  component: MorphComponent;
  data: ConfigData;
  context: WidgetContext;
}) {
  const { filters, setFilter } = React.useContext(CanvasFilterContext);
  const activeFilter = "dataset" in component ? filters[component.dataset] : undefined;

  switch (component.type) {
    case "metric":
      return <MetricWidget component={component} data={data} />;
    case "chart": {
      const rows = widgetRows(data, component.dataset);
      return <ChartWidget component={component} rows={rows} />;
    }
    case "table": {
      const rows = widgetRows(data, component.dataset);
      const fields = fieldsFor(component.dataset).filter((field) => component.columns.includes(field.key));
      const filteredRows = activeFilter
        ? rows.filter((row) => String(row[activeFilter.field] ?? "") === activeFilter.value)
        : rows;
      return (
        <div>
          {activeFilter ? (
            <div className="mb-2">
              <Badge tone="primary">
                {titleCase(activeFilter.field)}: {titleCase(activeFilter.value)}
              </Badge>
            </div>
          ) : null}
          <DataTable
            columns={fields}
            rows={filteredRows.slice(0, Math.max(component.limit, 10))}
            searchable={component.search}
            sortField={component.sortField}
            sortDirection={component.sortDirection}
            filterField={component.filterField}
            filterValues={component.filterValues}
            compact={component.compact}
            emptyHint={component.emptyHint}
            rowActions={(row) =>
              component.rowActions.length > 0 ? <RecordActions actions={component.rowActions} row={row} /> : null
            }
          />
        </div>
      );
    }
    case "list": {
      const rows = widgetRows(data, component.dataset).slice(0, component.limit);
      const fields = fieldsFor(component.dataset);
      if (rows.length === 0) {
        return (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {component.emptyHint ?? "Nothing needs your attention here."}
          </div>
        );
      }
      return (
        <ul className="divide-y divide-border/50">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{String(row[component.fields[0]!] ?? "")}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {component.fields.slice(1).map((fieldKey) => {
                    const field = fields.find((entry) => entry.key === fieldKey);
                    if (!field) return null;
                    return (
                      <span key={fieldKey} className="inline-flex items-center gap-1">
                        {formatFieldValue(row[fieldKey] ?? null, field)}
                      </span>
                    );
                  })}
                </p>
              </div>
              {component.action ? <RecordActions actions={[component.action]} row={row} max={1} /> : null}
            </li>
          ))}
        </ul>
      );
    }
    case "quick-actions":
      return <QuickActionsWidget component={component} options={context.options} />;
    case "filters":
      return <FiltersWidget component={component} data={data} />;
    case "form":
      return <InlineFormWidget component={component} options={context.options} />;
    case "insight":
      return <InsightWidget component={component} data={data} />;
    case "progress":
      return <ProgressWidget component={component} data={data} />;
    case "workflow-panel":
      return <WorkflowPanelWidget component={component} data={data} />;
    case "activity-feed": {
      const rows = widgetRows(data, "activities").slice(0, component.limit);
      if (rows.length === 0) {
        return <p className="py-4 text-center text-xs text-muted-foreground">No activity recorded yet.</p>;
      }
      return (
        <ol className="relative space-y-3 border-l border-border/60 pl-4">
          {rows.map((row) => (
            <li key={row.id} className="relative">
              <span className="absolute -left-[21px] top-1 size-2 rounded-full border border-border bg-surface" />
              <p className="text-xs text-foreground">{String(row.subject)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {titleCase(String(row.kind))} · {String(row.actor)} · {formatRelative(String(row.createdAt))}
              </p>
            </li>
          ))}
        </ol>
      );
    }
    case "task-list":
      return <TaskListWidget component={component} data={data} context={context} />;
    case "nav-shortcuts":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {component.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-sunken/40 px-3 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="inline-flex items-center gap-2">
                <MorphIcon name={item.icon} className="size-3.5 text-primary" />
                {item.label}
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      );
    case "pipeline-board":
      return <PipelineBoardWidget component={component} data={data} />;
    default:
      return null;
  }
}


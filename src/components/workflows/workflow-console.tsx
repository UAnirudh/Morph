"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative, titleCase } from "@/lib/utils";
import {
  CONDITION_FIELDS,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  WRITABLE_FIELDS,
  describeAction,
  describeCondition,
  type WorkflowDefinition,
} from "@/lib/workflows/schema";
import {
  createWorkflowAction,
  proposeAction,
  applyProposalAction,
  runDailyChecksAction,
  runWorkflowNowAction,
  toggleWorkflowAction,
} from "@/lib/actions/studio";

export interface WorkflowConsoleItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  definition: WorkflowDefinition;
  lastRunAt: string | null;
  updatedAt: string;
  runCount: number;
  lastRunStatus: string | null;
}

export interface WorkflowRunItem {
  id: string;
  workflowName: string;
  triggerType: string;
  status: string;
  matched: number;
  counts: Record<string, number>;
  createdAt: string;
  durationMs: number;
  note: string | null;
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  success: "success",
  partial: "warning",
  failed: "danger",
  skipped: "neutral",
};

const DEFAULT_CONDITION_TYPES = [
  "days_since_contact_gte",
  "days_since_update_gte",
  "field_equals",
  "field_gte",
  "assigned_to_owner",
  "overdue_task",
  "flagged",
];

interface ConditionDraft {
  key: number;
  type: string;
  field: string;
  value: string;
}

interface ActionDraft {
  key: number;
  type: "create_task" | "flag_record" | "notify" | "update_field";
  title: string;
  priority: "low" | "medium" | "high";
  dueInDays: string;
  reason: string;
  body: string;
  field: string;
  value: string;
}

let counter = 0;
const nextKey = () => {
  counter += 1;
  return counter;
};

function conditionToDraft(condition: WorkflowDefinition["conditions"][number]): ConditionDraft {
  return {
    key: nextKey(),
    type: condition.type,
    field: "field" in condition ? String(condition.field) : "",
    value: "value" in condition ? String(condition.value) : "",
  };
}

function actionToDraft(action: WorkflowDefinition["actions"][number]): ActionDraft {
  return {
    key: nextKey(),
    type: action.type,
    title: "title" in action ? action.title : "",
    priority: "priority" in action ? action.priority : "high",
    dueInDays: "dueInDays" in action ? String(action.dueInDays) : "1",
    reason: "reason" in action ? action.reason : "",
    body: "body" in action ? action.body : "",
    field: "field" in action ? action.field : "",
    value: "value" in action ? String(action.value) : "",
  };
}

function draftsToDefinition(params: {
  name: string;
  description: string;
  triggerType: string;
  entity: "lead" | "deal" | "task";
  conditions: ConditionDraft[];
  actions: ActionDraft[];
}): WorkflowDefinition {
  const conditions = params.conditions.map((condition) => {
    switch (condition.type) {
      case "field_equals":
        return { type: "field_equals" as const, field: condition.field, value: condition.value };
      case "field_gte":
        return { type: "field_gte" as const, field: condition.field, value: Number(condition.value || 0) };
      case "days_since_contact_gte":
        return { type: "days_since_contact_gte" as const, value: Number(condition.value || 7) };
      case "days_since_update_gte":
        return { type: "days_since_update_gte" as const, value: Number(condition.value || 21) };
      case "assigned_to_owner":
        return { type: "assigned_to_owner" as const };
      case "overdue_task":
        return { type: "overdue_task" as const };
      case "flagged":
        return { type: "flagged" as const, value: false };
      default:
        return { type: "flagged" as const, value: false };
    }
  });

  const actions = params.actions.map((action) => {
    switch (action.type) {
      case "create_task":
        return {
          type: "create_task" as const,
          title: action.title || "Follow up on {{name}}",
          priority: action.priority,
          dueInDays: Number(action.dueInDays || 1),
          assignTo: "record_owner" as const,
        };
      case "flag_record":
        return { type: "flag_record" as const, reason: action.reason || "Needs attention" };
      case "notify":
        return { type: "notify" as const, title: action.title || "Workflow alert", body: action.body };
      case "update_field":
        return { type: "update_field" as const, field: action.field, value: action.value };
      default:
        return { type: "flag_record" as const, reason: "Needs attention" };
    }
  });

  return {
    schemaVersion: 1,
    name: params.name,
    description: params.description,
    trigger: { type: params.triggerType as WorkflowDefinition["trigger"]["type"], entity: params.entity },
    conditions,
    actions,
  } as WorkflowDefinition;
}

export function WorkflowConsole({
  workflows,
  runs,
  engineLabel,
}: {
  workflows: WorkflowConsoleItem[];
  runs: WorkflowRunItem[];
  engineLabel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = React.useState<string | null>(workflows[0]?.id ?? null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [triggerType, setTriggerType] = React.useState<string>("daily_check");
  const [entity, setEntity] = React.useState<"lead" | "deal" | "task">("lead");
  const [conditions, setConditions] = React.useState<ConditionDraft[]>([
    { key: nextKey(), type: "days_since_contact_gte", field: "", value: "7" },
  ]);
  const [actions, setActions] = React.useState<ActionDraft[]>([
    { key: nextKey(), type: "flag_record", title: "", priority: "high", dueInDays: "1", reason: "No contact in 7+ days", body: "", field: "", value: "" },
    { key: nextKey(), type: "create_task", title: "Follow up with {{name}}", priority: "high", dueInDays: "1", reason: "", body: "", field: "", value: "" },
  ]);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [nlPrompt, setNlPrompt] = React.useState("");
  const [nlPending, setNlPending] = React.useState(false);
  const [draft, setDraft] = React.useState<WorkflowDefinition | null>(null);
  const [draftProposalId, setDraftProposalId] = React.useState<string | null>(null);

  const entityFields = CONDITION_FIELDS[entity] as Record<string, readonly string[] | "number">;
  const writableFields = WRITABLE_FIELDS[entity] as readonly string[];

  async function save() {
    setIssues([]);
    const definition = draftsToDefinition({ name, description, triggerType, entity, conditions, actions });
    const result = await createWorkflowAction(definition);
    if (!result.ok) {
      setIssues(result.issues ?? [result.error ?? "Invalid workflow"]);
      toast({ title: "Workflow not saved", description: result.error, tone: "error" });
      return;
    }
    toast({ title: "Workflow saved", description: "It is disabled until you enable it.", tone: "success" });
    setBuilderOpen(false);
    setName("");
    setDescription("");
    router.refresh();
  }

  async function saveFromNaturalLanguage() {
    if (!nlPrompt.trim()) return;
    setNlPending(true);
    try {
      const result = await proposeAction(`Create a workflow: ${nlPrompt}`);
      if (!result.ok || !result.proposal) {
        toast({ title: "Could not draft that workflow", description: result.error, tone: "error" });
        return;
      }
      if (result.proposal.kind !== "workflow" || !result.proposal.workflowDraft) {
        toast({
          title: "No workflow draft produced",
          description: result.proposal.refusal ?? result.proposal.summary,
          tone: "error",
        });
        return;
      }
      setDraft(result.proposal.workflowDraft);
      setDraftProposalId(result.proposal.id);
    } finally {
      setNlPending(false);
    }
  }

  async function saveDraft() {
    if (!draftProposalId) return;
    const result = await applyProposalAction(draftProposalId);
    if (!result.ok) {
      toast({ title: "Could not save the draft", description: result.error, tone: "error" });
      return;
    }
    toast({ title: "Workflow draft saved", description: "Review and enable it below.", tone: "success" });
    setDraft(null);
    setDraftProposalId(null);
    setNlPrompt("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" />
              Describe an automation
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Morph translates the instruction into a validated trigger-condition-action definition.
              It is saved disabled, so nothing runs until you review and enable it. Engine: {engineLabel}.
            </p>
          </div>
          <Badge tone="outline">no code execution</Badge>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={nlPrompt}
            onChange={(event) => setNlPrompt(event.target.value)}
            rows={2}
            placeholder="When a lead hasn't been contacted for seven days, flag it and create a follow-up task."
            className="min-h-[54px] flex-1 text-xs"
            aria-label="Describe an automation"
          />
          <Button onClick={saveFromNaturalLanguage} disabled={nlPending || nlPrompt.trim().length < 8} className="sm:self-end">
            {nlPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            Draft workflow
          </Button>
        </div>
        {draft ? (
          <div className="mt-3 rounded-lg border border-border/70 bg-surface-sunken/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{draft.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{draft.description}</p>
              </div>
              <Badge tone="warning">draft</Badge>
            </div>
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
              <li>Trigger: {TRIGGER_LABELS[draft.trigger.type]} on {draft.trigger.entity}s</li>
              {draft.conditions.map((condition, index) => (
                <li key={index}>If {describeCondition(condition)}</li>
              ))}
              {draft.actions.map((action, index) => (
                <li key={index}>Then {describeAction(action)}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1.5">
              <Button size="xs" onClick={saveDraft}>
                Save as disabled workflow
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Workflows ({workflows.length})
          </h2>
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              disabled={pending !== null}
              onClick={async () => {
                setPending("daily");
                const result = await runDailyChecksAction();
                setPending(null);
                const summary = result.results.length
                  ? result.results.map((item) => `${item.name}: ${item.matched} matched (${item.status})`).join(" · ")
                  : "No enabled daily workflows.";
                toast({ title: "Daily checks ran", description: summary, tone: "success" });
                router.refresh();
              }}
            >
              {pending === "daily" ? <Loader2 className="animate-spin" /> : <Zap />}
              Run daily checks
            </Button>
            <Button size="xs" onClick={() => setBuilderOpen((current) => !current)}>
              <Plus />
              New workflow
            </Button>
          </div>
        </div>

        {workflows.map((workflow) => {
          const open = expanded === workflow.id;
          return (
            <article key={workflow.id} className="rounded-xl border border-border/70 bg-card/60">
              <div className="flex flex-wrap items-start gap-3 p-3">
                <span className="mt-0.5 grid size-8 place-items-center rounded-lg border border-border/70 bg-surface-sunken/60 text-primary">
                  <WorkflowIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{workflow.name}</p>
                    <Badge tone={workflow.enabled ? "success" : "neutral"}>
                      {workflow.enabled ? "Active" : "Paused"}
                    </Badge>
                    {workflow.lastRunStatus ? (
                      <Badge tone={STATUS_TONE[workflow.lastRunStatus] ?? "neutral"}>
                        last run {workflow.lastRunStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{workflow.description}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/80">
                    {TRIGGER_LABELS[workflow.definition.trigger.type]} · {workflow.runCount} run(s) ·{" "}
                    {workflow.lastRunAt ? `last ${formatRelative(workflow.lastRunAt)}` : "never run"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={workflow.enabled}
                    aria-label={`Enable ${workflow.name}`}
                    disabled={pending !== null}
                    onCheckedChange={async (checked) => {
                      setPending(workflow.id);
                      const result = await toggleWorkflowAction(workflow.id, checked);
                      setPending(null);
                      if (result.ok) {
                        toast({ title: checked ? "Workflow enabled" : "Workflow paused", tone: "success" });
                        router.refresh();
                      } else {
                        toast({ title: "Update failed", description: result.error, tone: "error" });
                      }
                    }}
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending !== null}
                    onClick={async () => {
                      setPending(workflow.id);
                      const result = await runWorkflowNowAction(workflow.id, true);
                      setPending(null);
                      toast({
                        title: result.ok ? "Test run complete" : "Test run failed",
                        description: result.error ?? result.summary,
                        tone: result.ok ? "success" : "error",
                      });
                      router.refresh();
                    }}
                  >
                    {pending === workflow.id ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                    Test
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={pending !== null || !workflow.enabled}
                    onClick={async () => {
                      setPending(workflow.id);
                      const result = await runWorkflowNowAction(workflow.id, false);
                      setPending(null);
                      toast({
                        title: result.ok ? "Workflow executed" : "Execution failed",
                        description: result.error ?? result.summary,
                        tone: result.ok ? "success" : "error",
                      });
                      router.refresh();
                    }}
                  >
                    {pending === workflow.id ? <Loader2 className="animate-spin" /> : <Play />}
                    Run now
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={open ? "Collapse workflow" : "Expand workflow"}
                    onClick={() => setExpanded(open ? null : workflow.id)}
                  >
                    {open ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                </div>
              </div>

              {open ? (
                <div className="grid gap-3 border-t border-border/60 p-3 md:grid-cols-2">
                  <div>
                    <p className="label-caps">Conditions (all must match)</p>
                    <ul className="mt-1.5 space-y-1">
                      {workflow.definition.conditions.map((condition, index) => (
                        <li key={index} className="rounded-md border border-border/60 bg-surface-sunken/40 px-2 py-1 text-[11px] text-muted-foreground">
                          {describeCondition(condition)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="label-caps">Actions</p>
                    <ul className="mt-1.5 space-y-1">
                      {workflow.definition.actions.map((action, index) => (
                        <li key={index} className="rounded-md border border-border/60 bg-surface-sunken/40 px-2 py-1 text-[11px] text-muted-foreground">
                          {describeAction(action)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-[10px] text-muted-foreground md:col-span-2">
                    Every action runs through the same workspace authorization and idempotency checks as a
                    manual change: no duplicate follow-up tasks, one notification per record per day.
                  </p>
                </div>
              ) : null}
            </article>
          );
        })}

        {workflows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <WorkflowIcon className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No workflows yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Describe one in natural language above, or build it by hand.</p>
          </div>
        ) : null}
      </section>

      {builderOpen ? (
        <section className="rounded-xl border border-border/70 bg-card/60 p-4">
          <h2 className="text-sm font-semibold">New workflow</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only registered triggers, conditions and actions are accepted. Invalid definitions never save.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="wf-name">Name</Label>
              <Input id="wf-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5" placeholder="High-value deal alert" />
            </div>
            <div>
              <Label htmlFor="wf-description">Description</Label>
              <Input id="wf-description" value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5" placeholder="Notify when a deal over $100k is updated." />
            </div>
            <div>
              <Label htmlFor="wf-trigger">Trigger</Label>
              <Select
                value={triggerType}
                onValueChange={(value) => {
                  setTriggerType(value);
                  if (value === "deal_stage_changed") setEntity("deal");
                }}
              >
                <SelectTrigger id="wf-trigger" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((trigger) => (
                    <SelectItem key={trigger} value={trigger}>
                      {TRIGGER_LABELS[trigger]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="wf-entity">Record type</Label>
              <Select value={entity} onValueChange={(value) => setEntity(value as typeof entity)}>
                <SelectTrigger id="wf-entity" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["lead", "deal", "task"].map((option) => (
                    <SelectItem key={option} value={option}>
                      {titleCase(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <p className="label-caps">If (all must match)</p>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setConditions((current) => [...current, { key: nextKey(), type: "field_equals", field: "", value: "" }])
                  }
                >
                  <Plus /> Add
                </Button>
              </div>
              <div className="mt-1.5 space-y-2">
                {conditions.map((condition) => (
                  <div key={condition.key} className="rounded-lg border border-border/70 bg-surface-sunken/40 p-2">
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={condition.type}
                        onValueChange={(value) =>
                          setConditions((current) =>
                            current.map((item) => (item.key === condition.key ? { ...item, type: value } : item)),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEFAULT_CONDITION_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {titleCase(type.replace(/_gte$/, "").replace(/_/g, " "))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove condition"
                        onClick={() => setConditions((current) => current.filter((item) => item.key !== condition.key))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {condition.type === "field_equals" ? (
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <Select
                          value={condition.field}
                          onValueChange={(value) =>
                            setConditions((current) =>
                              current.map((item) => (item.key === condition.key ? { ...item, field: value } : item)),
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(entityFields).map((field) => (
                              <SelectItem key={field} value={field}>
                                {titleCase(field)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={condition.value}
                          onChange={(event) =>
                            setConditions((current) =>
                              current.map((item) =>
                                item.key === condition.key ? { ...item, value: event.target.value } : item,
                              ),
                            )
                          }
                          className="h-8 text-xs"
                          placeholder="Value"
                          list={`values-${condition.key}`}
                        />
                        <datalist id={`values-${condition.key}`}>
                          {Array.isArray(entityFields[condition.field])
                            ? (entityFields[condition.field] as readonly string[]).map((value) => (
                                <option key={value} value={value} />
                              ))
                            : null}
                        </datalist>
                      </div>
                    ) : null}
                    {condition.type === "field_gte" ? (
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <Select
                          value={condition.field}
                          onValueChange={(value) =>
                            setConditions((current) =>
                              current.map((item) => (item.key === condition.key ? { ...item, field: value } : item)),
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(entityFields)
                              .filter(([, type]) => type === "number")
                              .map(([field]) => (
                                <SelectItem key={field} value={field}>
                                  {titleCase(field)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={condition.value}
                          onChange={(event) =>
                            setConditions((current) =>
                              current.map((item) =>
                                item.key === condition.key ? { ...item, value: event.target.value } : item,
                              ),
                            )
                          }
                          className="h-8 text-xs"
                          placeholder="Threshold"
                        />
                      </div>
                    ) : null}
                    {condition.type === "days_since_contact_gte" || condition.type === "days_since_update_gte" ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Input
                          type="number"
                          value={condition.value}
                          onChange={(event) =>
                            setConditions((current) =>
                              current.map((item) =>
                                item.key === condition.key ? { ...item, value: event.target.value } : item,
                              ),
                            )
                          }
                          className="h-8 w-24 text-xs"
                        />
                        <span className="text-[11px] text-muted-foreground">days</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="label-caps">Then</p>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setActions((current) => [
                      ...current,
                      { key: nextKey(), type: "notify", title: "", priority: "medium", dueInDays: "1", reason: "", body: "", field: "", value: "" },
                    ])
                  }
                >
                  <Plus /> Add
                </Button>
              </div>
              <div className="mt-1.5 space-y-2">
                {actions.map((action) => (
                  <div key={action.key} className="rounded-lg border border-border/70 bg-surface-sunken/40 p-2">
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={action.type}
                        onValueChange={(value) =>
                          setActions((current) =>
                            current.map((item) =>
                              item.key === action.key ? { ...item, type: value as ActionDraft["type"] } : item,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="create_task">Create task</SelectItem>
                          <SelectItem value="flag_record">Flag record</SelectItem>
                          <SelectItem value="notify">Notify</SelectItem>
                          {writableFields.length > 0 ? <SelectItem value="update_field">Update field</SelectItem> : null}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove action"
                        onClick={() => setActions((current) => current.filter((item) => item.key !== action.key))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {action.type === "create_task" ? (
                      <div className="mt-1.5 space-y-1.5">
                        <Input
                          value={action.title}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item) => (item.key === action.key ? { ...item, title: event.target.value } : item)),
                            )
                          }
                          className="h-8 text-xs"
                          placeholder="Task title (use {{name}})"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <Select
                            value={action.priority}
                            onValueChange={(value) =>
                              setActions((current) =>
                                current.map((item) =>
                                  item.key === action.key ? { ...item, priority: value as ActionDraft["priority"] } : item,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
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
                          <Input
                            type="number"
                            value={action.dueInDays}
                            onChange={(event) =>
                              setActions((current) =>
                                current.map((item) => (item.key === action.key ? { ...item, dueInDays: event.target.value } : item)),
                              )
                            }
                            className="h-8 text-xs"
                            placeholder="Due in days"
                          />
                        </div>
                      </div>
                    ) : null}
                    {action.type === "flag_record" ? (
                      <Input
                        value={action.reason}
                        onChange={(event) =>
                          setActions((current) =>
                            current.map((item) => (item.key === action.key ? { ...item, reason: event.target.value } : item)),
                          )
                        }
                        className="mt-1.5 h-8 text-xs"
                        placeholder="Reason shown on the record"
                      />
                    ) : null}
                    {action.type === "notify" ? (
                      <div className="mt-1.5 space-y-1.5">
                        <Input
                          value={action.title}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item) => (item.key === action.key ? { ...item, title: event.target.value } : item)),
                            )
                          }
                          className="h-8 text-xs"
                          placeholder="Notification title"
                        />
                        <Input
                          value={action.body}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item) => (item.key === action.key ? { ...item, body: event.target.value } : item)),
                            )
                          }
                          className="h-8 text-xs"
                          placeholder="Body (use {{name}})"
                        />
                      </div>
                    ) : null}
                    {action.type === "update_field" ? (
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <Select
                          value={action.field}
                          onValueChange={(value) =>
                            setActions((current) =>
                              current.map((item) => (item.key === action.key ? { ...item, field: value } : item)),
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {writableFields.map((field) => (
                              <SelectItem key={field} value={field}>
                                {titleCase(field)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={action.value}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item) => (item.key === action.key ? { ...item, value: event.target.value } : item)),
                            )
                          }
                          className="h-8 text-xs"
                          placeholder="New value"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {issues.length > 0 ? (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-200">
                <CircleAlert className="size-3.5" /> Validation failed
              </p>
              <ul className="mt-1 space-y-0.5">
                {issues.map((issue) => (
                  <li key={issue} className="text-[11px] text-rose-100/80">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <Button onClick={save} disabled={name.trim().length < 3}>
              Save workflow (disabled)
            </Button>
            <Button variant="ghost" onClick={() => setBuilderOpen(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border/70 bg-card/60">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setShowHistory((current) => !current)}
          aria-expanded={showHistory}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Execution history ({runs.length})
          </span>
          {showHistory ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {showHistory ? (
          <div className="border-t border-border/60 p-3">
            {runs.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No executions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-1.5">Workflow</th>
                      <th className="px-2 py-1.5">Trigger</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Matched</th>
                      <th className="px-2 py-1.5">Effects</th>
                      <th className="px-2 py-1.5">When</th>
                      <th className="px-2 py-1.5">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-b border-border/40 last:border-0">
                        <td className="px-2 py-1.5 font-medium">{run.workflowName}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{titleCase(run.triggerType.replace(/_/g, " "))}</td>
                        <td className="px-2 py-1.5">
                          <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>{run.status}</Badge>
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{run.matched}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {["tasks", "flags", "updates", "notifications", "skipped"]
                            .filter((key) => (run.counts[key] ?? 0) > 0)
                            .map((key) => `${run.counts[key]} ${key}`)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{formatRelative(run.createdAt)}</td>
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{run.durationMs}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckSquare,
  Loader2,
  Plus,
  Target,
  UserCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ACTION_DEFS, type ActionId } from "@/lib/morph/config";
import type { RecordRow } from "@/lib/crm/data";
import type { FormOptions } from "@/lib/crm/form-options";
import {
  advanceDealStageAction,
  completeTaskAction,
  createFollowupTaskAction,
  createLeadAction,
  createTaskAction,
  logActivityAction,
  markLeadContactedAction,
  setLeadStatusAction,
} from "@/lib/actions/crm";
import { cn, titleCase } from "@/lib/utils";

type MutationOutcome = { ok: boolean; error?: string };

export function useRecordMutations() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (action: ActionId, row: RecordRow): Promise<MutationOutcome> => {
      if (!row.id) return { ok: false, error: "That row has no record id." };
      setPending(action);
      try {
        let result: MutationOutcome;
        switch (action) {
          case "mark_lead_contacted":
            result = await markLeadContactedAction(row.id);
            break;
          case "qualify_lead":
            result = await setLeadStatusAction(row.id, "qualified");
            break;
          case "create_followup_task":
            result = await createFollowupTaskAction(row.id);
            break;
          case "advance_deal_stage":
            result = await advanceDealStageAction(row.id);
            break;
          case "complete_task":
            result = await completeTaskAction(row.id);
            break;
          case "toggle_workflow":
          case "run_workflow":
            return { ok: false, error: "Use the workflow panel for that action." };
          default:
            return { ok: false, error: "Unsupported action" };
        }
        if (result.ok) {
          toast({ title: `${ACTION_DEFS[action].label} — done`, tone: "success" });
          router.refresh();
        } else {
          toast({ title: "Action failed", description: result.error, tone: "error" });
        }
        return result;
      } catch (error) {
        toast({
          title: "Action failed",
          description: error instanceof Error ? error.message : "Unexpected error",
          tone: "error",
        });
        return { ok: false };
      } finally {
        setPending(null);
      }
    },
    [router, toast],
  );

  return { run, pending };
}

const ACTION_ICONS: Partial<Record<ActionId, typeof Check>> = {
  mark_lead_contacted: UserCheck,
  qualify_lead: Target,
  create_followup_task: CheckSquare,
  advance_deal_stage: ArrowRight,
  complete_task: Check,
  run_workflow: Zap,
};

export function RecordActions({
  actions,
  row,
  max = 2,
}: {
  actions: ActionId[];
  row: RecordRow;
  max?: number;
}) {
  const { run, pending } = useRecordMutations();
  return (
    <>
      {actions.slice(0, max).map((action) => {
        const Icon = ACTION_ICONS[action] ?? ArrowRight;
        return (
          <Tooltip key={action}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={ACTION_DEFS[action].label}
                disabled={pending !== null}
                onClick={() => void run(action, row)}
                className="text-muted-foreground hover:text-foreground"
              >
                {pending === action ? <Loader2 className="animate-spin" /> : <Icon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{ACTION_DEFS[action].label}</TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Create lead                                                                */
/* -------------------------------------------------------------------------- */

export function CreateLeadDialog({ options, trigger }: { options: FormOptions; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createLeadAction({
        name: formData.get("name"),
        company: formData.get("company"),
        email: formData.get("email"),
        status: formData.get("status"),
        score: formData.get("score"),
        source: formData.get("source"),
        ownerId: formData.get("ownerId"),
        notes: formData.get("notes"),
      });
      if (!result.ok) {
        setError(result.error ?? "Could not create the lead.");
        return;
      }
      toast({ title: "Lead created", tone: "success" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus />
            New lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            Writes to the shared CRM. Creating a lead fires any enabled “record created” workflow.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lead-name">Name</Label>
              <Input id="lead-name" name="name" required className="mt-1.5" placeholder="Jordan Wells" />
            </div>
            <div>
              <Label htmlFor="lead-company">Company</Label>
              <Input id="lead-company" name="company" required list="company-options" className="mt-1.5" placeholder="Northwind Traders" />
              <datalist id="company-options">
                {options.companies.map((company) => (
                  <option key={company.id} value={company.name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" name="email" type="email" className="mt-1.5" placeholder="jordan@company.com" />
            </div>
            <div>
              <Label htmlFor="lead-source">Source</Label>
              <Select name="source" defaultValue="inbound">
                <SelectTrigger id="lead-source" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["inbound", "outbound", "referral", "event", "partner"].map((source) => (
                    <SelectItem key={source} value={source}>
                      {titleCase(source)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="lead-status">Status</Label>
              <Select name="status" defaultValue="new">
                <SelectTrigger id="lead-status" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["new", "contacted", "qualified"].map((status) => (
                    <SelectItem key={status} value={status}>
                      {titleCase(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="lead-owner">Owner</Label>
              <Select name="ownerId" defaultValue={options.owners[0]?.id}>
                <SelectTrigger id="lead-owner" className="mt-1.5">
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
            <div>
              <Label htmlFor="lead-score">Score (0–100)</Label>
              <Input id="lead-score" name="score" type="number" min={0} max={100} defaultValue={55} className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea id="lead-notes" name="notes" className="mt-1.5" rows={2} placeholder="Why are they interested?" />
          </div>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Create task                                                                */
/* -------------------------------------------------------------------------- */

export function CreateTaskDialog({ options, trigger }: { options: FormOptions; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const [relatedType, setRelatedType] = React.useState<"none" | "lead" | "deal">("none");

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createTaskAction({
        title: formData.get("title"),
        priority: formData.get("priority"),
        dueDate: formData.get("dueDate"),
        assigneeId: formData.get("assigneeId"),
        relatedType,
        relatedId: formData.get("relatedId"),
        notes: formData.get("notes"),
      });
      if (!result.ok) {
        setError(result.error ?? "Could not create the task.");
        return;
      }
      toast({ title: "Task created", tone: "success" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="secondary">
            <Plus />
            New task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Tasks are workspace-scoped and visible to the whole team.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" name="title" required className="mt-1.5" placeholder="Send renewal proposal" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                name="dueDate"
                type="date"
                defaultValue={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <Select name="priority" defaultValue="medium">
                <SelectTrigger id="task-priority" className="mt-1.5">
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
            <div>
              <Label htmlFor="task-owner">Assignee</Label>
              <Select name="assigneeId" defaultValue={options.owners[0]?.id}>
                <SelectTrigger id="task-owner" className="mt-1.5">
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
            <div>
              <Label htmlFor="task-related">Related to</Label>
              <Select value={relatedType} onValueChange={(value) => setRelatedType(value as typeof relatedType)}>
                <SelectTrigger id="task-related" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nothing</SelectItem>
                  <SelectItem value="lead">A lead</SelectItem>
                  <SelectItem value="deal">A deal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {relatedType !== "none" ? (
            <div>
              <Label htmlFor="task-related-id">{relatedType === "lead" ? "Lead" : "Deal"}</Label>
              <Select name="relatedId">
                <SelectTrigger id="task-related-id" className="mt-1.5">
                  <SelectValue placeholder="Choose a record" />
                </SelectTrigger>
                <SelectContent>
                  {(relatedType === "lead" ? options.leads : options.deals).map((record) => (
                    <SelectItem key={record.id} value={record.id}>
                      {"company" in record ? `${record.name} · ${record.company}` : record.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea id="task-notes" name="notes" rows={2} className="mt-1.5" />
          </div>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Log activity                                                               */
/* -------------------------------------------------------------------------- */

export function LogActivityDialog({ options, trigger }: { options: FormOptions; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await logActivityAction({
        kind: formData.get("kind"),
        subject: formData.get("subject"),
        body: formData.get("body"),
        leadId: formData.get("leadId"),
      });
      if (!result.ok) {
        setError(result.error ?? "Could not log the activity.");
        return;
      }
      toast({ title: "Activity logged", description: "Lead touch time updated.", tone: "success" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="secondary">
            Log activity
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
          <DialogDescription>
            Calls, emails and meetings count as a touch and reset the follow-up clock.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="activity-kind">Type</Label>
              <Select name="kind" defaultValue="call">
                <SelectTrigger id="activity-kind" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["call", "email", "meeting", "note"].map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {titleCase(kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="activity-lead">Lead</Label>
              <Select name="leadId">
                <SelectTrigger id="activity-lead" className="mt-1.5">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {options.leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.name} · {lead.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="activity-subject">Summary</Label>
            <Input id="activity-subject" name="subject" required className="mt-1.5" placeholder="Discovery call — budget confirmed" />
          </div>
          <div>
            <Label htmlFor="activity-body">Details</Label>
            <Textarea id="activity-body" name="body" rows={2} className="mt-1.5" />
          </div>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />}
              Log activity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Record picker for record-scoped quick actions                              */
/* -------------------------------------------------------------------------- */

export function RecordPickerDialog({
  action,
  options,
  trigger,
}: {
  action: ActionId;
  options: FormOptions;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { run, pending } = useRecordMutations();
  const isDeal = ACTION_DEFS[action].entity === "deal";
  const records = isDeal ? options.deals : options.leads;
  const filtered = records.filter((record) =>
    `${record.name} ${"company" in record ? record.company : ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            {ACTION_DEFS[action].label}
            <ArrowRight />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ACTION_DEFS[action].label}</DialogTitle>
          <DialogDescription>{ACTION_DEFS[action].description}</DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${isDeal ? "deals" : "leads"}…`}
          aria-label="Search records"
        />
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No matching records.</p>
          ) : (
            filtered.map((record) => (
              <button
                key={record.id}
                type="button"
                disabled={pending !== null}
                onClick={async () => {
                  const result = await run(action, { id: record.id } as RecordRow);
                  if (result.ok) setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors",
                  "hover:border-primary/40 hover:bg-primary/10",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{record.name}</span>
                  <span className="block truncate text-muted-foreground">
                    {"company" in record ? record.company : "stage" in record ? titleCase(record.stage) : ""}
                  </span>
                </span>
                {pending === action ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Badge tone="outline">{ACTION_DEFS[action].kind === "mutation" ? "Permission-checked write" : "Action"}</Badge>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

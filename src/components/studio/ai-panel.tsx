"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Loader2,
  CornerDownLeft,
  History,
  Layers,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ProposalDTO } from "@/lib/morph/engine";
import type { PersonalizationSuggestion } from "@/lib/morph/suggestions";
import type { JobRole } from "@/lib/morph/config";
import {
  applyProposalAction,
  discardProposalAction,
  dismissSuggestionAction,
  proposeAction,
} from "@/lib/actions/studio";

export interface HistoryItem {
  id: string;
  prompt: string;
  summary: string;
  engineLabel: string;
  kind: string;
  status: string;
  createdAt: string;
  latencyMs: number;
  refusal: string | null;
  operationCount: number;
}

const STAGES = [
  "Reading your instruction…",
  "Retrieving the current interface…",
  "Selecting components and data bindings…",
  "Validating the schema patch…",
  "Rendering the preview…",
];

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "primary" | "info"> = {
  applied: "success",
  proposed: "primary",
  discarded: "neutral",
  rejected: "danger",
  failed: "danger",
  needs_review: "warning",
};

export function AiPanel({
  role,
  engineLabel,
  history,
  suggestions,
  starterPrompts,
  onPreview,
  previewingId,
  onApplied,
  onCollapse,
}: {
  role: JobRole;
  engineLabel: string;
  history: HistoryItem[];
  suggestions: PersonalizationSuggestion[];
  starterPrompts: string[];
  onPreview: (proposal: ProposalDTO | null) => void;
  previewingId: string | null;
  onApplied: (message?: string) => void;
  onCollapse?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [prompt, setPrompt] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [stage, setStage] = React.useState(0);
  const [proposal, setProposal] = React.useState<ProposalDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!pending) return;
    setStage(0);
    const timer = setInterval(() => setStage((current) => Math.min(current + 1, STAGES.length - 1)), 900);
    return () => clearInterval(timer);
  }, [pending]);

  async function submit(text: string, options: { preview?: boolean } = {}) {
    const value = text.trim();
    if (!value || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await proposeAction(value);
      if (!result.ok || !result.proposal) {
        setError(result.error ?? "Morph could not build that change.");
        return;
      }
      setProposal(result.proposal);
      if (result.proposal.kind === "config" && (options.preview ?? true)) {
        onPreview(result.proposal);
      } else {
        onPreview(null);
      }
      if (result.proposal.kind === "refusal") {
        toast({
          title: "Morph can't do that safely",
          description: result.proposal.refusal ?? result.proposal.summary,
          tone: "error",
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setPending(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    try {
      const result = await applyProposalAction(proposal.id);
      if (!result.ok) {
        toast({ title: "Apply failed", description: result.error, tone: "error" });
        return;
      }
      onPreview(null);
      setProposal(null);
      setPrompt("");
      toast({
        title: result.kind === "workflow" ? "Workflow drafted" : "Interface updated",
        description: result.summary,
        tone: "success",
      });
      onApplied(result.summary);
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  async function discard() {
    if (!proposal) return;
    await discardProposalAction(proposal.id);
    onPreview(null);
    setProposal(null);
    toast({ title: "Proposal discarded", tone: "info" });
    router.refresh();
  }

  async function acceptSuggestion(suggestion: PersonalizationSuggestion) {
    setPrompt(suggestion.prompt);
    await submit(suggestion.prompt);
  }

  const isPreviewing = proposal && previewingId === proposal.id;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="size-3.5" />
          </span>
          <div>
            <p className="text-[13px] font-semibold leading-tight">Morph</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{engineLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge tone={engineLabel === "Local planner" ? "warning" : "success"} className="cursor-help">
                {engineLabel === "Local planner" ? "Local engine" : "Live model"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {engineLabel === "Local planner"
                ? "No model provider is configured. Proposals come from Morph's deterministic local planner and are labelled as such."
                : `Generated by ${engineLabel}. Every result is schema-validated before you see it.`}
            </TooltipContent>
          </Tooltip>
          {onCollapse ? (
            <Button variant="ghost" size="icon-sm" onClick={onCollapse} aria-label="Collapse Morph panel">
              <X />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!proposal ? (
          <div className="space-y-2">
            <p className="label-caps">Try</p>
            <div className="flex flex-col gap-1.5">
              {starterPrompts.slice(0, 3).map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => {
                    setPrompt(starter);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-lg border border-border/70 bg-surface-sunken/40 px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  “{starter}”
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {proposal ? (
          <div className="animate-fade-in rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-primary">{proposal.intent}</p>
                <p className="mt-1 text-xs leading-relaxed text-foreground">{proposal.summary}</p>
              </div>
              <Badge tone={proposal.engine === "openai" ? "success" : "warning"} className="shrink-0">
                {proposal.engineLabel}
              </Badge>
            </div>

            {proposal.kind === "refusal" ? (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-200">
                  <CircleAlert className="size-3.5" /> Not applied
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-rose-100/80">
                  {proposal.refusal ?? proposal.summary}
                </p>
              </div>
            ) : null}

            {proposal.changes.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {proposal.changes.map((change, index) => (
                  <li key={`${change.label}-${index}`} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span
                      className={cn(
                        "mt-1 size-1.5 shrink-0 rounded-full",
                        change.kind === "add" ? "bg-emerald-400" : change.kind === "remove" ? "bg-rose-400" : "bg-primary",
                      )}
                    />
                    <span>
                      <span className="text-foreground">{change.label}</span>
                      {change.detail ? <span className="text-muted-foreground"> · {change.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {proposal.diffCounts ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                +{proposal.diffCounts.added} added · −{proposal.diffCounts.removed} removed ·{" "}
                {proposal.diffCounts.kept} preserved
              </p>
            ) : null}

            {proposal.assumptions.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Assumptions</p>
                <ul className="mt-1 space-y-0.5">
                  {proposal.assumptions.map((assumption) => (
                    <li key={assumption} className="text-[11px] leading-relaxed text-muted-foreground">
                      · {assumption}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {proposal.unresolved.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-amber-200">Unresolved</p>
                {proposal.unresolved.map((item) => (
                  <p key={item} className="mt-0.5 text-[11px] leading-relaxed text-amber-100/80">
                    {item}
                  </p>
                ))}
              </div>
            ) : null}

            {proposal.warnings.filter((warning) => !warning.startsWith("No model provider")).length > 0 ? (
              <ul className="mt-3 space-y-1">
                {proposal.warnings
                  .filter((warning) => !warning.startsWith("No model provider"))
                  .map((warning) => (
                    <li key={warning} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                      {warning}
                    </li>
                  ))}
              </ul>
            ) : null}

            {proposal.kind === "workflow" && proposal.workflowDraft ? (
              <div className="mt-3 rounded-lg border border-border/70 bg-surface-sunken/60 p-2.5">
                <p className="text-[11px] font-medium">{proposal.workflowDraft.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Trigger: {proposal.workflowDraft.trigger.type.replace(/_/g, " ")} ·{" "}
                  {proposal.workflowDraft.conditions.length} condition(s) ·{" "}
                  {proposal.workflowDraft.actions.length} action(s)
                </p>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Saving creates it disabled — you review and enable it on the Workflows page.
                </p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {proposal.kind === "config" ? (
                <>
                  <Button
                    size="xs"
                    variant={isPreviewing ? "secondary" : "outline"}
                    onClick={() => onPreview(isPreviewing ? null : proposal)}
                  >
                    {isPreviewing ? "Exit preview" : "Preview"}
                  </Button>
                  <Button size="xs" onClick={apply} disabled={applying}>
                    {applying ? <Loader2 className="animate-spin" /> : <Check />}
                    Apply
                  </Button>
                </>
              ) : null}
              {proposal.kind === "workflow" ? (
                <Button size="xs" onClick={apply} disabled={applying}>
                  {applying ? <Loader2 className="animate-spin" /> : <Check />}
                  Save workflow draft
                </Button>
              ) : null}
              {proposal.kind === "restore" ? (
                <Button size="xs" onClick={apply} disabled={applying}>
                  {applying ? <Loader2 className="animate-spin" /> : <History />}
                  Restore previous version
                </Button>
              ) : null}
              <Button size="xs" variant="ghost" onClick={discard} disabled={applying}>
                <Trash2 />
                Discard
              </Button>
              <span className="ml-auto text-[10px] text-muted-foreground">{proposal.latencyMs}ms</span>
            </div>
            {proposal.warnings.some((warning) => warning.startsWith("No model provider")) ? (
              <p className="mt-2 rounded border border-border/60 bg-surface-sunken/50 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {proposal.warnings.find((warning) => warning.startsWith("No model provider"))}
              </p>
            ) : null}
          </div>
        ) : null}

        {suggestions.length > 0 && !proposal ? (
          <div className="space-y-2">
            <p className="label-caps">Suggested for you</p>
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-lg border border-border/70 bg-surface-sunken/40 p-2.5">
                <p className="text-[11px] font-medium text-foreground">{suggestion.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{suggestion.why}</p>
                <div className="mt-2 flex items-center gap-1">
                  <Button size="xs" variant="subtle" onClick={() => void acceptSuggestion(suggestion)}>
                    <Wand2 />
                    Try it
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      await dismissSuggestionAction(suggestion.id);
                      router.refresh();
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowHistory((current) => !current)}
            className="flex w-full items-center justify-between text-[11px] text-muted-foreground hover:text-foreground"
            aria-expanded={showHistory}
          >
            <span className="inline-flex items-center gap-1.5">
              <History className="size-3" /> History ({history.length})
            </span>
            {showHistory ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          {showHistory ? (
            <ul className="space-y-1.5">
              {history.length === 0 ? (
                <li className="text-[11px] text-muted-foreground">No transformations yet.</li>
              ) : (
                history.map((item) => (
                  <li key={item.id} className="rounded-md border border-border/60 bg-surface-sunken/30 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-foreground">{item.prompt}</p>
                      <Badge tone={STATUS_TONE[item.status] ?? "neutral"} className="shrink-0">
                        {item.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{item.engineLabel}</span>
                      <span>·</span>
                      <span>{item.operationCount} op(s)</span>
                      {item.kind === "workflow" ? <Badge tone="outline">workflow</Badge> : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border/70 p-3">
        {error ? (
          <p className="mb-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-200" role="alert">
            {error}
          </p>
        ) : null}
        {pending ? (
          <p className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
            <Loader2 className="size-3 animate-spin text-primary" />
            {STAGES[stage]}
          </p>
        ) : null}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit(prompt);
              }
            }}
            placeholder="Describe how you want this workspace to work…"
            rows={3}
            className="resize-none pr-10 text-xs"
            aria-label="Instruction for Morph"
            disabled={pending}
          />
          <Button
            size="icon-sm"
            className="absolute bottom-2 right-2"
            onClick={() => void submit(prompt)}
            disabled={pending || prompt.trim().length < 3}
            aria-label="Send instruction"
          >
            {pending ? <Loader2 className="animate-spin" /> : <CornerDownLeft />}
          </Button>
        </div>
        <p className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>⌘↵ to send · preview before apply</span>
          <span className="inline-flex items-center gap-1">
            <Layers className="size-3" /> schema-validated
          </span>
        </p>
      </div>
    </div>
  );
}

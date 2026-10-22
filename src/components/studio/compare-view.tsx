"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Play, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";
import { MorphCanvas } from "@/components/studio/canvas";
import type { ConfigData } from "@/lib/crm/data";
import type { FormOptions } from "@/lib/crm/form-options";
import type { JobRole, MorphConfig } from "@/lib/morph/config";
import type { DemoScenario } from "@/lib/demo";
import { resetDemoAction, runScenarioAction } from "@/lib/actions/studio";

interface Panel {
  config: MorphConfig;
  data: ConfigData;
  label: string;
  caption: string;
}

export interface CompareViewProps {
  personal: Panel;
  baseline: Panel;
  demo: Panel;
  scenarios: DemoScenario[];
  demoRuns: Array<{ scenario: string; engine: string; createdAt: string; status: string }>;
  engineLabel: string;
  options: FormOptions;
  role: JobRole;
  currentUserName: string;
}

function Pane({ panel, tone }: { panel: Panel; tone: "before" | "after" }) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-xl border",
        tone === "before" ? "border-border/70 bg-surface-sunken/40" : "border-primary/35 bg-primary/[0.04]",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {panel.label}
          </p>
          <p className="truncate text-[11px] text-muted-foreground/80">{panel.caption}</p>
        </div>
        <Badge tone={tone === "before" ? "neutral" : "primary"}>{panel.config.components.length} components</Badge>
      </header>
      <div className="max-h-[70dvh] overflow-y-auto p-3">
        <div className="[&_article]:min-h-[96px] [&_article]:p-3 [&_article_h3]:text-[11px] [&_article_p]:text-[10px]">
          <MorphCanvas
            config={panel.config}
            data={panel.data}
            options={{ owners: [], leads: [], deals: [], companies: [] }}
            role="general"
            currentUserName=""
            editable={false}
          />
        </div>
      </div>
    </section>
  );
}

export function CompareView(props: CompareViewProps) {
  const [tab, setTab] = React.useState<string>("personal");
  const [pending, setPending] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ scenario: string; summary: string; engineLabel: string; warnings: string[] } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const scenario = props.scenarios.find((item) => item.id === tab);
  const latestRun = scenario ? props.demoRuns.find((run) => run.scenario === scenario.id) : undefined;

  async function run() {
    if (!scenario) return;
    setPending(scenario.id);
    setResult(null);
    const outcome = await runScenarioAction(scenario.id);
    setPending(null);
    if (!outcome.ok) {
      toast({ title: "Demo transformation failed", description: outcome.error, tone: "error" });
      return;
    }
    setResult({
      scenario: scenario.id,
      summary: outcome.summary ?? "",
      engineLabel: outcome.engineLabel ?? props.engineLabel,
      warnings: outcome.warnings ?? [],
    });
    toast({ title: `${scenario.title} interface generated`, description: outcome.engineLabel, tone: "success" });
    router.refresh();
  }

  async function reset() {
    setPending("reset");
    const outcome = await resetDemoAction();
    setPending(null);
    if (!outcome.ok) {
      toast({ title: "Reset failed", description: outcome.error, tone: "error" });
      return;
    }
    setResult(null);
    toast({ title: "Demo reset", description: "The demo interface is back to the classic CRM.", tone: "success" });
    router.refresh();
  }

  return (
    <div className="px-4 py-5 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Before / after</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            One dataset, two interfaces. Both panes read the same workspace records — only the
            presentation and interaction model change. Demo scenarios run the real pipeline and are
            labelled with the engine that produced them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={reset} disabled={pending !== null}>
            {pending === "reset" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Reset demo
          </Button>
        </div>
      </header>

      <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setTab("personal")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
            tab === "personal"
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border/70 text-muted-foreground hover:bg-secondary/60",
          )}
        >
          My workspace
        </button>
        {props.scenarios.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setResult(null);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
              tab === item.id
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/70 text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {item.label} · {item.title}
          </button>
        ))}
      </div>

      {tab === "personal" ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-sunken/40 px-3 py-2 text-[11px] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Comparing the classic CRM baseline with your current personal interface. Change it from the
            studio canvas at any time.
          </div>
          <div className="flex flex-col gap-3 lg:flex-row">
            <Pane panel={props.baseline} tone="before" />
            <Pane panel={props.personal} tone="after" />
          </div>
        </div>
      ) : null}

      {scenario ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-border/70 bg-card/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <Badge tone="primary">{scenario.label}</Badge>
                  <p className="text-sm font-semibold">{scenario.title}</p>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{scenario.persona}</p>
                <p className="mt-3 rounded-lg border border-border/60 bg-surface-sunken/50 px-3 py-2 text-xs italic text-foreground">
                  “{scenario.prompt}”
                </p>
                <ul className="mt-3 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                  {scenario.expected.map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 size-3 text-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col items-stretch gap-1.5">
                <Button onClick={run} disabled={pending !== null}>
                  {pending === scenario.id ? <Loader2 className="animate-spin" /> : <Play />}
                  Generate live interface
                </Button>
                <span className="text-center text-[10px] text-muted-foreground">
                  Engine: {props.engineLabel}
                </span>
                {latestRun ? (
                  <span className="text-center text-[10px] text-muted-foreground">
                    Last run {formatRelative(latestRun.createdAt)} · {latestRun.engine === "openai" ? "live model" : "local planner"}
                  </span>
                ) : (
                  <span className="text-center text-[10px] text-muted-foreground">Not run yet in this workspace</span>
                )}
              </div>
            </div>
            {result ? (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/[0.07] p-3">
                <p className="text-[11px] font-medium text-primary">
                  Applied · generated by {result.engineLabel}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{result.summary}</p>
                {result.warnings
                  .filter((warning) => !warning.startsWith("No model provider"))
                  .map((warning) => (
                    <p key={warning} className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-200">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                      {warning}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row">
            <Pane panel={props.baseline} tone="before" />
            <Pane panel={{ ...props.demo, label: `After · ${scenario.title}` }} tone="after" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {scenario.resetHint} Demo changes never touch your personal interface.
          </p>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Loader2,
  Sparkles,
  Target,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { completeOnboardingAction } from "@/lib/actions/auth";
import { ROLE_PRESET_PREVIEW } from "@/lib/morph/presets";
import { GOALS_BY_ROLE } from "@/lib/morph/goals";
import { ROLE_LABELS, type JobRole } from "@/lib/morph/config";

const ROLES: Array<{ id: JobRole; icon: typeof Users; blurb: string }> = [
  {
    id: "sales_manager",
    icon: Target,
    blurb: "You own the forecast and want revenue, pipeline risk and follow-up discipline up front.",
  },
  {
    id: "sales_rep",
    icon: Users,
    blurb: "You carry a quota and need your leads, your tasks and today's priorities — nothing else.",
  },
  {
    id: "ops_manager",
    icon: Wrench,
    blurb: "You care about throughput: workload balance, stalled deals and process bottlenecks.",
  },
  {
    id: "general",
    icon: Briefcase,
    blurb: "Show me a balanced workspace and let me reshape it from there.",
  },
];


export function OnboardingWizard({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<JobRole | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [largeText, setLargeText] = useState(false);
  const [reduceClutter, setReduceClutter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const steps = ["Your role", "Your focus", "Interface"] as const;

  function toggleGoal(goal: string) {
    setGoals((current) =>
      current.includes(goal) ? current.filter((item) => item !== goal) : current.length >= 3 ? current : [...current, goal],
    );
  }

  function finish() {
    if (!role) return;
    setError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction({
        jobRole: role,
        goals,
        density,
        fontSize: largeText ? "lg" : "base",
        reduceClutter,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not finish onboarding.");
        return;
      }
      router.push("/studio");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
            <Sparkles className="size-4 text-white" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Morph</span>
        </div>
        <div className="flex items-center gap-2">
          {steps.map((label, index) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[11px] font-medium",
                  index < step
                    ? "border-primary bg-primary/20 text-primary"
                    : index === step
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                )}
              >
                {index < step ? <Check className="size-3" /> : index + 1}
              </span>
              <span className={cn("hidden text-xs sm:block", index === step ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-6 sm:p-8">
        {step === 0 ? (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-semibold tracking-tight">Hi {firstName} — what do you do?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Morph builds a different starting interface for each role. You can change this later,
              and nothing here is used to make silent changes on your behalf.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {ROLES.map((option) => {
                const active = role === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setRole(option.id);
                      setGoals([]);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
                        : "border-border/80 bg-surface/50 hover:border-border hover:bg-surface",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <option.icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                      {active ? <Check className="size-4 text-primary" /> : null}
                    </div>
                    <p className="mt-3 text-sm font-medium">{ROLE_LABELS[option.id]}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{option.blurb}</p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {ROLE_PRESET_PREVIEW[option.id].slice(0, 3).map((item) => (
                        <li key={item}>
                          <Badge tone="outline">{item}</Badge>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 1 && role ? (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-semibold tracking-tight">What should Morph optimize for?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Pick up to three. These become explicit personalization inputs — Morph never infers
              your goals from clicks.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {GOALS_BY_ROLE[role].map((goal) => {
                const active = goals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => toggleGoal(goal)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-xs transition-colors",
                      active
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-border hover:bg-secondary/60",
                    )}
                  >
                    {active ? <Check className="mr-1.5 inline size-3" /> : null}
                    {goal}
                  </button>
                );
              })}
            </div>
            <div className="mt-8">
              <p className="label-caps">Information density</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["compact", "comfortable", "spacious"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDensity(option)}
                    aria-pressed={density === option}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-xs capitalize transition-colors",
                      density === option
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary/60",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-semibold tracking-tight">One last thing</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Accessibility choices are stored with your preferences and applied to every interface
              Morph builds for you.
            </p>
            <div className="mt-6 space-y-3">
              <label className="flex items-center justify-between gap-4 rounded-lg border border-border/80 bg-surface/50 p-4">
                <span className="flex items-start gap-3">
                  <Accessibility className="mt-0.5 size-4 text-primary" />
                  <span>
                    <span className="block text-sm font-medium">Larger text</span>
                    <span className="block text-xs text-muted-foreground">Increase the base font size for readability.</span>
                  </span>
                </span>
                <Switch checked={largeText} onCheckedChange={setLargeText} aria-label="Larger text" />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-lg border border-border/80 bg-surface/50 p-4">
                <span className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 size-4 text-primary" />
                  <span>
                    <span className="block text-sm font-medium">Fewer distractions</span>
                    <span className="block text-xs text-muted-foreground">Hide secondary panels and reduce visual density.</span>
                  </span>
                </span>
                <Switch checked={reduceClutter} onCheckedChange={setReduceClutter} aria-label="Fewer distractions" />
              </label>
            </div>
            <div className="mt-6 rounded-lg border border-border/70 bg-surface-sunken/60 p-4">
              <p className="text-xs font-medium">Your starting interface</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {role ? ROLE_LABELS[role] : "General"} · {goals.length} goal{goals.length === 1 ? "" : "s"} ·{" "}
                {density} density
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                You can preview and change every part of it from the Morph panel — changes are
                versioned and reversible.
              </p>
            </div>
            {error ? (
              <p className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0 || pending}
          >
            <ArrowLeft />
            Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((current) => Math.min(2, current + 1))} disabled={!role}>
              Continue
              <ArrowRight />
            </Button>
          ) : (
            <Button onClick={finish} disabled={pending || !role}>
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {pending ? "Building your workspace…" : "Build my workspace"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type JobRole } from "@/lib/morph/config";
import { ALL_GOALS, GOALS_BY_ROLE } from "@/lib/morph/goals";
import { updatePreferencesAction } from "@/lib/actions/studio";

export interface SettingsValues {
  jobRole: JobRole;
  goals: string[];
  density: "compact" | "comfortable" | "spacious";
  fontSize: "base" | "lg" | "xl";
  highContrast: boolean;
  reduceMotion: boolean;
  reduceClutter: boolean;
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [values, setValues] = React.useState<SettingsValues>(initial);
  const [pending, startTransition] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const goals = Array.from(new Set([...GOALS_BY_ROLE[values.jobRole], ...ALL_GOALS]));

  function toggleGoal(goal: string) {
    setValues((current) => ({
      ...current,
      goals: current.goals.includes(goal)
        ? current.goals.filter((item) => item !== goal)
        : current.goals.length >= 3
          ? current.goals
          : [...current.goals, goal],
    }));
  }

  function save() {
    startTransition(async () => {
      const result = await updatePreferencesAction(values);
      if (!result.ok) {
        toast({ title: "Could not save settings", description: result.error, tone: "error" });
        return;
      }
      toast({
        title: "Preferences saved",
        description: "A new interface version records the accessibility change.",
        tone: "success",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border/70 bg-card/60 p-4">
        <h2 className="text-sm font-semibold">Role & focus</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          These are explicit preferences. Morph uses them as planning input and never infers them from
          your clicks.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="settings-role">Role</Label>
            <Select
              value={values.jobRole}
              onValueChange={(value) => setValues((current) => ({ ...current, jobRole: value as JobRole }))}
            >
              <SelectTrigger id="settings-role" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as JobRole[]).map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="settings-density">Layout density</Label>
            <Select
              value={values.density}
              onValueChange={(value) =>
                setValues((current) => ({ ...current, density: value as SettingsValues["density"] }))
              }
            >
              <SelectTrigger id="settings-density" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["compact", "comfortable", "spacious"].map((density) => (
                  <SelectItem key={density} value={density}>
                    {density}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label>Goals (max 3)</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {goals.map((goal) => {
              const active = values.goals.includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/70 text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {active ? <Check className="mr-1 inline size-3" /> : null}
                  {goal}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/60 p-4">
        <h2 className="text-sm font-semibold">Accessibility</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Applied to the document and written into your active interface configuration.
        </p>
        <div className="mt-3 space-y-2">
          <div>
            <Label htmlFor="settings-font">Text size</Label>
            <Select
              value={values.fontSize}
              onValueChange={(value) =>
                setValues((current) => ({ ...current, fontSize: value as SettingsValues["fontSize"] }))
              }
            >
              <SelectTrigger id="settings-font" className="mt-1.5 sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Default (16px)</SelectItem>
                <SelectItem value="lg">Larger (17.5px)</SelectItem>
                <SelectItem value="xl">Largest (19px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(
            [
              ["highContrast", "High contrast", "Stronger borders and brighter muted text."],
              ["reduceMotion", "Reduce motion", "Disables transitions and animations."],
              ["reduceClutter", "Fewer distractions", "Hides secondary captions and descriptions."],
            ] as const
          ).map(([key, label, description]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-surface-sunken/40 p-3"
            >
              <span>
                <span className="block text-xs font-medium">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{description}</span>
              </span>
              <Switch
                checked={values[key]}
                onCheckedChange={(checked) => setValues((current) => ({ ...current, [key]: checked }))}
                aria-label={label}
              />
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Save preferences
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setValues(initial);
            toast({ title: "Reverted unsaved changes", tone: "info" });
          }}
          disabled={pending}
        >
          <RotateCcw />
          Revert
        </Button>
      </div>
    </div>
  );
}

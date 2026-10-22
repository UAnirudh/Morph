"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { applyTemplateAction } from "@/lib/actions/studio";

export interface TemplateCard {
  role: "sales_manager" | "sales_rep" | "ops_manager" | "general";
  label: string;
  blurb: string;
  bullets: string[];
  componentCount: number;
  isCurrentRole: boolean;
}

export function TemplateGrid({ templates }: { templates: TemplateCard[] }) {
  const [pending, setPending] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {templates.map((template) => (
        <article key={template.role} className="rounded-xl border border-border/70 bg-card/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{template.label}</p>
                {template.isCurrentRole ? <Badge tone="success">your role</Badge> : null}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{template.blurb}</p>
            </div>
            <Sparkles className="size-4 text-primary" />
          </div>
          <ul className="mt-3 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
            {template.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3 text-emerald-400" />
                {bullet}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="xs"
              variant="secondary"
              disabled={pending !== null}
              onClick={async () => {
                setPending(template.role);
                const result = await applyTemplateAction(template.role);
                setPending(null);
                if (!result.ok) {
                  toast({ title: "Could not apply template", description: result.error, tone: "error" });
                  return;
                }
                toast({
                  title: `${template.label} template applied`,
                  description: "A new version was saved to your interface.",
                  tone: "success",
                });
                router.refresh();
              }}
            >
              {pending === template.role ? <Loader2 className="animate-spin" /> : null}
              Apply to my interface
            </Button>
            <span className="text-[10px] text-muted-foreground">{template.componentCount} components</span>
          </div>
        </article>
      ))}
    </div>
  );
}

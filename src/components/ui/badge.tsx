import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "outline";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-secondary/80 text-secondary-foreground border-border",
    primary: "bg-primary/15 text-primary border-primary/30",
    success: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30",
    warning: "bg-amber-500/12 text-amber-300 border-amber-500/30",
    danger: "bg-rose-500/12 text-rose-300 border-rose-500/30",
    info: "bg-sky-500/12 text-sky-300 border-sky-500/30",
    outline: "border-border bg-transparent text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border/70", className)} role="separator" />;
}

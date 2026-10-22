"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ event: "studio.error_boundary", message: error.message }));
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <div className="max-w-md rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-6 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-rose-500/15 text-rose-300">
          <TriangleAlert className="size-5" />
        </span>
        <h1 className="mt-3 text-base font-semibold">Something went wrong in this view</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Your data is safe — the interface failed to render. You can retry, or open a different section
          from the sidebar.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">ref {error.digest}</p>
        ) : null}
        <Button className="mt-4" onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    </div>
  );
}

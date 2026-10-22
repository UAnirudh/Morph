import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="morph-grid-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
        <Compass className="size-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">This view doesn&apos;t exist</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        The page moved, or the link was mistyped. Your workspace is one click away.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/studio">
            <ArrowLeft />
            Back to the workspace
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}

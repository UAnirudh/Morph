"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Loader2, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { demoLoginAction, signInAction, signUpAction, type AuthState } from "@/lib/actions/auth";

const initial: AuthState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-rose-300">{message}</p>;
}

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initial);
  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue="demo@morph.app"
            placeholder="you@company.com"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue="morph-demo"
            placeholder="••••••••"
            className="mt-1.5"
          />
        </div>
        {state.error ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={demoLoginAction}>
        <Button type="submit" variant="secondary" className="w-full">
          <Sparkles />
          Enter the seeded demo workspace
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initial);
  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" autoComplete="name" required placeholder="Ada Lovelace" className="mt-1.5" />
          <FieldError message={state.fieldErrors?.name} />
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            className="mt-1.5"
          />
          <FieldError message={state.fieldErrors?.email} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="mt-1.5"
          />
          <FieldError message={state.fieldErrors?.password} />
        </div>
        {state.error ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {pending ? "Creating your account…" : "Create account"}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

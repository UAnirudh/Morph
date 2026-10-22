import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/auth-forms";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/studio");
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="You'll pick your role next — Morph builds a starting interface around it."
    >
      <SignUpForm />
    </AuthShell>
  );
}

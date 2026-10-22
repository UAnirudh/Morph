import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/studio");
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace, or jump straight into the seeded demo."
    >
      <SignInForm />
    </AuthShell>
  );
}

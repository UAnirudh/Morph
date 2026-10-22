import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { PreferencesRow } from "@/lib/db/types";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = getDb();
  const prefs = db
    .prepare("SELECT * FROM user_preferences WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
    .get(user.id) as PreferencesRow | undefined;
  if (prefs?.onboarding_complete === 1) redirect("/studio");

  const firstName = user.name.split(" ")[0] ?? user.name;
  return (
    <div className="morph-grid-bg min-h-dvh px-6 py-12">
      <main id="main">
        <OnboardingWizard firstName={firstName} />
      </main>
    </div>
  );
}

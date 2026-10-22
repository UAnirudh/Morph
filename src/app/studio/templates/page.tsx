import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth/session";
import {
  ROLE_PRESET_PREVIEW,
  rolePresetConfig,
  rolePresetSummary,
} from "@/lib/morph/presets";
import { ROLE_LABELS, type JobRole } from "@/lib/morph/config";
import { TemplateGrid, type TemplateCard } from "@/components/studio/template-grid";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

const ROLES: JobRole[] = ["sales_manager", "sales_rep", "ops_manager", "general"];

export default async function TemplatesPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const templates: TemplateCard[] = ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    blurb: rolePresetSummary(role),
    bullets: ROLE_PRESET_PREVIEW[role],
    componentCount: rolePresetConfig(role).components.length,
    isCurrentRole: ctx.preferences.job_role === role,
  }));

  return (
    <div className="px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Templates</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
          Each template is a validated interface configuration, not a screenshot. Applying one writes a
          new version to your personal interface, so you can always restore what you had.
        </p>
      </header>
      <div className="mt-4">
        <TemplateGrid templates={templates} />
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Templates are the same presets Morph uses as a starting point in onboarding. The CRM template is
        the only application template in this MVP — the schema registry is designed to add more.
      </p>
    </div>
  );
}

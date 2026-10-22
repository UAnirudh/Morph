"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, newId, nowIso } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { DEMO_EMAIL, provisionWorkspaceForUser } from "@/lib/db/seed";
import {
  createSession,
  destroySession,
  getSessionUser,
  requireUser,
} from "@/lib/auth/session";
import { logError, logEvent } from "@/lib/log";
import { morphConfigSchema, jobRoleSchema } from "@/lib/morph/config";
import { rolePresetConfig } from "@/lib/morph/presets";

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please check the highlighted fields.", fieldErrors };
  }

  if (process.env.MORPH_ALLOW_SIGNUP === "false") {
    return { error: "Signups are disabled on this deployment. Try the demo workspace." };
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(parsed.data.email) as { id: string } | undefined;
  if (existing) {
    return {
      error: "An account with that email already exists.",
      fieldErrors: { email: "Email already registered" },
    };
  }

  const id = newId();
  try {
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, parsed.data.email, parsed.data.name, hashPassword(parsed.data.password), "violet", nowIso());
  } catch (error) {
    logError("auth.signup.failed", error);
    return { error: "We could not create your account. Try again." };
  }

  await createSession(id);
  logEvent("info", { event: "auth.signup", userId: id });
  redirect("/onboarding");
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }
  const db = getDb();
  const user = db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(parsed.data.email) as { id: string; password_hash: string } | undefined;
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return { error: "That email and password combination doesn't match our records." };
  }
  await createSession(user.id);
  logEvent("info", { event: "auth.signin", userId: user.id });
  redirect("/studio");
}

export async function demoLoginAction(): Promise<void> {
  const db = getDb();
  const demo = db.prepare("SELECT id FROM users WHERE email = ?").get(DEMO_EMAIL) as
    | { id: string }
    | undefined;
  if (!demo) {
    return;
  }
  await createSession(demo.id);
  logEvent("info", { event: "auth.demo_login", userId: demo.id });
  redirect("/studio");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const onboardingSchema = z.object({
  jobRole: jobRoleSchema,
  goals: z.array(z.string().max(80)).max(4),
  density: z.enum(["compact", "comfortable", "spacious"]),
  fontSize: z.enum(["base", "lg", "xl"]),
  reduceClutter: z.boolean(),
});

export async function completeOnboardingAction(input: {
  jobRole: string;
  goals: string[];
  density: string;
  fontSize: string;
  reduceClutter: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Choose a role and at least one focus area." };
  }
  const db = getDb();
  const membership = db
    .prepare("SELECT * FROM workspace_members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(user.id) as { workspace_id: string } | undefined;

  let workspaceId = membership?.workspace_id;

  if (!workspaceId) {
    try {
      const provisioned = provisionWorkspaceForUser(db, {
        id: user.id,
        name: user.name,
        email: user.email,
        jobRole: parsed.data.jobRole,
      });
      workspaceId = provisioned.workspaceId;
    } catch (error) {
      logError("onboarding.provision.failed", error, { userId: user.id });
      return { ok: false, error: "We could not prepare your workspace. Please try again." };
    }
  }

  const preset = rolePresetConfig(parsed.data.jobRole);
  const config = morphConfigSchema.parse({
    ...preset,
    layout: { ...preset.layout, density: parsed.data.density },
    accessibility: { ...preset.accessibility, fontSize: parsed.data.fontSize, reduceClutter: parsed.data.reduceClutter },
  });

  const personal = db
    .prepare(
      "SELECT * FROM interfaces WHERE workspace_id = ? AND owner_id = ? AND kind = 'personal' LIMIT 1",
    )
    .get(workspaceId, user.id) as { id: string } | undefined;

  let personalInterfaceId = personal?.id;
  if (personalInterfaceId) {
    const latest = db
      .prepare("SELECT MAX(version) AS v FROM interface_versions WHERE interface_id = ?")
      .get(personalInterfaceId) as { v: number | null };
    const nextVersion = (latest.v ?? 0) + 1;
    db.prepare("UPDATE interface_versions SET is_current = 0 WHERE interface_id = ?").run(personalInterfaceId);
    db.prepare(
      `INSERT INTO interface_versions (id, interface_id, workspace_id, version, config, summary, source, created_by, is_current, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'template', ?, 1, ?)`,
    ).run(
      newId(),
      personalInterfaceId,
      workspaceId,
      nextVersion,
      JSON.stringify(config),
      `Personalized for ${parsed.data.jobRole.replace("_", " ")} during onboarding.`,
      user.id,
      nowIso(),
    );
    db.prepare("UPDATE interfaces SET name = ?, updated_at = ? WHERE id = ?").run(
      config.name,
      nowIso(),
      personalInterfaceId,
    );
  }

  db.prepare(
    `UPDATE user_preferences SET job_role = ?, primary_goals = ?, density = ?, accessibility = ?,
       active_interface_id = COALESCE(?, active_interface_id), onboarding_complete = 1, updated_at = ?
     WHERE user_id = ? AND workspace_id = ?`,
  ).run(
    parsed.data.jobRole,
    JSON.stringify(parsed.data.goals),
    parsed.data.density,
    JSON.stringify({
      fontSize: parsed.data.fontSize,
      reduceClutter: parsed.data.reduceClutter,
      highContrast: false,
      reduceMotion: false,
    }),
    personalInterfaceId ?? null,
    nowIso(),
    user.id,
    workspaceId,
  );

  logEvent("info", { event: "onboarding.completed", userId: user.id, jobRole: parsed.data.jobRole });
  return { ok: true };
}

export async function getCurrentUserAction() {
  return getSessionUser();
}

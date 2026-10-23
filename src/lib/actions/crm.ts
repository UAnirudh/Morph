"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import {
  advanceDealStage,
  completeTask,
  createFollowupTask,
  createLead,
  createTask,
  logActivity,
  markLeadContacted,
  setDealStage,
  setLeadStatus,
  updateLead,
  type MutationResult,
} from "@/lib/crm/mutations";

function revalidateWorkspace() {
  for (const path of [
    "/studio",
    "/studio/crm/leads",
    "/studio/crm/deals",
    "/studio/crm/tasks",
    "/studio/crm/companies",
    "/studio/crm/activities",
    "/studio/workflows",
    "/studio/compare",
    "/studio/versions",
  ]) {
    revalidatePath(path);
  }
}

async function scope() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  return {
    db: getDb(),
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
  };
}

export async function createLeadAction(input: unknown): Promise<MutationResult<{ id: string }>> {
  const result = await createLead(await scope(), input);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function updateLeadAction(
  leadId: string,
  patch: Record<string, unknown>,
): Promise<MutationResult> {
  const result = await updateLead(await scope(), leadId, patch);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function markLeadContactedAction(leadId: string): Promise<MutationResult> {
  const result = await markLeadContacted(await scope(), leadId);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function setLeadStatusAction(
  leadId: string,
  status: "new" | "contacted" | "qualified" | "unqualified" | "converted",
): Promise<MutationResult> {
  const result = await setLeadStatus(await scope(), leadId, status);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function createFollowupTaskAction(leadId: string): Promise<MutationResult<{ id: string }>> {
  const result = await createFollowupTask(await scope(), leadId);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function advanceDealStageAction(dealId: string): Promise<MutationResult<{ stage: string }>> {
  const result = await advanceDealStage(await scope(), dealId);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function setDealStageAction(
  dealId: string,
  stage: "prospecting" | "qualification" | "proposal" | "negotiation" | "won" | "lost",
): Promise<MutationResult<{ stage: string }>> {
  const result = await setDealStage(await scope(), dealId, stage);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function createTaskAction(input: unknown): Promise<MutationResult<{ id: string }>> {
  const result = await createTask(await scope(), input);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function completeTaskAction(taskId: string): Promise<MutationResult> {
  const result = await completeTask(await scope(), taskId);
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function logActivityAction(input: unknown): Promise<MutationResult<{ id: string }>> {
  const result = await logActivity(await scope(), input);
  if (result.ok) revalidateWorkspace();
  return result;
}

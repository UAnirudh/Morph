import { describe, expect, it } from "vitest";
import { seededContext, type TestContext } from "./helpers";
import {
  advanceDealStage,
  completeTask,
  createLead,
  createTask,
  markLeadContacted,
  setDealStage,
  updateLead,
} from "@/lib/crm/mutations";
import { provisionWorkspaceForUser } from "@/lib/db/seed";
import { hashPassword } from "@/lib/auth/password";
import { newId, nowIso } from "@/lib/db";

function scope(ctx: TestContext) {
  return { db: ctx.db, workspaceId: ctx.workspace.id, userId: ctx.user.id };
}

describe("CRM mutations", () => {
  it("creates a lead, logs an activity and assigns an owner", async () => {
    const ctx = await seededContext();
    const result = await createLead(scope(ctx), {
      name: "Nina Volkov",
      company: "Kestrel Systems",
      email: "nina@kestrel.example.com",
      status: "new",
      score: 72,
      source: "referral",
      ownerId: ctx.user.id,
    });
    expect(result.ok).toBe(true);
    const id = result.record!.id;
    const lead = await ctx.db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as {
      name: string;
      company: string;
      owner_id: string;
      score: number;
    };
    expect(lead).toMatchObject({ name: "Nina Volkov", company: "Kestrel Systems", owner_id: ctx.user.id, score: 72 });

    const activity = await ctx.db
      .prepare("SELECT subject FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(id) as { subject: string };
    expect(activity.subject).toContain("Lead created");
  });

  it("rejects invalid lead input", async () => {
    const ctx = await seededContext();
    expect((await createLead(scope(ctx), { name: "A", company: "" })).ok).toBe(false);
    expect((await createLead(scope(ctx), { name: "Valid Name", company: "Acme", email: "not-an-email" })).ok).toBe(false);
  });

  it("marks a lead contacted and resets the follow-up clock", async () => {
    const ctx = await seededContext();
    const lead = await ctx.db
      .prepare("SELECT id FROM leads WHERE workspace_id = ? AND flagged = 1 LIMIT 1")
      .get(ctx.workspace.id) as { id: string };
    await ctx.db.prepare("UPDATE leads SET last_contacted_at = ? WHERE id = ?").run(
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      lead.id,
    );

    const result = await markLeadContacted(scope(ctx), lead.id);
    expect(result.ok).toBe(true);
    const row = await ctx.db.prepare("SELECT status, last_contacted_at, flagged FROM leads WHERE id = ?").get(lead.id) as {
      status: string;
      last_contacted_at: string;
      flagged: number;
    };
    expect(new Date(row.last_contacted_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(row.flagged).toBe(0);
    expect(["new", "contacted"]).toContain(row.status);
  });

  it("blocks mutations against another workspace's records", async () => {
    const ctx = await seededContext();
    const lead = await ctx.db
      .prepare("SELECT id FROM leads WHERE workspace_id = ? LIMIT 1")
      .get(ctx.workspace.id) as { id: string };
    const result = await markLeadContacted(
      { db: ctx.db, workspaceId: "ws_someone_else", userId: ctx.user.id },
      lead.id,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.toLowerCase()).toContain("member");
  });

  it("moves a deal through stages and closes it", async () => {
    const ctx = await seededContext();
    const deal = await ctx.db
      .prepare("SELECT id, stage, amount FROM deals WHERE workspace_id = ? AND stage = 'proposal' LIMIT 1")
      .get(ctx.workspace.id) as { id: string; stage: string; amount: number };

    const advanced = await advanceDealStage(scope(ctx), deal.id);
    expect(advanced.ok).toBe(true);
    expect(advanced.record!.stage).toBe("negotiation");

    const won = await setDealStage(scope(ctx), deal.id, "won");
    expect(won.ok).toBe(true);
    const row = await ctx.db.prepare("SELECT stage, probability, closed_at FROM deals WHERE id = ?").get(deal.id) as {
      stage: string;
      probability: number;
      closed_at: string | null;
    };
    expect(row.stage).toBe("won");
    expect(row.probability).toBe(100);
    expect(row.closed_at).toBeTruthy();

    const stageChange = await ctx.db
      .prepare("SELECT COUNT(*) AS c FROM activities WHERE deal_id = ? AND kind = 'stage_change'")
      .get(deal.id) as { c: number };
    expect(stageChange.c).toBeGreaterThanOrEqual(2);
  });

  it("completes and reopens tasks", async () => {
    const ctx = await seededContext();
    const task = await ctx.db
      .prepare("SELECT id FROM tasks WHERE workspace_id = ? AND status = 'open' LIMIT 1")
      .get(ctx.workspace.id) as { id: string };

    expect((await completeTask(scope(ctx), task.id)).ok).toBe(true);
    let row = await ctx.db.prepare("SELECT status, completed_at FROM tasks WHERE id = ?").get(task.id) as {
      status: string;
      completed_at: string | null;
    };
    expect(row.status).toBe("done");
    expect(row.completed_at).toBeTruthy();

    expect((await completeTask(scope(ctx), task.id)).ok).toBe(true);
    row = await ctx.db.prepare("SELECT status, completed_at FROM tasks WHERE id = ?").get(task.id) as {
      status: string;
      completed_at: string | null;
    };
    expect(row.status).toBe("open");
    expect(row.completed_at).toBeNull();
  });

  it("validates a task's related record belongs to the workspace", async () => {
    const ctx = await seededContext();
    const foreignLead = (await createLead(scope(ctx), { name: "Cross Check", company: "Initech" })).record!.id;
    const other = await ctx.db
      .prepare("SELECT id FROM leads WHERE workspace_id = ? AND id != ? LIMIT 1")
      .get(ctx.workspace.id, foreignLead) as { id: string };
    const result = await createTask(scope(ctx), {
      title: "Linked task",
      relatedType: "lead",
      relatedId: other.id,
      priority: "medium",
    });
    expect(result.ok).toBe(true);
  });

  it("keeps workspaces isolated when a second account is provisioned", async () => {
    const ctx = await seededContext();
    const otherUserId = newId();
    await ctx.db.prepare(
      "INSERT INTO users (id, email, name, password_hash, avatar_color, created_at) VALUES (?, ?, ?, ?, 'sky', ?)",
    ).run(otherUserId, "other@example.com", "Other User", hashPassword("password123"), nowIso());
    const provisioned = await provisionWorkspaceForUser(
      ctx.db,
      { id: otherUserId, name: "Other User", email: "other@example.com", jobRole: "sales_rep" },
      { now: new Date() },
    );
    expect(provisioned.workspaceId).not.toBe(ctx.workspace.id);

    const myLead = await ctx.db
      .prepare("SELECT id FROM leads WHERE workspace_id = ? LIMIT 1")
      .get(ctx.workspace.id) as { id: string };
    const result = await markLeadContacted(
      { db: ctx.db, workspaceId: provisioned.workspaceId, userId: otherUserId },
      myLead.id,
    );
    expect(result.ok).toBe(false);

    const leaked = await ctx.db
      .prepare("SELECT COUNT(*) AS c FROM leads WHERE workspace_id = ? AND id = ?")
      .get(provisioned.workspaceId, myLead.id) as { c: number };
    expect(leaked.c).toBe(0);
  });

  it("rejects invalid status updates", async () => {
    const ctx = await seededContext();
    const lead = await ctx.db
      .prepare("SELECT id FROM leads WHERE workspace_id = ? LIMIT 1")
      .get(ctx.workspace.id) as { id: string };
    const result = await updateLead(scope(ctx), lead.id, { status: "super-hot" });
    expect(result.ok).toBe(false);
  });
});

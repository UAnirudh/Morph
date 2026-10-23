import type { Db } from "@/lib/db";
import { hashPassword, unusablePasswordHash } from "@/lib/auth/password";
import { classicCrmConfig, rolePresetConfig } from "@/lib/morph/presets";
import { workflowDefinitionSchema } from "@/lib/workflows/schema";
import type { JobRole } from "./types";

/* -------------------------------------------------------------------------- */
/* Deterministic pseudo-randomness                                            */
/* -------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const int = (rand: Rand, min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const shift = (base: Date, days: number, hours = 0) =>
  new Date(base.getTime() + days * DAY + hours * 3_600_000);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const COMPANIES = [
  { name: "Northwind Traders", industry: "Logistics", size: "250-500", city: "Seattle", website: "northwind.example.com" },
  { name: "Globex Corporation", industry: "Manufacturing", size: "1000+", city: "Chicago", website: "globex.example.com" },
  { name: "Initech", industry: "Software", size: "100-250", city: "Austin", website: "initech.example.com" },
  { name: "Vertex Dynamics", industry: "Aerospace", size: "500-1000", city: "Denver", website: "vertexdyn.example.com" },
  { name: "Halcyon Health", industry: "Healthcare", size: "250-500", city: "Boston", website: "halcyonhealth.example.com" },
  { name: "Brighton & Co", industry: "Retail", size: "50-100", city: "Portland", website: "brightonco.example.com" },
  { name: "Kestrel Systems", industry: "Hardware", size: "500-1000", city: "San Jose", website: "kestrel.example.com" },
  { name: "Umbrella Labs", industry: "Biotech", size: "100-250", city: "San Diego", website: "umbrellalabs.example.com" },
] as const;

const FIRST_NAMES = ["Amara", "Ben", "Chloe", "Dev", "Elena", "Felix", "Grace", "Hugo", "Iris", "Jonah", "Kira", "Liam", "Mina", "Noah", "Owen", "Priya", "Quinn", "Rosa", "Sam", "Tara", "Umar", "Vera", "Wes", "Xena", "Yara", "Zane"] as const;
const LAST_NAMES = ["Okafor", "Whitfield", "Brennan", "Patel", "Moreau", "Lindqvist", "Tanaka", "Alvarez", "Novak", "Fischer", "Haddad", "Osei", "Park", "Romano", "Silva", "Nakamura", "Duarte", "Kowalski", "Mensah", "Berger", "Iyer", "Costa", "Larsen", "Mendes", "Rahman", "Vogel"] as const;

const TITLES = ["VP Revenue", "Head of Sales", "Operations Director", "Procurement Lead", "CTO", "COO", "IT Manager", "Finance Director"] as const;
const SOURCES = ["inbound", "outbound", "referral", "event", "partner"] as const;
const STAGES = ["prospecting", "qualification", "proposal", "negotiation", "won", "lost"] as const;
const PRODUCTS = ["Platform renewal", "Expansion — West", "Pilot program", "Enterprise tier", "Data migration", "Analytics add-on", "Support upgrade", "Multi-site rollout"] as const;
const ACTIVITY_TEMPLATES = [
  { kind: "call", subject: "Discovery call with {company}" },
  { kind: "email", subject: "Sent pricing recap to {company}" },
  { kind: "meeting", subject: "Demo with {company} stakeholders" },
  { kind: "note", subject: "Notes from {company} requirements review" },
  { kind: "stage_change", subject: "{company} deal moved stage" },
  { kind: "workflow", subject: "Automation flagged a stale lead at {company}" },
] as const;

const TASK_TEMPLATES = [
  "Send follow-up email to {company}",
  "Prepare renewal proposal for {company}",
  "Schedule technical review with {company}",
  "Confirm security questionnaire from {company}",
  "Check in with {company} champion",
  "Book quarterly business review with {company}",
  "Collect signed order form from {company}",
  "Update forecast for {company}",
] as const;

const WORKSPACE_NAME = "Acme Revenue Operations";
const WORKSPACE_SLUG = "acme-revenue-ops";

export interface ProvisionOptions {
  workspaceId: string;
  workspaceName: string;
  slug: string;
  owner: { id: string; name: string; email: string };
  jobRole: JobRole;
  now: Date;
  seed: number;
  onboardingComplete: boolean;
  teammates?: Array<{ id: string; name: string; email: string; jobRole: JobRole }>;
}

export interface ProvisionResult {
  workspaceId: string;
  personalInterfaceId: string;
  baselineInterfaceId: string;
  demoInterfaceId: string;
  leadCount: number;
  dealCount: number;
  taskCount: number;
}

/**
 * Creates a fully populated workspace: team, CRM records, interfaces and
 * preferences. Used both by the demo seeder and by real signups, so every new
 * account starts inside a working CRM rather than an empty shell.
 */
export async function provisionWorkspace(db: Db, options: ProvisionOptions): Promise<ProvisionResult> {
  const rand = mulberry32(options.seed);
  const { now, slug, workspaceId } = options;
  const ownerId = options.owner.id;
  return db.transaction(async (db) => {
    await db.prepare(
      "INSERT INTO workspaces (id, name, slug, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(workspaceId, options.workspaceName, slug, ownerId, iso(shift(now, -120)));

    await db.prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role, job_role, created_at) VALUES (?, ?, 'owner', ?, ?)",
    ).run(workspaceId, ownerId, options.jobRole, iso(shift(now, -120)));

    const teammates = options.teammates ?? [];
    const teamIds: string[] = [];
    for (const teammate of teammates) {
      await db.prepare(
        `INSERT INTO users (id, email, name, password_hash, avatar_color, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO NOTHING`,
      ).run(
        teammate.id,
        teammate.email,
        teammate.name,
        unusablePasswordHash(),
        pick(rand, ["violet", "sky", "emerald", "amber"]),
        iso(shift(now, -110)),
      );
      const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(teammate.email) as
        | { id: string }
        | undefined;
      const memberId = existing?.id ?? teammate.id;
      teamIds.push(memberId);
      await db.prepare(
        "INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, job_role, created_at) VALUES (?, ?, 'member', ?, ?)",
      ).run(workspaceId, memberId, teammate.jobRole, iso(shift(now, -110)));
    }
    const assignees = [ownerId, ...teamIds];

    // --- companies -------------------------------------------------------
    const companyIds: string[] = [];
    for (const [index, company] of COMPANIES.entries()) {
      const id = `${slug}-co-${index + 1}`;
      companyIds.push(id);
      await db.prepare(
        `INSERT INTO companies (id, workspace_id, name, industry, size, city, website, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        workspaceId,
        company.name,
        company.industry,
        company.size,
        company.city,
        company.website,
        iso(shift(now, -int(rand, 200, 400))),
      );
    }

    // --- contacts --------------------------------------------------------
    const contactIds: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      const first = FIRST_NAMES[(i * 3 + 2) % FIRST_NAMES.length]!;
      const last = LAST_NAMES[(i * 5 + 1) % LAST_NAMES.length]!;
      const companyIndex = i % companyIds.length;
      const id = `${slug}-ct-${i + 1}`;
      contactIds.push(id);
      await db.prepare(
        `INSERT INTO contacts (id, workspace_id, company_id, first_name, last_name, email, phone, title, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        workspaceId,
        companyIds[companyIndex]!,
        first,
        last,
        `${first.toLowerCase()}.${last.toLowerCase()}@${COMPANIES[companyIndex]!.website.split(".")[0]}.example.com`,
        `+1 (${int(rand, 200, 989)}) 555-${String(int(rand, 1000, 9999))}`,
        pick(rand, TITLES),
        iso(shift(now, -int(rand, 20, 200))),
      );
    }

    // --- leads -----------------------------------------------------------
    const leadIds: string[] = [];
    const leadStatuses = [
      "contacted", "contacted", "contacted", "contacted", "contacted", "contacted",
      "qualified", "qualified", "qualified", "qualified",
      "new", "new", "new", "new",
      "contacted", "contacted", "qualified",
      "unqualified", "unqualified",
      "contacted", "contacted", "qualified",
      "new", "contacted", "qualified", "contacted",
    ];
    for (let i = 0; i < 26; i += 1) {
      const companyIndex = i % COMPANIES.length;
      const company = COMPANIES[companyIndex]!;
      const first = FIRST_NAMES[(i * 7 + 3) % FIRST_NAMES.length]!;
      const last = LAST_NAMES[(i * 11 + 5) % LAST_NAMES.length]!;
      const status = leadStatuses[i] ?? "new";
      const id = `${slug}-lead-${i + 1}`;
      leadIds.push(id);
      // The first six leads are deliberately stale: the seeded automation is
      // built around leads with no contact in 7+ days.
      const stale = i < 6;
      const lastContacted =
        status === "new"
          ? null
          : iso(shift(now, -(stale ? int(rand, 8, 24) : int(rand, 0, 5))));
      await db.prepare(
        `INSERT INTO leads (id, workspace_id, company_id, contact_id, name, company, email, phone, source,
           status, score, owner_id, last_contacted_at, flagged, flag_reason, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        workspaceId,
        companyIds[companyIndex]!,
        contactIds[i % contactIds.length]!,
        `${first} ${last}`,
        company.name,
        `${first.toLowerCase()}.${last.toLowerCase()}@${company.website.split(".")[0]}.example.com`,
        `+1 (${int(rand, 200, 989)}) 555-${String(int(rand, 1000, 9999))}`,
        pick(rand, SOURCES),
        status,
        int(rand, 28, 96),
        assignees[int(rand, 0, assignees.length - 1)]!,
        lastContacted,
        stale && i < 3 ? 1 : 0,
        stale && i < 3 ? "No contact in 8+ days (automation)" : null,
        stale ? "Was engaged early, went quiet after pricing conversation." : null,
        iso(shift(now, -int(rand, 30, 150))),
        iso(shift(now, -int(rand, 0, 25))),
      );
    }

    // --- deals -----------------------------------------------------------
    const dealStages = [
      "prospecting", "prospecting", "prospecting", "prospecting",
      "qualification", "qualification", "qualification", "qualification",
      "proposal", "proposal", "proposal", "proposal",
      "negotiation", "negotiation", "negotiation",
      "won", "won", "won", "won", "won",
      "lost", "lost",
    ];
    const dealIds: string[] = [];
    for (const [index, stage] of dealStages.entries()) {
      const companyIndex = index % COMPANIES.length;
      const company = COMPANIES[companyIndex]!;
      const closed = stage === "won" || stage === "lost";
      // Stalled open deals feed the "at-risk" datasets and the ops view.
      const stalled = !closed && index % 4 === 0;
      const updatedDaysAgo = closed
        ? int(rand, 3, 60)
        : stalled
          ? int(rand, 22, 45)
          : int(rand, 0, 9);
      const amount = int(rand, 18, 240) * 1000;
      const id = `${slug}-deal-${index + 1}`;
      dealIds.push(id);
      await db.prepare(
        `INSERT INTO deals (id, workspace_id, company_id, lead_id, name, stage, amount, probability,
           owner_id, expected_close_date, closed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        workspaceId,
        companyIds[companyIndex]!,
        leadIds[index % leadIds.length]!,
        `${company.name.split(" ")[0]} — ${PRODUCTS[index % PRODUCTS.length]}`,
        stage,
        amount,
        stage === "won" ? 100 : stage === "lost" ? 0 : stage === "negotiation" ? 75 : stage === "proposal" ? 55 : stage === "qualification" ? 35 : 20,
        assignees[index % assignees.length]!,
        iso(shift(now, closed ? -int(rand, 3, 60) : int(rand, 5, 95))),
        closed ? iso(shift(now, -updatedDaysAgo)) : null,
        iso(shift(now, -int(rand, 40, 180))),
        iso(shift(now, -updatedDaysAgo)),
      );
    }

    // --- tasks -----------------------------------------------------------
    const taskIds: string[] = [];
    const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);
    for (let i = 0; i < 32; i += 1) {
      const company = COMPANIES[i % COMPANIES.length]!;
      const template = TASK_TEMPLATES[i % TASK_TEMPLATES.length]!;
      const id = `${slug}-task-${i + 1}`;
      taskIds.push(id);
      const status = i % 7 === 0 ? "done" : i % 5 === 0 ? "in_progress" : "open";
      const dueOffset =
        i < 5 ? 0 : i < 11 ? -int(rand, 1, 6) : int(rand, 1, 16);
      const due = new Date(todayIso.getTime() + dueOffset * DAY);
      const relatedDeal = dealIds[i % dealIds.length]!;
      await db.prepare(
        `INSERT INTO tasks (id, workspace_id, title, notes, status, priority, due_date, assignee_id,
           related_type, related_id, created_by, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        workspaceId,
        template.replace("{company}", company.name),
        i % 3 === 0 ? "Pulled from the account plan; confirm next step with the champion." : null,
        status,
        i % 6 === 0 ? "high" : i % 3 === 0 ? "low" : "medium",
        iso(due),
        assignees[i % assignees.length]!,
        "deal",
        relatedDeal,
        ownerId,
        iso(shift(now, -int(rand, 1, 30))),
        status === "done" ? iso(shift(now, -int(rand, 0, 5))) : null,
      );
    }

    // --- activities ------------------------------------------------------
    for (let i = 0; i < 60; i += 1) {
      const template = ACTIVITY_TEMPLATES[i % ACTIVITY_TEMPLATES.length]!;
      const company = COMPANIES[i % COMPANIES.length]!;
      await db.prepare(
        `INSERT INTO activities (id, workspace_id, kind, subject, body, lead_id, deal_id, contact_id, actor_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `${slug}-act-${i + 1}`,
        workspaceId,
        template.kind,
        template.subject.replace("{company}", company.name),
        i % 4 === 0 ? "Logged automatically from the sales workflow." : null,
        leadIds[i % leadIds.length]!,
        dealIds[i % dealIds.length]!,
        contactIds[i % contactIds.length]!,
        assignees[i % assignees.length]!,
        iso(shift(now, -int(rand, 0, 29), -int(rand, 0, 20))),
      );
    }

    // --- notifications ---------------------------------------------------
    await db.prepare(
      `INSERT INTO notifications (id, workspace_id, user_id, title, body, kind, href, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${slug}-notif-1`,
      workspaceId,
      ownerId,
      "6 follow-ups need attention",
      "Leads have gone quiet for more than a week. Review the overdue follow-up list.",
      "warning",
      "/studio/crm/leads",
      null,
      iso(shift(now, -1, -3)),
    );
    await db.prepare(
      `INSERT INTO notifications (id, workspace_id, user_id, title, body, kind, href, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${slug}-notif-2`,
      workspaceId,
      ownerId,
      "Weekly pipeline digest is ready",
      "Won revenue is up week over week. Two deals moved into negotiation.",
      "info",
      "/studio",
      iso(shift(now, -2)),
      iso(shift(now, -2, -5)),
    );

    // --- workflows -------------------------------------------------------
    const staleLeadWorkflow = workflowDefinitionSchema.parse({
      schemaVersion: 1,
      name: "Stale lead follow-up",
      description:
        "When a contacted lead has had no contact for 7+ days, flag it and create a follow-up task for the owner.",
      trigger: { type: "daily_check", entity: "lead" },
      conditions: [
        { type: "days_since_contact_gte", value: 7 },
        { type: "field_equals", field: "status", value: "contacted" },
      ],
      actions: [
        { type: "flag_record", reason: "No contact in 7+ days" },
        {
          type: "create_task",
          title: "Follow up with {{name}} ({{company}})",
          priority: "high",
          dueInDays: 1,
          assignTo: "record_owner",
        },
      ],
    });
    const negotiationWorkflow = workflowDefinitionSchema.parse({
      schemaVersion: 1,
      name: "Negotiation alert",
      description: "Notify the deal owner when a deal reaches negotiation.",
      trigger: { type: "deal_stage_changed", entity: "deal" },
      conditions: [{ type: "field_equals", field: "stage", value: "negotiation" }],
      actions: [
        {
          type: "notify",
          title: "Deal reached negotiation",
          body: "{{name}} just moved into negotiation.",
        },
      ],
    });
    await db.prepare(
      `INSERT INTO workflow_definitions (id, workspace_id, name, description, enabled, definition, trigger_type, created_by, created_at, updated_at, last_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${slug}-wf-1`,
      workspaceId,
      staleLeadWorkflow.name,
      staleLeadWorkflow.description,
      1,
      JSON.stringify(staleLeadWorkflow),
      staleLeadWorkflow.trigger.type,
      ownerId,
      iso(shift(now, -14)),
      iso(shift(now, -1)),
      iso(shift(now, -1, -2)),
    );
    await db.prepare(
      `INSERT INTO workflow_definitions (id, workspace_id, name, description, enabled, definition, trigger_type, created_by, created_at, updated_at, last_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${slug}-wf-2`,
      workspaceId,
      negotiationWorkflow.name,
      negotiationWorkflow.description,
      0,
      JSON.stringify(negotiationWorkflow),
      negotiationWorkflow.trigger.type,
      ownerId,
      iso(shift(now, -10)),
      iso(shift(now, -10)),
      null,
    );
    // Seeded history so the automation panel is not empty on first load.
    await db.prepare(
      `INSERT INTO workflow_runs (id, workspace_id, workflow_id, trigger_type, status, matched, actions, log, dedupe_key, error, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${slug}-run-1`,
      workspaceId,
      `${slug}-wf-1`,
      "daily_check",
      "success",
      6,
      JSON.stringify({ flagged: 3, tasksCreated: 3, notifications: 0 }),
      JSON.stringify(
        leadIds.slice(0, 6).map((leadId, index) => ({
          recordId: leadId,
          recordLabel: `${slug}-lead-${index + 1}`,
          actions: ["flag_record", "create_task"],
        })),
      ),
      `seed:${slug}:run-1`,
      null,
      38,
      iso(shift(now, -1, -2)),
    );

    // --- interfaces ------------------------------------------------------
    const personalInterfaceId = `${slug}-iface-personal`;
    const baselineInterfaceId = `${slug}-iface-baseline`;
    const demoInterfaceId = `${slug}-iface-demo`;
    const classic = classicCrmConfig();
    const personal = rolePresetConfig(options.jobRole);
    const insertInterface = db.prepare(
      `INSERT INTO interfaces (id, workspace_id, name, slug, kind, owner_id, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertInterface.run(
      baselineInterfaceId,
      workspaceId,
      classic.name,
      "classic-crm",
      "baseline",
      null,
      1,
      iso(shift(now, -120)),
      iso(shift(now, -120)),
    );
    insertInterface.run(
      demoInterfaceId,
      workspaceId,
      "Demo interface",
      "demo-interface",
      "demo",
      null,
      0,
      iso(shift(now, -120)),
      iso(shift(now, -120)),
    );
    insertInterface.run(
      personalInterfaceId,
      workspaceId,
      personal.name,
      "personal",
      "personal",
      ownerId,
      0,
      iso(shift(now, -30)),
      iso(shift(now, -1)),
    );
    const insertVersion = db.prepare(
      `INSERT INTO interface_versions (id, interface_id, workspace_id, version, config, summary, source, created_by, is_current, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertVersion.run(
      `${baselineInterfaceId}-v1`,
      baselineInterfaceId,
      workspaceId,
      1,
      JSON.stringify(classic),
      "Classic CRM baseline — the one-size-fits-all starting point.",
      "seed",
      null,
      1,
      iso(shift(now, -120)),
    );
    insertVersion.run(
      `${demoInterfaceId}-v1`,
      demoInterfaceId,
      workspaceId,
      1,
      JSON.stringify(classic),
      "Baseline captured for before/after comparison.",
      "seed",
      null,
      1,
      iso(shift(now, -120)),
    );
    insertVersion.run(
      `${personalInterfaceId}-v1`,
      personalInterfaceId,
      workspaceId,
      1,
      JSON.stringify(personal),
      `Starting layout for ${options.jobRole.replace("_", " ")}.`,
      "template",
      ownerId,
      1,
      iso(shift(now, -30)),
    );

    // --- preferences -----------------------------------------------------
    const goals: Record<JobRole, string[]> = {
      sales_manager: ["Grow pipeline coverage", "Protect revenue forecast", "Coach follow-up discipline"],
      sales_rep: ["Hit my monthly number", "Never miss a follow-up", "Keep tasks under control"],
      ops_manager: ["Reduce bottlenecks", "Balance team workload", "Keep process clean"],
      general: ["See what matters", "Reduce clutter"],
    };
    await db.prepare(
      `INSERT INTO user_preferences (user_id, workspace_id, job_role, primary_goals, density, preferred_metrics, accessibility, active_interface_id, onboarding_complete, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ownerId,
      workspaceId,
      options.jobRole,
      JSON.stringify(goals[options.jobRole]),
      personal.layout.density,
      JSON.stringify(["pipeline_value", "won_revenue"]),
      JSON.stringify({}),
      personalInterfaceId,
      options.onboardingComplete ? 1 : 0,
      iso(shift(now, -30)),
      iso(shift(now, -1)),
    );

    return {
      workspaceId,
      personalInterfaceId,
      baselineInterfaceId,
      demoInterfaceId,
      leadCount: leadIds.length,
      dealCount: dealIds.length,
      taskCount: taskIds.length,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Demo account                                                               */
/* -------------------------------------------------------------------------- */

export const DEMO_EMAIL = "demo@morph.app";
export const DEMO_NAME = "Maya Chen";

export async function seedDemoWorkspace(
  db: Db,
  options: { now?: Date; password?: string } = {},
): Promise<ProvisionResult> {
  const now = options.now ?? new Date();
  const password = options.password ?? process.env.MORPH_DEMO_PASSWORD ?? "morph-demo";
  const workspaceId = "ws_demo_acme";
  const ownerId = "user_demo_maya";

  await db.prepare(
    `INSERT INTO users (id, email, name, password_hash, avatar_color, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash`,
  ).run(ownerId, DEMO_EMAIL, DEMO_NAME, hashPassword(password), "violet", iso(shift(now, -120)));

  const owner = await db.prepare("SELECT id FROM users WHERE email = ?").get(DEMO_EMAIL) as { id: string };

  return provisionWorkspace(db, {
    workspaceId,
    workspaceName: WORKSPACE_NAME,
    slug: WORKSPACE_SLUG,
    owner: { id: owner.id, name: DEMO_NAME, email: DEMO_EMAIL },
    jobRole: "sales_manager",
    now,
    seed: 20_261_022,
    onboardingComplete: true,
    teammates: [
      { id: "user_demo_daniel", name: "Daniel Ruiz", email: "daniel@acme-morph.example.com", jobRole: "sales_rep" },
      { id: "user_demo_priya", name: "Priya Nair", email: "priya@acme-morph.example.com", jobRole: "sales_rep" },
      { id: "user_demo_alex", name: "Alex Kim", email: "alex@acme-morph.example.com", jobRole: "ops_manager" },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Signup provisioning                                                        */
/* -------------------------------------------------------------------------- */

const TEAMMATES = [
  { name: "Daniel Ruiz", jobRole: "sales_rep" as JobRole },
  { name: "Priya Nair", jobRole: "sales_rep" as JobRole },
  { name: "Alex Kim", jobRole: "ops_manager" as JobRole },
];

export async function provisionWorkspaceForUser(
  db: Db,
  user: { id: string; name: string; email: string; jobRole: JobRole },
  options: { now?: Date } = {},
): Promise<ProvisionResult> {
  const now = options.now ?? new Date();
  const workspaceId = `ws_${user.id.slice(0, 8)}`;
  const slug = `ws-${user.id.slice(0, 8)}`;
  const firstName = user.name.split(" ")[0] ?? "Your";
  return provisionWorkspace(db, {
    workspaceId,
    workspaceName: `${firstName}'s workspace`,
    slug,
    owner: { id: user.id, name: user.name, email: user.email },
    jobRole: user.jobRole,
    now,
    seed: 20_261_022 + user.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0),
    onboardingComplete: false,
    teammates: TEAMMATES.map((team, index) => ({
      id: `${slug}-user-${index + 1}`,
      name: team.name,
      email: `${team.name.toLowerCase().replace(/[^a-z]+/g, ".")}@${slug}.example.com`,
      jobRole: team.jobRole,
    })),
  });
}

/**
 * Database migrations.
 *
 * Morph ships with a local SQLite database so the whole product runs with zero
 * external services (`npm run dev` is enough). Every statement below is also
 * mirrored for Postgres/Supabase in `supabase/migrations/0001_init.sql`, which
 * adds row-level security policies for the hosted deployment path.
 *
 * Migrations are append-only: never edit an applied migration, add a new one.
 */

export type Migration = { id: string; sql: string };

export const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: /* sql */ `
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color  TEXT NOT NULL DEFAULT 'violet',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS workspaces (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role         TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
      job_role     TEXT NOT NULL DEFAULT 'general',
      created_at   TEXT NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      job_role             TEXT NOT NULL DEFAULT 'general',
      primary_goals        TEXT NOT NULL DEFAULT '[]',
      density              TEXT NOT NULL DEFAULT 'comfortable',
      preferred_metrics    TEXT NOT NULL DEFAULT '[]',
      accessibility        TEXT NOT NULL DEFAULT '{}',
      active_interface_id  TEXT,
      onboarding_complete  INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL,
      PRIMARY KEY (user_id, workspace_id)
    );

    CREATE TABLE IF NOT EXISTS interfaces (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      slug         TEXT NOT NULL,
      kind         TEXT NOT NULL CHECK (kind IN ('personal','baseline','demo','template')),
      owner_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      is_default   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      UNIQUE (workspace_id, slug)
    );
    CREATE INDEX IF NOT EXISTS idx_interfaces_workspace ON interfaces(workspace_id);

    CREATE TABLE IF NOT EXISTS interface_versions (
      id           TEXT PRIMARY KEY,
      interface_id TEXT NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      version      INTEGER NOT NULL,
      config       TEXT NOT NULL,
      summary      TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL CHECK (source IN ('seed','ai','local-planner','manual','restore','undo','demo','template')),
      created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_current   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      UNIQUE (interface_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_versions_interface ON interface_versions(interface_id, version DESC);

    CREATE TABLE IF NOT EXISTS transformation_requests (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      interface_id  TEXT NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prompt        TEXT NOT NULL,
      engine        TEXT NOT NULL,
      model         TEXT,
      status        TEXT NOT NULL CHECK (status IN ('proposed','applied','discarded','rejected','failed','needs_review')),
      intent        TEXT,
      operations    TEXT,
      result_config TEXT,
      explanation   TEXT,
      warnings      TEXT NOT NULL DEFAULT '[]',
      error         TEXT,
      latency_ms    INTEGER NOT NULL DEFAULT 0,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      applied_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_requests_interface ON transformation_requests(interface_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_user ON transformation_requests(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS companies (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      industry     TEXT NOT NULL,
      size         TEXT NOT NULL,
      city         TEXT,
      website      TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);

    CREATE TABLE IF NOT EXISTS contacts (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      company_id   TEXT REFERENCES companies(id) ON DELETE SET NULL,
      first_name   TEXT NOT NULL,
      last_name    TEXT NOT NULL,
      email        TEXT NOT NULL,
      phone        TEXT,
      title        TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON contacts(workspace_id);

    CREATE TABLE IF NOT EXISTS leads (
      id                TEXT PRIMARY KEY,
      workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      company_id        TEXT REFERENCES companies(id) ON DELETE SET NULL,
      contact_id        TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      name              TEXT NOT NULL,
      company           TEXT NOT NULL,
      email             TEXT,
      phone             TEXT,
      source            TEXT NOT NULL DEFAULT 'inbound',
      status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','unqualified','converted')),
      score             INTEGER NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
      owner_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
      last_contacted_at TEXT,
      flagged           INTEGER NOT NULL DEFAULT 0,
      flag_reason       TEXT,
      notes             TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leads_workspace ON leads(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(workspace_id, owner_id);
    CREATE INDEX IF NOT EXISTS idx_leads_contacted ON leads(workspace_id, last_contacted_at);

    CREATE TABLE IF NOT EXISTS deals (
      id                  TEXT PRIMARY KEY,
      workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      company_id          TEXT REFERENCES companies(id) ON DELETE SET NULL,
      lead_id             TEXT REFERENCES leads(id) ON DELETE SET NULL,
      name                TEXT NOT NULL,
      stage               TEXT NOT NULL DEFAULT 'prospecting'
                          CHECK (stage IN ('prospecting','qualification','proposal','negotiation','won','lost')),
      amount              REAL NOT NULL DEFAULT 0,
      probability         INTEGER NOT NULL DEFAULT 25 CHECK (probability BETWEEN 0 AND 100),
      owner_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
      expected_close_date TEXT,
      closed_at           TEXT,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deals_workspace ON deals(workspace_id, stage);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(workspace_id, owner_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      notes        TEXT,
      status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
      priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
      due_date     TEXT,
      assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
      related_type TEXT CHECK (related_type IN ('lead','deal','company','none')),
      related_id   TEXT,
      created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at   TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(workspace_id, assignee_id, status);

    CREATE TABLE IF NOT EXISTS activities (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL CHECK (kind IN ('call','email','meeting','note','task','stage_change','workflow','system')),
      subject      TEXT NOT NULL,
      body         TEXT,
      lead_id      TEXT REFERENCES leads(id) ON DELETE SET NULL,
      deal_id      TEXT REFERENCES deals(id) ON DELETE SET NULL,
      contact_id   TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      actor_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activities_workspace ON activities(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_definitions (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      enabled      INTEGER NOT NULL DEFAULT 0,
      definition   TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      last_run_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflow_definitions(workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_unique_name
      ON workflow_definitions(workspace_id, lower(name));

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      workflow_id  TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
      trigger_type TEXT NOT NULL,
      status       TEXT NOT NULL CHECK (status IN ('success','partial','failed','skipped')),
      matched      INTEGER NOT NULL DEFAULT 0,
      actions      TEXT NOT NULL DEFAULT '[]',
      log          TEXT NOT NULL DEFAULT '[]',
      dedupe_key   TEXT,
      error        TEXT,
      duration_ms  INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_workflow ON workflow_runs(workflow_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_workspace ON workflow_runs(workspace_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_dedupe ON workflow_runs(workflow_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS notifications (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      body         TEXT NOT NULL DEFAULT '',
      kind         TEXT NOT NULL DEFAULT 'info',
      href         TEXT,
      read_at      TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_usage (
      id                TEXT PRIMARY KEY,
      workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      engine            TEXT NOT NULL,
      model             TEXT,
      prompt_tokens     INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms        INTEGER NOT NULL DEFAULT 0,
      ok                INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace ON ai_usage(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS demo_runs (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      scenario     TEXT NOT NULL,
      engine       TEXT NOT NULL,
      status       TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    `,
  },
  {
    id: "0002_transformation_results",
    sql: /* sql */ `
    -- Store the complete validated engine result (operations, assumptions,
    -- workflow draft) alongside the resolved preview configuration.
    ALTER TABLE transformation_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'config';
    ALTER TABLE transformation_requests ADD COLUMN result TEXT;

    -- Personalization suggestions the user has explicitly rejected.
    ALTER TABLE user_preferences ADD COLUMN dismissed_suggestions TEXT NOT NULL DEFAULT '[]';

    CREATE INDEX IF NOT EXISTS idx_requests_status
      ON transformation_requests(workspace_id, status, created_at DESC);
    `,
  },
];

export const LATEST_MIGRATION = migrations[migrations.length - 1]!.id;

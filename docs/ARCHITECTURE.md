# Architecture

Morph is a Next.js 15 (App Router) application with a server-only data layer, a
schema-driven renderer, and a transformation pipeline that turns natural language into
validated schema operations. This document explains the layers, the invariants that hold
them together, and the trade-offs behind them.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                  │
│  StudioWorkspace · MorphCanvas (schema renderer) · AiPanel · WorkflowConsole
└───────────────▲──────────────────────────────────────────┬───────────────┘
                │ RSC payload / server-action results      │ server actions
┌───────────────┴──────────────────────────────────────────▼───────────────┐
│ Next.js server                                                           │
│  app/studio/**  (server components: read + authorize)                    │
│  lib/actions/*  (server actions: validate + mutate + revalidate)         │
│  lib/morph/*    (planner, provider, patch, validation, versions)         │
│  lib/workflows/*(schema + execution engine)                              │
│  lib/crm/*      (dataset resolvers, metric resolvers, mutations)         │
│  lib/auth/*     (sessions, password hashing, workspace context)          │
│  lib/db/*       (libSQL adapter, migrations, seed)                       │
└──────────────────────────────────────────┬───────────────────────────────┘
                    ┌──────────────────────┴──────────────────────┐
            local dev: file:./data/morph.db        production: Turso (libsql://)
```

## 1. Layers and why they exist

**`lib/db`** owns the connection, the migration runner and the seed. Migrations are
plain SQL strings in `migrations.ts`, applied in order and recorded in `_migrations`;
`applyMigrations` is idempotent, so both the CLI and the server can call it. The database
handle is cached on `globalThis` so hot reloads in development do not open a new
connection per render.

**`lib/crm`** is the only place that knows SQL for CRM entities. `data.ts` exposes
dataset resolvers (`leads`, `my_leads`, `deals_by_stage`, `overdue_followups`,
`workload_by_owner`, …) and metric resolvers (`pipeline_value`, `overdue_followups`,
`team_workload`, …). Every resolver takes a `scope: { workspaceId, userId }` and adds
`WHERE workspace_id = ?` itself — a caller cannot forget the predicate, because the
function will not run without a scope object.

**`lib/morph`** is the interface engine: the Zod registry of allowed components and
datasets (`config.ts`), the operation/patch applier (`patch.ts`), the deterministic
planner (`planner.ts`), the model provider (`provider.ts` + `prompt.ts`), the result
contract (`result.ts`), the pipeline that ties them together (`engine.ts`), version
storage (`interfaces.ts`) and preset interfaces (`presets.ts`).

**`lib/workflows`** holds the workflow definition schema (triggers, conditions, actions)
and the execution engine that evaluates conditions against live rows and performs
permitted writes.

**`components/studio`** renders a `MorphConfig` — never a hard-coded dashboard. The
renderer (`canvas.tsx` + `widgets.tsx`) is a map from component `type` to React
component, so adding a widget type means adding a schema variant and one renderer entry.

## 2. Data model

Nineteen tables, created by migrations in this order:

| Table | Notes |
| --- | --- |
| `users` | Email (unique, lower-cased), scrypt password hash, display name |
| `sessions` | Opaque token, `expires_at`, cascades on user delete |
| `workspaces` | Owner, name, slug; `workspace_id` is the tenant key everywhere else |
| `workspace_members` | `(workspace_id, user_id)` primary key, role `owner` / `admin` / `member` |
| `user_preferences` | Per user **and** workspace: role, goals (JSON), accessibility, active interface |
| `interfaces` | A named, workspace-owned interface; `is_active` marks the one on screen |
| `interface_versions` | Immutable `config` JSON snapshots, `version_number` per interface, `restored_from` |
| `transformation_requests` | Prompt, engine, status (`proposed`/`applied`/`discarded`/`failed`), result JSON, tokens, latency |
| `companies`, `contacts` | Reference data, workspace-scoped |
| `leads`, `deals`, `tasks` | CRM records with FKs to company/owner; `deals.lead_id`, `tasks.related_id` |
| `activities` | Append-only touch log; updates `leads.last_contacted_at` through the mutation layer |
| `workflow_definitions` | `definition` JSON validated by `workflowDefinitionSchema`, `enabled` flag |
| `workflow_runs` | One row per execution: trigger, matched count, action counts, status |
| `notifications` | In-app, workspace + user scoped, `read_at` |
| `ai_usage` | Per-request token/latency ledger, used for the usage panel and quota |
| `demo_runs` | Records which demo scenarios have been generated, so reset is meaningful |

Invariants enforced in the schema (not just in code):

- Every workspace-owned table has `workspace_id ... ON DELETE CASCADE` and an index
  leading with `workspace_id` (`(workspace_id, status)`, `(workspace_id, owner_id)`, …).
- `interface_versions` is unique on `(interface_id, version_number)`; the active version
  pointer lives on `interfaces.active_version_id`.
- `workflow_definitions` is unique on `(workspace_id, name)` — duplicate workflows are
  rejected by the database, not only by the UI.
- `sessions.token` is unique; `users.email` is unique case-insensitively (`email` is
  stored lower-cased).
- Enum-like columns carry `CHECK` constraints (`status IN (...)`, `stage IN (...)`,
  `priority IN (...)`).

## 3. Authentication and authorization

- Passwords are hashed with Node's `scrypt` (`lib/auth/password.ts`) with a per-user salt,
  compared in constant time.
- Sessions are random 32-byte tokens in an `HttpOnly`, `SameSite=Lax`, `Secure`-in-
  production cookie. The database stores the token, the user and an expiry; the cookie
  never contains user data.
- `getWorkspaceContext()` is the single authorization choke point: it resolves the user,
  their membership, their preferences and their active workspace. Server components call
  it before reading; server actions call it before writing.
- Every mutating action re-derives `workspaceId` from the session — never from the
  request body — and passes it to the data layer, which scopes the query. A record id
  from another workspace therefore resolves to "not found", not to a leaked row.
- Actions validate their input with Zod before touching SQL, and return
  `{ ok, error }` rather than throwing raw database errors to the client.
- `MORPH_ALLOW_SIGNUP=false` closes public registration while leaving the demo login
  working, which is what a shared demo deployment wants.

## 4. The transformation pipeline

```
prompt ──▶ engine.proposeTransformation
             1. authorize (session + workspace + membership)
             2. rate limit (per user, per minute)
             3. provider available?  ── no ──▶ local planner
                    │ yes
                    ▼
             4. call model with system prompt + schema context
             5. validate JSON against morphResultSchema
                └─ invalid ──▶ one repair turn ──▶ validate again
             6. apply operations to a *copy* of the active config (patch.ts)
             7. validate the resulting config; collect issues + diff summary
             8. persist transformation_requests row (status=proposed)
             9. return proposal DTO (never writes interface state)
```

Nothing is written to the interface until the user applies the proposal:

```
applyTransformation
  1. re-authorize, load the pending request (must belong to this workspace/user)
  2. re-apply + re-validate the stored operations (never trust stored JSON blindly)
  3. insert a new interface_versions row with version_number = max + 1
  4. point interfaces.active_version_id at it
  5. mark the request applied, write an activity + notification
  6. revalidatePath('/studio')
```

Undo is not destructive: it restores the *previous* version by creating a new version
that copies it, so history is append-only and auditable.

The operation set is deliberately small (`add_component`, `remove_component`,
`update_component`, `move_component`, `replace_group`, `set_layout`, `set_header`,
`set_navigation`, `set_accessibility`, `set_meta`). Each is applied by `patch.ts` and the
result is re-parsed by `morphConfigSchema`, so an operation that produces an invalid
config fails validation instead of rendering something broken.

See [AI-SCHEMA.md](AI-SCHEMA.md) for the exact contract.

## 5. Workflow engine

Definitions are validated by `workflowDefinitionSchema` (Zod discriminated unions for
conditions and actions) and stored as JSON. The engine:

1. selects enabled workflows matching the trigger;
2. evaluates every condition against each candidate row (recency, thresholds, stage,
   ownership, overdue tasks, flags);
3. runs the permitted actions — `create_task`, `update_field`, `flag_record`, `notify` —
   through the same mutation helpers the UI uses;
4. records a `workflow_runs` row with counts, and emits a structured log line.

Triggers fire from the CRM mutation layer (`record_created`, `record_updated`,
`deal_stage_changed`) and from an explicit daily check (`/api/workflows/run`,
`npm run workflows:run`, or the "Run now" button). The engine keeps a guard against
recursive triggering (depth limit) and deduplicates actions per run so a repeated daily
check does not create the same follow-up task twice.

Workflows cannot do anything outside the action allowlist: there is no SQL escape hatch,
no email sending, and no arbitrary HTTP. That is a product boundary, enforced in the
schema.

## 6. Rendering and performance

- The canvas is a server-rendered `MorphConfig`; interactive islands (panel, dnd, boards,
  tables, dialogs) are client components. `MorphCanvas` memoises each component so a
  reorder or preview toggle does not re-render untouched widgets.
- Charts are lazy: `chart-widget.tsx` is loaded with `next/dynamic` behind a skeleton, so
  Recharts stays out of the initial bundle.
- The AI panel keeps its own local state (prompt, streaming-stage indicator, history) so
  typing does not re-render the canvas.
- Data access is memoised per request by the server component cache; the metric row for the
  header is computed once in the layout and shared with `StudioSidebar` badges.
- `next/navigation` `revalidatePath` after a mutation is the refresh boundary — no global
  store, no polling.
- Loading states: route-level `loading.tsx`, chart skeletons, dialog/section skeletons,
  and an explicit `error.tsx` boundary.

No benchmark numbers are claimed here: the app was profiled interactively during
development (React DevTools highlight updates, Lighthouse for first paint), but no formal
measurement harness is part of the repository, so no figures are presented.

## 7. Testing strategy

| Layer | Tool | What it proves |
| --- | --- | --- |
| Schema + patch | Vitest | Every preset validates, every operation round-trips, invalid ops are rejected |
| Planner | Vitest | Intent detection, determinism, simplification, accessibility, safety refusals |
| Engine | Vitest | Fixture model responses accepted, invalid ones rejected after one repair, proposals are not applied until apply is called |
| CRM + isolation | Vitest | CRUD through the real data layer + a second workspace cannot read or mutate the first's rows |
| Workflows | Vitest | Conditions, actions, dedupe, duplicate-name rejection, authorization |
| Renderer | Vitest + Testing Library | Every component type in the registry renders with real-shaped data |
| End-to-end | Playwright | Auth, onboarding, transform → preview → apply → undo, CRM persistence across reload, workflow run, demo reset, version restore, mobile layout |

Fixtures are deterministic: `tests/helpers.ts` builds an in-memory database with the same
seed code as production, and model responses are recorded JSON, not live calls. The one
live call that exists is the opt-in provider smoke test.

## 8. Trade-offs

- **SQLite over Postgres, through libSQL.** Zero-config demo, single-file backup,
  trivially reproducible seed — and the same SQL runs on Turso, which is what allows a
  serverless host with an ephemeral filesystem. The cost is one writer and an HTTP round
  trip per statement in production; the data layer is isolated so a Postgres swap stays
  mechanical. The adapter (`src/lib/db`) is promise-based, so the whole read path is
  `await`ed rather than sync.
- **Server actions over a REST API.** Fewer moving parts and no client-side token
  handling; the cost is no third-party API surface. `/api/workflows/run` exists because a
  cron needs a URL.
- **Schema registry over free-form UI generation.** The model cannot invent a widget, so
  it cannot produce a broken or meaningless interface. The cost is expressive range, which
  is exactly the trade-off a credible demo should make.
- **Deterministic local planner.** Guarantees the demo works offline and in CI; it is
  labelled in the UI so it never impersonates a model.

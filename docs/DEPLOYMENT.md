# Deployment

Morph is one Next.js server. Storage is SQLite, reached through **libSQL**, so the same
code runs against a file locally and against [Turso](https://turso.tech) in production —
which is what makes a serverless host like Vercel viable.

## 0. What was actually verified

Be precise about this when you present the project:

- Verified in this repository: `npm run typecheck`, `npm test` (73 passing, 1 skipped
  provider smoke test, which needs a real key), `npm run test:e2e` (9 desktop + 1 mobile
  passing) against a real Next.js dev server, `npm run build`, a production `next start`
  smoke test (`/api/health` returns `libsql-file` with four seeded users), and the CLI
  scripts `db:migrate`, `db:seed`, `db:reset`, `workflows:run`.
- **Not** verified here: a live Vercel deployment, a live Turso database, or a real Groq
  completion. No hosting, database or model account is attached to this workspace, so no
  deployment URL is claimed. The hosted path is covered only at configuration level
  (`tests/deployment.test.ts` checks URL selection and the Vercel guard); the first real
  request against Turso happens on your deployment.

## 1. Environment variables

Copy `.env.example` to `.env.local` (local) or set them in your host's dashboard.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `TURSO_DATABASE_URL` | **yes on Vercel** | unset | `libsql://…` URL; falls back to a local file when absent |
| `TURSO_AUTH_TOKEN` | **yes with Turso** | unset | Server-only token |
| `MORPH_DB_PATH` | no | `./data/morph.db` | Local file when no Turso URL is set |
| `MORPH_ALLOW_SIGNUP` | no | `true` | Set `false` on a shared demo; the demo login still works |
| `MORPH_DEMO_PASSWORD` | no | `morph-demo` | Password for `demo@morph.app` |
| `MORPH_CRON_SECRET` | no | unset | When set, the workflow route requires `Authorization: Bearer <secret>`. Vercel's own `CRON_SECRET` name is also accepted |
| `GROQ_API_KEY` | no | unset | Groq key; used when no OpenAI key is present |
| `OPENAI_API_KEY` | no | unset | Wins over Groq when both are set |
| `MORPH_AI_PROVIDER` | no | auto | `groq` or `openai`, to force one while both keys exist |
| `MORPH_AI_MODEL` | no | provider default | Groq `openai/gpt-oss-120b`, OpenAI `gpt-4o-mini` |
| `MORPH_AI_BASE_URL` | no | provider default | Any OpenAI-compatible endpoint |

There is no session-signing secret to generate: a login stores a random 256-bit token in
an `httpOnly` cookie and only its SHA-256 hash in the database.

Nothing secret reaches the browser: provider keys are read only in
`src/lib/morph/provider.ts`, the database URL/token only in `src/lib/db/index.ts`, both
imported exclusively by server code. There is no `NEXT_PUBLIC_` variant of any secret.

## 2. Vercel + Turso (recommended)

### 2.1 Create the database

```bash
curl -sSfL https://get.tur.so/install.sh | bash   # or: brew install tursodatabase/tap/turso
turso auth signup
turso db create morph
turso db show morph --url
turso db tokens create morph
```

### 2.2 Import the project

At <https://vercel.com/new>, pick the repository. Vercel detects Next.js; leave the build
command (`next build`) and output directory alone. Node 20+ is fine.

`vercel.json` in the repo adds:

- a daily cron (`0 7 * * *`) hitting `/api/workflows/run` — Vercel Cron issues a **GET**,
  and the route handles both GET and POST for that reason;
- `maxDuration: 60` for the workflow route, because each statement is an HTTP round trip
  to Turso and several workflows can run in one invocation.

### 2.3 Set environment variables

Project → Settings → Environment Variables (Production **and** Preview):

```
TURSO_DATABASE_URL   libsql://morph-<org>.turso.io
TURSO_AUTH_TOKEN     <token>
MORPH_CRON_SECRET    <a long random string>
GROQ_API_KEY         gsk_...
```

Then deploy. On the first request Morph applies migrations and, if the `users` table is
empty, seeds the demo workspace. If you would rather not depend on that first request,
run the same steps from your machine against the hosted database:

```bash
TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run db:migrate
TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run db:seed
```

### 2.4 Verify the deployment

```bash
curl -s https://<your-app>.vercel.app/api/health
# {"status":"ok","database":"libsql-remote","users":4,"provider":"groq",...}
```

`"database":"libsql-remote"` means Turso is wired up; `"provider":"groq"` means the model
key was picked up. Then sign in with `demo@morph.app` / `MORPH_DEMO_PASSWORD` and apply one
transformation.

### 2.5 Cron

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when a `CRON_SECRET`
variable exists. Morph accepts either `CRON_SECRET` or `MORPH_CRON_SECRET`. Without a
secret, the route falls back to session auth and only runs the caller's own workspaces —
a scheduler would get a 401.

## 3. Switching from Groq to OpenAI

No code change, no redeploy:

1. Add `OPENAI_API_KEY` in the Vercel dashboard.
2. Optionally set `MORPH_AI_MODEL=gpt-4o-mini` (or another chat-completions model).
3. Redeploy. Vercel snapshots environment variables into each deployment, so existing
   deployments do not see a newly added key — the redeploy is part of the switch.

OpenAI takes priority once its key exists. To keep running on Groq while both keys are
configured, set `MORPH_AI_PROVIDER=groq`. Remove both keys and Morph silently returns to
the deterministic local planner (and says so in the UI).

## 4. Self-hosting (Docker or a VPS)

A local file is the simplest deployment when you control the machine. `npm run build &&
npm start` with `MORPH_DB_PATH` on a persistent volume is enough; no Turso account needed.

```dockerfile
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

Run it with the database on a volume:

```bash
docker build -t morph .
docker run -p 3000:3000 -v morph-data:/app/data \
  -e MORPH_DB_PATH=/app/data/morph.db \
  -e GROQ_API_KEY=... \
  morph
```

The first request creates the schema and seeds the demo workspace.

## 5. Scaling past one database

libSQL/Turso handles replicas and read scaling, but there is still a single writer. Two
honest options when that becomes the bottleneck:

1. **Fewer round trips.** Batch the write paths in `src/lib/crm/mutations.ts` and the
   workflow engine into `db.batch([...], "write")` calls. The adapter in `src/lib/db`
   already exposes transactions; this is a contained optimisation.
2. **Postgres.** The data access layer is deliberately isolated: `src/lib/db` (adapter,
   migrations, seed) and `src/lib/crm/data.ts` (queries). Moving to Postgres means
   rewriting those SQL strings (placeholders, types) and the migrations — the UI, actions
   and planner do not change. Not implemented.

In-process rate limiting (`src/lib/rate-limit.ts`) also assumes a single instance; a
multi-instance deployment needs a shared store.

## 6. Security checklist

- [ ] `MORPH_ALLOW_SIGNUP=false` if the demo is public and you do not want strangers
      creating workspaces.
- [ ] `TURSO_AUTH_TOKEN`, `GROQ_API_KEY` / `OPENAI_API_KEY`, `MORPH_CRON_SECRET` are set
      as server-side secrets, never committed.
- [ ] `/api/health` returns `libsql-remote`, not a local file, on a serverless host.
- [ ] Cookies are `httpOnly`, `sameSite=lax`, and `secure` in production.
- [ ] Every mutation re-checks workspace membership server-side; the IDs in a form post
      are never trusted (see `src/lib/crm/mutations.ts`).

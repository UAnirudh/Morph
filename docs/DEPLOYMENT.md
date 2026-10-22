# Deployment

Morph is one Next.js server plus a SQLite file. Anything that can run `npm start` with a
persistent disk can host it.

## 0. What was actually verified

Be precise about this when you present the project:

- Verified in this repository: `npm run typecheck`, `npm test` (61 passing, 1 skipped
  provider smoke test), `npm run test:e2e` (9 desktop + 1 mobile passing) against a real
  Next.js dev server, and the CLI scripts `db:migrate`, `db:seed`, `db:reset`,
  `workflows:run`.
- **Not** verified here: a production deployment to a specific provider. There is no
  hosting account attached to this workspace, so no deployment URL is claimed. The steps
  below are the intended path, and the Dockerfile builds the same artifact the tests ran
  against.

## 1. Environment variables

Copy `.env.example` to `.env.local` (local) or set them in your host's dashboard.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MORPH_DB_PATH` | no | `./data/morph.db` | Absolute path on a persistent volume in production |
| `MORPH_SESSION_SECRET` | **yes in production** | dev default | Long random string; rotating it signs everyone out |
| `MORPH_ALLOW_SIGNUP` | no | `true` | Set `false` on a shared demo; the demo login still works |
| `MORPH_DEMO_PASSWORD` | no | `morph-demo` | Password for `demo@morph.app` |
| `MORPH_CRON_SECRET` | no | unset | When set, `/api/workflows/run` requires `Authorization: Bearer <secret>`; signed-in users can then only run their own workspaces |
| `OPENAI_API_KEY` | no | unset | Without it Morph uses the deterministic local planner |
| `MORPH_AI_MODEL` | no | `gpt-4o-mini` | Any chat-completions model |
| `MORPH_AI_BASE_URL` | no | `https://api.openai.com/v1` | Azure / OpenRouter / vLLM / Ollama |

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Never expose the key or the service credentials to the browser: `OPENAI_API_KEY` is read
only in `src/lib/morph/provider.ts`, which is imported exclusively by server code. There
is no `NEXT_PUBLIC_` variant of any secret in this project.

## 2. Local production build

```bash
npm ci
npm run build
MORPH_DB_PATH=/var/lib/morph/morph.db MORPH_SESSION_SECRET=... npm start
# http://localhost:3000/api/health -> {"status":"ok",...}
```

The first request runs migrations and seeds the demo workspace if the database is empty,
so a fresh volume boots into a usable demo.

## 3. Docker

A minimal multi-stage build:

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
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
RUN mkdir -p /data
ENV MORPH_DB_PATH=/data/morph.db
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
```

`better-sqlite3` is a native module: the build and run stages must share the same libc
(both Debian here). The volume at `/data` holds the database plus its `-wal`/`-shm` files.

## 4. Hosting options

| Option | Fit | Notes |
| --- | --- | --- |
| **A VM / Fly.io / Railway / Render with a volume** | Best fit today | Long-lived Node process + persistent disk; SQLite works as designed |
| **Docker on any container host with a volume** | Good | Same as above |
| **Vercel / Cloud Run (stateless)** | Needs the Postgres port | Their filesystems are ephemeral; SQLite would reset on every cold start |
| **Supabase (Postgres + Auth)** | The documented scale-out path | See §6 |

### Health probe

`GET /api/health` returns `200` with
`{ status, database, users, engine, promptVersion, time }` when the database answers, and
`500` with `{ status: "error", message }` when it does not. Point your platform's health
check at it.

## 5. Scheduled workflows

Daily-check workflows need a daily trigger:

```bash
# any scheduler: cron, GitHub Actions, Fly machines, Cloud Scheduler
curl -fsS -X POST https://your-host/api/workflows/run \
  -H "Authorization: Bearer $MORPH_CRON_SECRET"
```

or, on the box itself:

```bash
0 7 * * * cd /srv/morph && /usr/bin/npm run workflows:run >> /var/log/morph-workflows.log 2>&1
```

With `MORPH_CRON_SECRET` set, the route only accepts that bearer token and runs every
workspace's enabled daily checks (that is what a scheduler is for). Without the secret it
falls back to a signed-in session, and then it only runs workspaces that user is a member
of. Each run is rate limited to 6 per minute.

## 6. Scaling past one node (documented path, not implemented)

SQLite allows one writer. To run multiple instances:

1. Replace `src/lib/db/index.ts` with a Postgres pool (the interface is small:
   `prepare(sql).get/all/run` is used throughout, so the call sites need a query helper).
2. Port the schema in `src/lib/db/migrations.ts` — the DDL is conventional; replace
   `TEXT` timestamps with `timestamptz` and `INTEGER` booleans with `boolean`.
3. Turn on row-level security and set `app.workspace_id` per connection so the database
   itself enforces tenancy — the queries already carry `workspace_id`, so RLS is a
   belt-and-braces layer rather than a rewrite.
4. Move sessions to a shared store (they already live in a table, so this is free).
5. Replace the in-process rate limiter (`src/lib/rate-limit.ts`) with Redis/Upstash behind
   the same `rateLimit(key, { limit, windowMs })` signature.
6. Serve the OpenNext/Workers build if you are deploying to Cloudflare, or keep the Node
   server on Cloud Run.

`DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are already
present (commented) in `.env.example` so the migration has a place to land. The service
role key must never be referenced from client components.

## 7. Security checklist before you share a URL

- [ ] `MORPH_SESSION_SECRET` set to a long random value (not the dev default).
- [ ] `MORPH_ALLOW_SIGNUP=false` if the deployment is a public demo.
- [ ] `MORPH_DEMO_PASSWORD` changed from the default, or the demo account removed.
- [ ] HTTPS terminated at the proxy; the session cookie is `Secure` automatically when
      `NODE_ENV=production`.
- [ ] `OPENAI_API_KEY` stored as a server-side secret, never in `.env` files committed to
      git, never in `NEXT_PUBLIC_*`.
- [ ] Database volume backed up (`sqlite3 morph.db ".backup '/backup/morph-$(date +%F).db'"`).
- [ ] `/api/health` reachable, but no `/api/*` route leaks stack traces (errors are logged
      server-side and returned as short messages).
- [ ] Rate limiter reviewed for your traffic shape — it is in-process and per-instance.

## 8. Backups and reset

```bash
# backup
sqlite3 "$MORPH_DB_PATH" ".backup '/backup/morph-$(date +%F).db'"

# rebuild the demo from scratch (destructive, refuses paths outside the project)
npm run db:reset
```

Per-user reset is a product feature, not an ops task: `/studio/compare` → *Reset demo*
restores that workspace's interface and demo data without touching other tenants.

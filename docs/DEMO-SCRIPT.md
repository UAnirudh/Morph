# Morph — five-minute TiE pitch demo script

**Premise to state in the first ten seconds:** software ships one interface for everyone.
Morph ships an interface per person, generated on request, from a validated schema, over
the same underlying data.

Before you start: `npm run db:reset && npm run dev`, log in as `demo@morph.app` /
`morph-demo`, and leave `/studio` open in tab one and `/studio/compare` in tab two. Zoom
the browser to 90% so the whole canvas fits.

---

### 0:00 – 0:30 · The problem, with a finger on the screen

> "This is a CRM. A sales manager, a sales rep and an ops manager all get *this exact
> screen*. One of them lives in the pipeline, one lives in their task list, one lives in
> workload balance. Today each of them either learns to ignore two thirds of the product,
> or files a ticket with IT and waits a quarter."

Point at the sidebar and the canvas: "Same product, three jobs, one layout."

### 0:30 – 1:10 · The promise

> "Morph is a CRM whose interface is data. The layout is a JSON schema; the data is real;
> the renderer is a closed registry of validated components. Which means the interface can
> be rewritten — safely — by describing what you need."

Type into the Morph panel (right side, already open):

> **`Prioritize revenue, pipeline health, and overdue follow-ups.`**

While it runs (2–4 seconds), narrate what the panel is doing: "It's parsing intent,
planning operations against the component registry, and validating them. It never edits
the interface directly."

### 1:10 – 1:50 · Preview, then apply

A proposal appears. Read *with* the audience, don't skim:

- **The intent and summary** — "Revenue focus, 4 sections rebuilt."
- **The diff line** — "+11 added · −9 removed · 2 preserved." Say the important part out
  loud: *"Preserved — the follow-up queue I already had survives. It doesn't bulldoze the
  workspace."*
- **The engine label** — "Local planner, because I have no API key on this laptop. With a
  key it says the model name. It never pretends."

> "Nothing has happened yet. This is a preview against my live data."

Click **Apply change**. The canvas re-renders: revenue trend, win rate, pipeline board with
real deals, stalled deals with a one-click advance.

Then click a deal's **Advance stage** button. "That's a real write — permission-checked,
workspace-scoped. Reload the page, it's still there."

### 1:50 – 2:20 · Undo, because trust is the product

Press **Undo**. The old interface returns.

> "Every change is a version. Undo is a restore, not a delete — the history is append-only,
> so nothing is ever lost. If this is a tool people use at work, that's the difference
> between a demo and a product."

### 2:20 – 3:00 · The second persona, in one sentence

Switch to tab two: `/studio/compare`.

> "Same data, different human."

Click **Demo C · Operations manager**, then **Generate live interface**.

> **`Show team workload, unfinished tasks, and bottlenecks.`**

While it builds: "Workload by owner, task status, stalled deals, bottleneck watch — built
for the ops manager, from the same records the rep was just editing."

### 3:00 – 3:50 · It's not just cosmetic: automation

Go to `/studio/workflows`.

> "A prettier screen is a feature. Changing how work *happens* is a platform."

Point at **Stale lead follow-up** (already enabled, created by the seed):

> "Rule: any lead with no contact in 7 days → flag it and create a follow-up task for the
> owner, at high priority, due tomorrow."

Click **Run now**, then open **Execution history**.

> "Six leads matched, six tasks created, three flagged. That's this workspace, right now —
> not a mock. And here's the guard rail: no delete action exists in the workflow
> vocabulary, so no model can be talked into destroying data."

Then type into Morph: **`Delete every lead in the database and email the whole team.`**

> "It refuses, and tells you what it *can* do. A system that says no is a system you can
> give your pipeline to."

### 3:50 – 4:20 · Why this is defensible

> "Three things make this more than a prompt wrapper. One: the schema is the contract —
> the model proposes operations, the validator and the renderer are ours, so bad output
> can't reach the screen. Two: the data layer is tenant-scoped by construction — every
> query takes a workspace scope, so adaptive UI never becomes a data leak. Three: it's
> reversible — versions, restore, and an audit trail of every transformation with the
> prompt, the engine and the latency."

### 4:20 – 4:50 · Where it goes

> "Today: one product, three personas, six minutes to a working setup. Next: the same
> schema in *other* products — support queues, field ops, finance close — and a component
> marketplace where teams publish components into the same validator. The end state is
> software that adapts to the person, without a release cycle."

### 4:50 – 5:00 · Close

> "The demo you just watched is the repository — tests, migrations, seed and deployment
> docs included. It runs on a laptop with zero configuration, and with one API key it
> generates interfaces with a live model. I'd love to show you the ops manager flow on your
> own data."

---

## Fallbacks (rehearse these)

| If this happens | Do this |
| --- | --- |
| No API key / no network | Nothing changes. The local planner is deterministic and the UI labels it "Local planner". Say so — it's a feature, not a cover story. |
| Provider times out or returns junk | The panel reports the failure and falls back to the planner. Read the message; it's honest by design. |
| You get an "unsupported instruction" refusal on a prompt you wanted to show | The three safe prompts are: *revenue/pipeline/follow-ups*, *team workload/bottlenecks*, *simplify to my assigned leads and today's tasks*. Use one of those. |
| The workspace was polluted by a previous run | `/studio/compare` → **Reset demo**, or `npm run db:reset` before the session. |
| You have 2 minutes instead of 5 | Cut §2:00–2:20 (undo) and §3:50–4:20 (defensibility). Keep the refusal — it lands. |
| Someone asks "is the AI real?" | Show `/api/health`: it reports `engine: local-planner` or the model name. Then show `ai_usage` rows via the panel's usage footer. |

## Questions you will get, and the honest answers

- **"What if the model hallucinates a component?"** It can't: the response is Zod-validated
  against a closed registry, then the *resulting config* is validated again. Invalid output
  is rejected and retried once, then falls back.
- **"Does the data change when the UI changes?"** No. The schema binds to datasets; the
  records are identical across versions. Say it while pointing at two versions in
  `/studio/versions`.
- **"How is this different from a dashboard builder?"** A builder gives humans drag-and-drop
  primitives. Morph lets a person state a goal in their own words and get a validated
  result, including automations, in one step.
- **"What's missing?"** Postgres/multi-node, token streaming, outbound email/Slack
  channels, light theme. All listed in the README's limitations — say them before you're
  asked.

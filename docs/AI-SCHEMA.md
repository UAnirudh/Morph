# AI transformation schema

Morph never renders model output directly. The model (or the deterministic planner)
must return **one JSON object** that satisfies `morphResultSchema`
(`src/lib/morph/result.ts`). That object contains schema *operations*, not HTML, not
React, not SQL. This document is the contract.

Two rules make the system safe:

1. **Closed vocabulary.** Components, datasets, metrics, actions and operations come from
   fixed registries. An unknown type fails validation.
2. **Re-validated end state.** After applying the operations to a copy of the active
   config, the resulting config is parsed by `morphConfigSchema` again. Invalid output is
   rejected before it is stored, previewed or applied.

## 1. Top-level result

```jsonc
{
  "kind": "config",                 // "config" | "workflow" | "restore" | "refusal"
  "intent": "Build a pipeline + follow-up workspace",   // short, human readable
  "summary": "Reshaped the workspace around pipeline, followups. 9 components across 3 sections.",
  "operations": [ /* see §3, max 12 */ ],
  "requiredDataSources": ["deals", "overdue_followups"], // datasets the result binds to
  "requiredActions": ["mark_lead_contacted"],            // actions the result exposes
  "assumptions": ["Rebuilt 3 section(s); panels outside the request were preserved."],
  "unresolved": [],
  "restorePrevious": false,
  "workflowDraft": null,            // only for kind = "workflow"
  "refusal": null                   // only for kind = "refusal"
}
```

| Field | Limits and meaning |
| --- | --- |
| `kind` | `config` = change the interface, `workflow` = draft an automation, `restore` = roll back one version, `refusal` = cannot or will not do this |
| `intent` | ≤ 140 chars, shown in the proposal header |
| `summary` | ≤ 500 chars, shown under the intent |
| `operations` | ≤ 12; must be empty for `workflow` and `restore` |
| `requiredDataSources` | ≤ 12, each must exist in `ALL_DATASET_KEYS` |
| `requiredActions` | ≤ 12, each must exist in the action allowlist (`ACTION_DEFS`) |
| `assumptions` | ≤ 5 × 220 chars; shown to the user as "what I assumed" |
| `unresolved` | ≤ 5 × 220 chars; anything the model could not determine |
| `restorePrevious` | `true` only with `kind: "restore"` |
| `refusal` | Required when `kind` is `refusal`; shown verbatim |

## 2. Component registry

Fourteen component types. Each has required fields; the Zod discriminated union on `type`
enforces them.

| Type | Binds to | Key fields |
| --- | --- | --- |
| `metric` | a metric key | `metric`, `title`, `format` (inherited from the metric) |
| `chart` | a chart dataset | `dataset`, `chartType` (`bar`, `line`, `area`, `pie`, `funnel`), `height` |
| `table` | a record dataset | `dataset`, `columns` (field names from that dataset), `sortField`, `sortDirection`, `filterField`, `filterValues`, `rowActions`, `search` |
| `list` | a record dataset | `dataset`, `fields`, `limit`, `tone`, `action` |
| `pipeline-board` | deals | `metric` (`amount` or `count`), `limitPerStage` |
| `task-list` | tasks | `scope` (`mine` / `team`), `filter` (`today` / `overdue` / `open`), `limit` |
| `activity-feed` | activities | `limit` |
| `workflow-panel` | workflows | `limit`, `showRuns` |
| `quick-actions` | actions | `actions[]` from the allowlist, `variant` (`buttons` / `menu`) |
| `filters` | record datasets | `targets[]`, `fields[]` |
| `form` | a CRM entity | `entity` (`lead` / `task` / `activity`), `fields[]`, `submitLabel` |
| `insight` | none (text) | `body`, `tone`, `source` (`static` / `metric`) |
| `progress` | a metric | `metric`, `target`, `label` |
| `nav-shortcuts` | none | `items[]` with `label`, `href`, `icon` |

Every component also carries `id` (unique, ≤ 64 chars, stable across versions),
`title`, `span` (1–12 grid columns), optional `description`, and `group`
(`overview` | `pipeline` | `work` | `records` | `automation` | `activity`) which is what
`replace_group` operates on.

`columns` and `fields` must be valid for the bound dataset — `datasetFields()` is the
source of truth, and the validator rejects a table that asks for a field the dataset does
not expose. This is what prevents a model from inventing `leads.favouriteColour`.

### Datasets

Record datasets: `leads`, `my_leads`, `deals`, `at_risk_deals`, `tasks`, `my_tasks`,
`overdue_followups`, `companies`, `contacts`, `activities`, `workflows`.
Chart datasets: `revenue_by_month`, `deals_by_stage`, `leads_by_source`,
`conversion_funnel`, `task_status`, `workload_by_owner`.

Each is resolved server-side by `src/lib/crm/data.ts` with the caller's workspace scope.

### Actions (`ACTION_DEFS`)

`mark_lead_contacted`, `qualify_lead`, `create_followup_task`, `advance_deal_stage`,
`complete_task`, `new_lead`, `new_task`, `log_activity`, `open_record`, `run_workflow`,
`toggle_workflow`. Every one maps to a server action that re-checks the session and the
workspace before writing. There is no "delete" action in the vocabulary.

## 3. Operations

```jsonc
{"op":"add_component","component":Component,"index":0}
{"op":"remove_component","id":"c-pipeline"}
{"op":"update_component","id":"c-tasks","changes":{ /* partial component fields */ }}
{"op":"move_component","id":"c-tasks","index":2}
{"op":"replace_group","group":"overview","components":[Component, ...]}   // ≤ 12
{"op":"set_layout","layout":{"density":"compact","gap":"md","showGroupHeadings":true}}
{"op":"set_accessibility","accessibility":{"fontSize":"lg","highContrast":true,"reduceMotion":true,"reduceClutter":false}}
{"op":"set_navigation","items":[{"id":"nav-home","label":"Command center","href":"/studio","icon":"layout-dashboard","badge":"task_due_today"}]}
{"op":"set_header","header":{"title":"Pipeline command center","subtitle":"Every stage in one screen","badge":"sales manager"}}
{"op":"set_meta","name":"Pipeline command center","description":"..."}
```

Rules the validator enforces:

- `replace_group` with an empty `components` array removes that section (used by
  "simplify"), but the interface must still keep at least one component overall.
- `add_component` with an existing `id` is rejected; so is `remove_component` that would
  leave zero components.
- `set_navigation` items must use known `href` values and icon names.
- Operations are applied in order; the first failure aborts the patch and the proposal is
  rejected with the validator's messages (which the repair prompt quotes back).

## 4. Validation, repair and refusal

```
model ──▶ JSON extract ──▶ morphResultSchema
                              │ invalid
                              ▼
                    one repair turn (issues + original output)
                              │ still invalid
                              ▼
                    proposal rejected, engine falls back:
                      · if provider failed → local planner
                      · if both fail      → honest refusal, nothing stored
```

- `extractJson()` tolerates fenced code blocks and leading prose, then parses strictly.
- Exactly **one** repair attempt is made; the repair prompt lists the validator issues and
  the offending JSON (truncated to 4 000 chars).
- Invalid output is never stored as an appliable proposal. The failure is logged
  (`morph.provider.invalid_after_repair`) with only the issue list, no prompt content.
- Refusals are a first-class result, not an error: `kind: "refusal"` with a `refusal`
  string explaining what Morph can do instead. The UI renders it as "Not applied".

Requests that are always refused, regardless of engine:

- data deletion or bulk export (`delete every lead`, `export all`),
- sending email or contacting people outside the app,
- permission or authentication changes,
- anything with no detectable intent from the supported set.

## 5. Workflow drafts

`kind: "workflow"` carries a `workflowDraft` validated by `workflowDefinitionSchema`:

```jsonc
{
  "schemaVersion": 1,
  "name": "Stale lead follow-up",
  "description": "Flag leads with no contact in 7+ days and create a follow-up task.",
  "trigger": {"type": "daily_check", "entity": "lead"},
  "conditions": [
    {"type": "days_since_contact_gte", "value": 7},
    {"type": "field_equals", "field": "status", "value": "qualified"}
  ],
  "actions": [
    {"type": "flag_record", "reason": "No contact in 7+ days"},
    {"type": "create_task", "title": "Follow up with {{name}} ({{company}})", "priority": "high", "dueInDays": 1, "assignTo": "record_owner"}
  ]
}
```

- Triggers (4): `record_created`, `record_updated`, `deal_stage_changed`, `daily_check`.
- Conditions (8): `field_equals`, `field_gte`, `field_lte`, `days_since_contact_gte`,
  `days_since_update_gte`, `assigned_to_owner`, `overdue_task`, `flagged`.
- Actions (4): `create_task`, `update_field`, `flag_record`, `notify` — nothing else is
  representable, so nothing else can run.

A draft is **inactive** until the user enables it. The proposal says so, and the workflow
panel requires an explicit toggle before the engine will consider it.

## 6. Provider configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | unset | Enables live generation; unset = deterministic local planner |
| `MORPH_AI_MODEL` | `gpt-4o-mini` | Model name passed through; shown in the UI |
| `MORPH_AI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint (Azure, OpenRouter, vLLM, Ollama) |

The request is a standard `POST /chat/completions` with `temperature: 0.2`,
`response_format: { type: "json_object" }` where supported, and a 25 s timeout. Token
usage and latency are written to `ai_usage` and shown in the panel.

`PROMPT_VERSION` (`morph-transform-v3`) is stamped on every request and log line, so a
change in prompt behavior is traceable to a deployment.

## 7. Why this shape

- **Operations, not documents.** A model that rewrites the whole config tends to drop
  sections it was not asked about. Operations let Morph preserve untouched panels and say
  so ("Rebuilt 3 section(s); panels outside the request were preserved.").
- **Registry, not free-form.** The failure mode of "generate a dashboard" is a decorative
  but meaningless screen. Here every component is bound to a dataset that exists, so the
  output is functional by construction.
- **Refusal as a feature.** A demo that admits what it cannot do is more credible than one
  that silently does something else.

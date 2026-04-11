# Assign-to-AI via Managed Agents — Design Brief

> Status: design, not implemented
> Last updated: 2026-04-11
> Related roadmap entry: AI Agent → Assign-to-AI Tasks
> Related memory: `project_assign_to_ai.md`

## Summary

Use Anthropic's Managed Agents API (`/v1/agents`, `/v1/sessions`) as the runtime for tasks assigned to the AI bot user. One persisted agent per company (per tier — Opus for managers, Haiku for techs), one session per task assignment, custom tools wrapping a narrow allowlist of existing `ProposedAction` types. Credentials stay host-side; the sandbox never sees Auth0/Neon/METRC secrets.

This replaces building our own retry loop, audit log, permission gating, and prompt versioning from scratch.

## Why Managed Agents (not Claude API + tool use)

- **Versioning for free** — every `agents.update()` creates an immutable version; sessions pin to one. Safe prompt iteration + rollback.
- **Event stream = audit log** — every tool call, message, and stop reason lands on the SSE stream. Persist verbatim to an `ai_task_events` table and you have a complete audit trail without designing one.
- **Stop reasons map cleanly to task states** — `end_turn` → completed, `requires_action` → `ai_pending`, `retries_exhausted` → `ai_failed`.
- **Context compaction + caching handled** — no manual prompt-budget management for long task runs.
- **Not used for `ai-parse.ts`** — that path is a single-shot parser returning `ProposedAction[]` for the existing client-side preview/confirm UI. Managed Agents would add container provisioning latency for zero gain. Managed Agents is strictly for **executor** flows where the AI acts over time, not parser flows.

## Architecture

### The two-object flow

```
ONE-TIME SETUP (per company, per tier)
  agents.create({ model, system, tools: [custom tools] })
  → persist agent.id + agent.version to companies table

RUNTIME (per task assignment)
  sessions.create({ agent: agent.id, environment_id, title, metadata })
  → stream events, drive the loop, persist to audit table
```

Custom tools — no `agent_toolset_20260401`. The agent has no bash, no filesystem, no web access. Every capability is an explicit schema-validated custom tool the orchestrator executes with `company_id`-scoped credentials.

### Data model changes

```sql
-- migrations/NNNN_ai_tasks.sql

-- AI bot user per company — existing users table, role='ai_bot'
-- Created on first task assignment.

ALTER TYPE human_task_status ADD VALUE 'ai_pending';  -- waiting on operator confirmation
ALTER TYPE human_task_status ADD VALUE 'ai_running';  -- session active
ALTER TYPE human_task_status ADD VALUE 'ai_failed';   -- retries_exhausted or tool error

ALTER TABLE human_tasks
  ADD COLUMN ai_session_id TEXT,       -- sess_...
  ADD COLUMN ai_agent_version BIGINT;  -- pinned for reproducibility

ALTER TABLE companies
  ADD COLUMN ai_agent_id_opus TEXT,
  ADD COLUMN ai_agent_version_opus BIGINT,
  ADD COLUMN ai_agent_id_haiku TEXT,
  ADD COLUMN ai_agent_version_haiku BIGINT,
  ADD COLUMN ai_environment_id TEXT,
  ADD COLUMN ai_bot_user_id UUID REFERENCES users(id);

CREATE TABLE ai_task_events (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  task_id UUID NOT NULL REFERENCES human_tasks(id),
  session_id TEXT NOT NULL,
  event_id TEXT NOT NULL,        -- sevt_... from the stream
  event_type TEXT NOT NULL,      -- agent.custom_tool_use, agent.message, etc.
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, event_id)  -- load-bearing: makes stream reconnect safe
);
CREATE INDEX ON ai_task_events (task_id, created_at);
```

The `UNIQUE (session_id, event_id)` constraint is required for the reconnect pattern — on resume, we fetch history via `events.list()` and dedupe against the audit table before replaying. Without it, double-execution is possible.

### Tool allowlist (phase 1)

`ProposedActionType` (in `src/types/definitions.ts`) already is the action allowlist as a discriminated union. Don't expose all ~60 types on day one. Tier them:

| Tier | Handling | Examples |
|---|---|---|
| **Read** | Auto-execute | `find_plants`, `list_human_tasks`, `get_harvest_status`, `list_packages` |
| **Safe write** | Auto-execute | `create_human_task`, `update_human_task` (notes only), `flag_contamination` |
| **Gated write** | Materialize as `ai_pending`, wait for operator | `change_plant_phase`, `move_plants`, `record_wet_weight`, `create_package`, `update_package`, `assign_tag` |
| **Forbidden** | Never exposed (phase 2+ or never) | all `delete_*`, `destroy_plants`, `record_extraction`, `start_extraction_run`, `submit_harvest_batch`, license CRUD |

Tool schemas already exist inline in `ai-parse.ts`'s system prompt — this project extracts them into a shared `actionSchemas.ts` that both `ai-parse` and the agent setup import. Useful cleanup regardless.

### Emulated `always_ask` for custom tools

Managed Agents' built-in `always_ask` permission policy only applies to server-executed tools (agent toolset + MCP). For custom tools, we implement the gate ourselves: "is this tool in the `gatedWrite` tier? → write `ai_pending`, stop processing, return." The operator approves via UI, and a separate endpoint resumes the session.

This is actually preferable — the gate is rendered in our UI, not a generic confirmation modal, and it maps cleanly to the existing task status workflow.

### Runtime flow

One new Netlify function: `ai-task-runner.ts`. Triggered by (a) a task being assigned to the AI bot user in the UI, or (b) an `onCompleteAction` that creates an AI-assigned task.

```ts
// netlify/functions/ai-task-runner.ts
export async function handler(event) {
  const { taskId } = JSON.parse(event.body);
  const { companyId } = await resolveContext(event.headers.authorization);

  const task = await loadTask(taskId, companyId);
  const company = await loadCompany(companyId);
  const tier = task.assignedByRole === 'technician' ? 'haiku' : 'opus';

  // 1. Start session pinned to the company's agent version for this tier
  const session = await client.beta.sessions.create({
    agent: {
      type: 'agent',
      id: company[`aiAgentId_${tier}`],
      version: company[`aiAgentVersion_${tier}`],
    },
    environment_id: company.aiEnvironmentId,
    title: task.title,
    metadata: { task_id: taskId, company_id: companyId, tier },
  });

  await sql`UPDATE human_tasks SET ai_session_id = ${session.id}, status = 'ai_running' WHERE id = ${taskId}`;

  // 2. Stream-first, then send kickoff
  const stream = await client.beta.sessions.events.stream(session.id);
  await client.beta.sessions.events.send(session.id, {
    events: [{
      type: 'user.message',
      content: [{
        type: 'text',
        text: `Task: ${task.title}\n\n${task.description ?? ''}\n\nComplete this task using the available tools.`,
      }],
    }],
  });

  // 3. Drive the event loop
  for await (const evt of stream) {
    await persistEvent(companyId, taskId, session.id, evt);

    if (evt.type === 'agent.custom_tool_use') {
      const toolName = evt.name as ProposedActionType;
      const category = categorize(toolName);

      if (category === 'gatedWrite') {
        await sql`UPDATE human_tasks SET status = 'ai_pending' WHERE id = ${taskId}`;
        await persistPendingToolCall(taskId, evt.id, toolName, evt.input);
        return;  // exit; resume when operator approves via ai-task-approve endpoint
      }

      const result = await executeProposedAction(
        { type: toolName, data: evt.input },
        { userId: company.aiBotUserId, companyId, role: 'ai_bot' },
      );

      await client.beta.sessions.events.send(session.id, {
        events: [{
          type: 'user.custom_tool_result',
          custom_tool_use_id: evt.id,
          content: [{ type: 'text', text: JSON.stringify(result) }],
          is_error: result.ok === false,
        }],
      });
    }

    // Correct idle-break gate — do not break on bare session.status_idle
    if (evt.type === 'session.status_terminated') {
      await sql`UPDATE human_tasks SET status = 'completed', completed_at = NOW() WHERE id = ${taskId}`;
      break;
    }
    if (evt.type === 'session.status_idle') {
      if (evt.stop_reason.type === 'requires_action') continue;
      if (evt.stop_reason.type === 'end_turn') {
        await sql`UPDATE human_tasks SET status = 'completed', completed_at = NOW() WHERE id = ${taskId}`;
        break;
      }
      if (evt.stop_reason.type === 'retries_exhausted') {
        await sql`UPDATE human_tasks SET status = 'ai_failed' WHERE id = ${taskId}`;
        break;
      }
    }
  }
}
```

Companion endpoint `ai-task-approve.ts`:
1. Loads the pending `agent.custom_tool_use` event
2. Runs `executeProposedAction` with company-scoped context
3. Reopens the stream, fetches history via `events.list()`, dedupes on `(session_id, event_id)`
4. Sends `user.custom_tool_result` back
5. Resumes the loop

## Key design decisions

1. **Custom tools, not agent toolset.** No bash, no filesystem, no web. Sandbox stays credential-free.
2. **`always_ask` is emulated in the handler, not configured on the agent.** Custom tools can't use the built-in policy; the gate lives in our Netlify function and maps to `ai_pending`.
3. **Per-session DB scoping is non-negotiable.** `executeProposedAction` takes `{userId, companyId, role}` and every downstream query filters by `company_id`. Add a lint rule or wrapper that requires the scope arg — if a tool handler forgets, one compromised task could leak across tenants.
4. **Two agents per company, one per tier.** `project_role_model_pricing.md` says Opus for managers, Haiku for techs. That's two separate `agents.create()` calls per company, selected by `task.assignedByRole`.
5. **Audit identity.** Every mutation uses `ai_bot_user_id`, not the assigning user. Reports can answer "what has the AI done this week" trivially.
6. **Resume pattern for long tasks.** Netlify function timeouts (10s default, 26s background) will bite long multi-tool runs. Each invocation processes one segment; the function returns when it hits `ai_pending` or terminal. `ai-task-approve.ts` drives the resume.
7. **Stream reconnect is mandatory on resume.** SSE has no replay. Must fetch history via `events.list()` and dedupe against `ai_task_events` before continuing.

## Minimal spike to de-risk

Ignore everything above except this path — proves the architecture in ~a day:

1. Migration: `ai_task_events` table + `ai_running`/`ai_failed` statuses.
2. One agent per company with exactly two tools: `list_human_tasks` (read) and `create_human_task` (safe write).
3. `ai-task-runner.ts` that accepts a task ID, starts a session, runs to completion, writes events.
4. Hardcoded test task: *"Look at the open tasks in the 'drying_curing' category and create a summary sub-task."*

If that works end-to-end — session spins up, tool calls execute with company scoping, events land in the audit table, task flips to `completed` — the rest is widening the allowlist and building the `ai_pending` UI. Everything hard is in step 3.

## Open questions

- **Environment reuse:** one shared environment per company, or one per tier? Network policy likely unrestricted (no bash/web anyway).
- **Schema extraction scope:** do we extract schemas from `ai-parse.ts` now as prep, or fork them and reconcile later? Forking risks drift.
- **Error surfacing to operators:** when a tool call fails mid-run, what does the UI show? Probably the last few `agent.message` events + the failed tool name/input.
- **Rate limiting:** Managed Agents has 60 RPM for session creates org-wide. Fine for now but worth noting for growth.
- **Cost tracking:** usage lands on `span.model_request_end` events — persist to `ai_task_events` and aggregate for per-company billing / observability.

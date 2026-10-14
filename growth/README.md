# NeuroCann growth server

Our own prospect database and sales automation: demo requests from the website, Claude-researched enrichment with a fit score, state cannabis license lookups, call/demo notes, a daily digest, and a one-way push to Attio. There's no UI. You drive it through **MCP** (Claude Code / claude.ai) or the **`growth` CLI**, which calls the same tools.

It runs as one Node process on Railway: a Hono HTTP server, a Graphile Worker job runner (cron and retries), and Railway Postgres. Its data is separate from the product's Neon database.

```
website /demo form ──► Netlify proxy /api/growth/v1/demo-requests ──► POST /v1/demo-requests
                                                                          │ (one transaction)
                                       organizations · people · demo_requests · messages · activities
                                                                          │ graphile_worker jobs
          notify_demo_request ─ send_demo_confirmation ─ enrich_organization ─ sync_to_attio
                 (SendGrid)            (SendGrid)        (Claude + licenses)       (Attio)

Claude Code / CLI ──► POST /mcp (Bearer GROWTH_API_KEYS) ──► pipeline tools
cron: daily_digest 14:00 UTC · attio_reconcile 08:00 UTC
```

Shared types: the demo-request wire contract (form options, field limits, payload and response types) lives in `../shared/growth/demoRequest.ts` and is imported by both this server and the website. See `../shared/README.md`.

## Local dev

```bash
cd growth
npm install                 # npm ≥ 11 if you regenerate the lockfile; `npm ci` works on npm 10
cp .env.example .env        # point DATABASE_URL at a local Postgres
npm run dev                 # migrates, starts worker + HTTP on :8787
```

With the main app's `npm run dev` running too, `/demo` on the Vite server posts to it through the dev proxy (`GROWTH_DEV_URL` overrides the target).

```bash
npm test          # vitest, against TEST_DATABASE_URL (default postgresql://growth:growth@localhost/growth_test)
npm run typecheck
```

DB-backed tests skip themselves when that Postgres isn't reachable.

## CLI

```bash
export GROWTH_URL=https://growth.neurocann.app GROWTH_API_KEY=...
npx tsx bin/growth.ts summary
npx tsx bin/growth.ts demos list --status requested
npx tsx bin/growth.ts demos update <id> --status scheduled --scheduled-at 2026-10-20T16:00:00Z
npx tsx bin/growth.ts prospect get acmefarms.com          # or an email, or an org id
npx tsx bin/growth.ts org update acmefarms.com --stage trial
pbpaste | npx tsx bin/growth.ts note jane@acmefarms.com --kind call_note
npx tsx bin/growth.ts enrich acmefarms.com --force
npx tsx bin/growth.ts call search_prospects '{"query":"farms","stage":"demo"}'
```

`npx tsx bin/growth.ts --help` lists everything.

## MCP in Claude Code

```bash
claude mcp add --transport http neurocann-growth https://growth.neurocann.app/mcp \
  --header "Authorization: Bearer $GROWTH_API_KEY"
```

Tools: `pipeline_summary`, `list_demo_requests`, `update_demo_request`, `search_prospects`, `get_prospect`, `update_organization`, `log_note`, `enrich_organization`, `sync_to_attio`.

## Deploying on Railway

1. Create a project from this GitHub repo and leave the service's **Root Directory** empty (the build needs `shared/` as well as `growth/`). Railway no longer lets new services use a config file, so set these in the dashboard:
   - Variable `RAILWAY_DOCKERFILE_PATH=growth/Dockerfile`, so it builds the growth image from the repo root (the image holds only `shared/` and `growth/`). Without it Railway tries to build the website and fails.
   - **Settings → Deploy → Healthcheck Path:** `/healthz`.
   - **Settings → Deploy → Healthcheck Timeout:** `60` seconds, so a boot that is still running migrations isn't marked failed too early.
   - **Settings → Deploy → Restart Policy:** `On Failure` with **Max Retries** `5`, so a crashing deploy restarts a bounded number of times instead of looping forever.
   - **Settings → Build → Watch Paths:** `/growth/**` and `/shared/**`, so website-only changes don't redeploy it.
2. Add a **Postgres** database to the project and set `DATABASE_URL=${{Postgres.DATABASE_URL}}` on the service.
3. Set the variables from `.env.example`. At minimum: `GROWTH_API_KEYS`, `IP_HASH_SALT`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `DEMO_NOTIFY_EMAIL`. `DEMO_SCHEDULING_URL` is optional; without it the form just says you'll reply by email.
4. Add the custom domain `growth.neurocann.app` and create the CNAME Railway gives you. The main site's `netlify.toml` proxies `/api/growth/v1/demo-requests` to that host.
5. Migrations run on every boot (`src/migrate.ts`; files in `migrations/` apply once each, in order). Graphile Worker installs its own `graphile_worker` schema.

## Attio

- Create an access token with read/write on records, list entries and notes, plus read on object and list configuration. Set it as `ATTIO_API_KEY`.
- Companies are asserted by `domains` and people by `email_addresses`, with the person linked to the company. Form messages, call/demo notes and enrichment summaries become Attio notes on the company.
- For pipeline tracking, create a list on **Companies** (e.g. "Demo Pipeline") and set `ATTIO_DEMO_LIST` to its slug. Each demo request adds the company to it once; manage the stage in Attio.
- Sync is one-way and idempotent: Attio IDs are stored locally, and failures are retried by the job queue and again nightly.
- All Attio payload shapes are in `src/attio.ts`. They were written against Attio's v2 API docs but haven't been run against a live workspace yet. Watch the first sync's logs.

## Enrichment

**Claude research** (`ANTHROPIC_API_KEY`, model `ENRICH_MODEL`, default `claude-opus-5-5`):
- One call with web search writes a factual brief. A second call with structured output extracts the summary, operation types, states, canopy, license numbers, a 0–100 fit score with reasons, and sources.
- Both calls use server-side refusal fallbacks.
- Orgs are re-researched at most every 30 days unless forced.

**State licenses** (`LICENSE_SOURCES`): a JSON array of Socrata open-data registries, searched by company name and by any license numbers the research found.

```json
[{"state":"WA","domain":"data.example.gov","dataset":"abcd-1234",
  "fields":{"licenseNumber":"license","legalName":"name","dba":"tradename","licenseType":"type","status":"status","city":"city"}}]
```

Dataset IDs and column names differ by state and change over time, so check each one on the state's portal before adding it. License numbers that Claude found but no configured registry confirmed are still stored, with `status = 'unverified'` and `source = 'claude_research'`.

## Next

- Granola call notes: a webhook (via Zapier) that writes `call_note` messages. The schema already supports it (`conversations.external_source/external_id`).
- Email sequences: tables plus a Graphile job per step.
- Attio → growth sync via Attio webhooks.

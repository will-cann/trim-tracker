# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trim Tracker (branded "NeuroCann" in the UI) is a cannabis cultivation and operations management platform. It started as a trim tracking tool and has grown into a full-facility management app covering plant lifecycle, harvests, trim sessions, packaging, extraction, and task management — all driven by an AI conversational interface.

**Stack:**
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Backend:** Netlify Functions (serverless, in `netlify/functions/`)
- **Database:** Neon PostgreSQL (via `@neondatabase/serverless`)
- **Auth:** Auth0 (with dev bypass mode via `VITE_DEV_BYPASS_AUTH=true` / `DEV_BYPASS_AUTH=true`)
- **AI:** Anthropic Claude API (server-side, in `ai-parse.ts` function)
- **Voice:** Deepgram for speech-to-text
- **Deployment:** Netlify

## Development Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npm run preview      # Preview production build
```

### Database Migrations

Dev and prod use separate Neon branches. Local `.env` `DATABASE_URL` points at the `dev` branch; prod credentials live only in Netlify env vars and must never be pasted into `.env`.

```bash
# Against the dev branch (default — reads .env)
node scripts/run-migration.mjs migrations/<filename>.sql

# Against prod — requires .env.production.local (gitignored) with the prod DATABASE_URL.
# Prints the resolved host and waits 5 seconds before executing so a mistake is recoverable.
node scripts/run-migration.mjs --prod migrations/<filename>.sql
```

Rule: prod connection strings never live in `.env`. Create `.env.production.local`, run the migration, clear the file.

### AI Eval Suite (Python, in `tests/eval/`)

```bash
cd tests/eval && python -m pytest   # Run AI intent classification and entity extraction evals
```

## Architecture

### Frontend (`src/`)

Single-page app with view-based navigation (no router). `App.tsx` manages all top-level state and passes it down. Views are selected via `currentView` state (`ViewType`).

**Key views:** `ai` (AIHome — conversational interface), `dashboard` (trim sessions), `harvests`, `harvest-day` (live weighing cockpit), `plant-map`, `packages`, `reports`, `tasks`, `settings`

**AI chat flow:** `AIHome` → `useAIChat` hook → calls `apiService.aiChat()` → Netlify Function `ai-parse` → Claude API. The AI returns `ProposedAction[]` which are previewed to the user, then executed via `actionExecutor.ts` calling the appropriate API endpoints.

**Voice modes:**
- **Action mode:** Speech transcribed → injected into AIHome text input for AI processing
- **Ambient mode:** Speech transcribed → `ai-parse` extracts tasks automatically (silent, no chat UI)

**Services:**
- `apiService.ts` — All API calls to `/.netlify/functions/*`, with auth token injection
- `actionExecutor.ts` — Executes `ProposedAction` objects by calling the appropriate `apiService` methods
- `chatDb.ts` — IndexedDB (Dexie) for conversation history persistence

### Backend (`netlify/functions/`)

~57 serverless functions, each handling one operation. Shared utilities in `utils/`:
- `db.ts` — Neon SQL tagged template + lazy connection pool for transactions
- `auth.ts` — Auth0 JWT verification via `jose`, with dev bypass. Auto-provisions new users/companies on first login.
- `harvest.ts` — Shared harvest query helpers

All functions call `resolveContext(authHeader)` to get `{ userId, companyId, role }` and scope queries to `company_id`.

### Database

PostgreSQL on Neon. Multi-tenant via `company_id` on all tables. 24+ migrations in `migrations/` (numbered sequentially). Key domains: companies, users, trimmer_profiles, trim_sessions/entries/trimmers, harvests/allocations/waste, plant_batches/plants, rooms, strains, licenses, tags, packages, extraction_logs, human_tasks.

### Type System (`src/types/`)

- `definitions.ts` — All shared frontend types (entities, DTOs, enums, AI/chat types)
- `plantMap.ts` — Plant map module types (room layout, health events, hot-spot summary), room entities. Re-exports the contaminant catalog and planner from `shared/plantMap/`.

### Plant mapping (`src/components/PlantMap/`, `shared/plantMap/`)

The plant map has four views: cards (rooms), table (sortable by feed, flower length, stretch, cell), schedule/calendar, and **map** (`RoomLayoutView.tsx`). The map view is where bud rot gets mapped:

- **Grid:** `rooms.layout_rows/layout_cols` define benches × positions; `plants.position_row/position_col` (0-indexed, unique per live plant per room). Set via Settings → Rooms, the map's setup card, or `manage-room.ts`. `set-plant-positions.ts` places/swaps in one transaction; `plant-actions.ts` clears positions on room moves unless `placements` are passed.
- **Health events:** `plant_health_events` (migration 067) is the per-plant observation log — contaminant key, severity 1–5, note, and a snapshot of room + cell + flowering day. `plant-health-events.ts` (POST log / PATCH resolve / GET list) keeps `plants.contaminants` and `plant_health` in step. `plants.contaminants` stays the *current* state the AI's `find_plants` reads; the events table is history.
- **Hot spots:** `shared/plantMap/hotspots.ts` `scoreHotspots()` turns events into a per-cell 0–1 risk surface (severity × recency decay with a floor for active events, plus neighbour bleed). History survives harvests, so a wet corner shows up across cycles. `get-hotspots.ts` is the facility roll-up (per room, per strain incidence).
- **Move planner:** `shared/plantMap/movePlanner.ts` `planMoves()` → cull / isolate / relocate / inspect suggestions with destination cells (sibling rooms allowed), plus cells to leave empty at the next flip. Served by `get-room-layout.ts`; the UI applies moves directly or creates human tasks with `place_plants` / `destroy_plants` `onCompleteAction`s.
- **Cohort sorting:** `shared/plantMap/cohorts.ts` groups plants by feed (`strains.feed_profile`), flower length (`default_flowering_days`) and stretch (`stretch_trait`) and `proposeLayout()` fills benches row-major by cohort, skipping hot cells while there's room.
- **AI:** `plants` tool action `log_issue` → `log_plant_health_event`; read-only `find_hotspots` returns the roll-up plus a room's move plan. Both builders live in `netlify/functions/utils/plantMap.ts`. `create_room` / `update_room` take `layoutRows` / `layoutCols` ("Flower 1 has 4 benches of 8").
- **Grids from drawings:** Settings → Rooms → Import schematic posts a floor plan / sketch to `parse-room-schematic.ts` (Claude vision, model via `SCHEMATIC_PARSE_MODEL`), which proposes rooms with benches × positions; the operator edits and saves (existing names update, new ones create).
- **Chat context:** `ai-parse` pushes only the open harvest pipeline, capped at 40, since Metrc-synced facilities mirror every closed harvest.

### Facility metrics (`metric_snapshots`, computed daily)

`netlify/functions/utils/metrics.ts` is the registry: each metric is a SQL query returning (dimension, value) rows for one company as of a snapshot date (windows are anchored on that date so backfills are honest). `compute-metrics.ts` runs on the Netlify schedule in `netlify.toml` (daily, every company, no auth) and as a director-only POST for "Recompute now" / `backfillDays`. Each run writes one `metric_snapshots` row per company × metric × dimension × day (re-running a day replaces it) and a `metric_runs` row for observability. `get-metrics.ts` returns definitions, series, a latest-with-change summary (`summarizeLatest`) and recent runs; Reports → Facility metrics renders it; the AI reads it through the read-only `find_metrics` lookup. Add a metric by adding a definition and a computer in `utils/metrics.ts`; no schema change needed.

### Email / CRM

Supplier and contact email is handled via SendGrid. Outbound sends go through
`netlify/functions/send-supplier-email.ts`, which stubs to a no-op log when
`SENDGRID_API_KEY` is unset so local dev doesn't require SendGrid credentials.
Inbound replies hit `netlify/functions/receive-email.ts`, exposed behind SendGrid
Inbound Parse on `replies.neurocann.app` (`SENDGRID_INBOUND_DOMAIN`). Threads and
messages persist server-side in the `contact_threads` and `contact_messages`
tables, scoped by `company_id`. The AI composes drafts via the
`compose_supplier_email` proposed action, which renders an editable preview before
send. Inbound bodies are parsed by Claude into structured `vendor_products` rows
(pricing, availability) for the ordering module. SMS columns exist on the contact
schema but are not wired to a provider yet.

### Manifest picker (`src/manifest/`, `/manifest`)

Standalone pick-and-scan page (own Auth0 provider in `src/manifest/auth.tsx`; functions require a
Bearer token from a company listed in `MANIFEST_COMPANY_IDS`, transfer submit needs director+)
that loads an Apex pick list, scans Metrc case tags, and emits T3 Autofill `.t3csv` transfer files.
Customers whose Metrc we touch get their own Netlify site from the same branch with their own
`T3_API_KEY`/`T3_MODE`/allowlist (`docs/manifest-t3.md`). With
`T3_API_KEY` set it also talks to metrc.com through the T3 API (`netlify/functions/t3-*.ts`,
client in `utils/t3.ts`): `lib/reconcile.ts` checks each scanned case's Metrc contents (item,
qty, parent lot, lab state) against the pick list and attached invoice, and
`t3-create-transfer` validates/submits the transfer. `T3_MODE` (`read-only` default,
`sandbox`, `live`) decides whether submit is allowed. Wire types live in
`shared/manifest/t3.ts`; setup in `docs/manifest-t3.md`.

### Metrc sync (per-customer deploys)

On a deploy with `T3_API_KEY` and exactly one company in `MANIFEST_COMPANY_IDS`, Metrc is
mirrored into that company: `cron-metrc-sync` (every 15 min) queues a `metrc_sync_runs` row and
POSTs its id to `metrc-sync-background` (Netlify background function, 15-min limit), which pulls
items, strains, locations, packages, plant batches, harvests and plants per licence through
`utils/t3.ts` and upserts them.
Pure mapping and conflict rules live in `utils/metrcSync.ts` (tested without I/O), batched SQL in
`utils/metrcSyncStore.ts`, orchestration in `utils/metrcSyncRunner.ts`. Metrc-owned columns are
named explicitly in the upserts; NeuroCann-owned data (notes, contaminants, harvest links, trim
data) is never touched, and rows are never deleted. Per-list cursors (`metrc_sync_state`) only
advance on a clean pull. Settings → Metrc Sync (`metrc-sync-status`, `metrc-sync-start`) shows
runs and offers Sync now / Dry run to directors. Design: `docs/briefs/t3-metrc-sync-brief.md`;
operations: `docs/metrc-sync.md`.

### LLM Plugin (MCP server)

`netlify/functions/mcp.ts` is a distribution channel: it exposes NeuroCann inside ChatGPT,
claude.ai, Claude Code and Cursor over MCP Streamable HTTP at `/mcp` (stateless JSON-RPC,
no sessions/SSE). Auth is mixed-mode (`utils/apiKeys.ts`): anonymous callers can run the
database-free public tools in `utils/mcpPublicTools.ts` (product info, demand-backward
extraction planner, dry-weight estimator — the top of the funnel); facility tools need an
Auth0 OAuth token minted for `MCP_RESOURCE` (ChatGPT/claude.ai sign-in, scopes
`read:facility` / `write:tasks`) or a `nck_...` API key (`api_keys` table, SHA-256 hashed).
Gated tools called anonymously return `_meta["mcp/www_authenticate"]` so ChatGPT shows its
link-account UI; every tool advertises `securitySchemes` and annotations. OAuth discovery is
`oauth-protected-resource.ts` at `/.well-known/oauth-protected-resource`. Tools live in
`utils/mcpTools.ts` (`run_report` reuses the `reportCompiler` allowlist read-only). Keys are
managed via `manage-api-keys.ts` and Settings → LLM Plugin. Auth0 setup and the ChatGPT
Apps Directory submission checklist are in `docs/llm-plugin.md`.

### Growth server (`growth/`)

A separate package and deploy, not part of the Netlify app: NeuroCann's own prospect CRM. Node + Hono + Graphile Worker on Railway Postgres, with no UI (MCP at `/mcp` plus the `growth` CLI). The public `/demo` page (`src/components/public/DemoRequestPage.tsx`) posts to `/api/growth/v1/demo-requests`. `netlify.toml` proxies that to `growth.neurocann.app`, and `vite.config.ts` proxies it to `localhost:8787` in dev. The server stores the lead, emails the team and the prospect, enriches the company (Claude web research plus state license registries), and pushes to Attio. Prospect data never goes in the product database. It has its own `package.json`, migrations (`growth/migrations/`, applied on boot) and Postgres-backed vitest suite; the root vitest excludes `growth/**`. See `growth/README.md`.

### Shared types (`shared/`)

Dependency-free TypeScript (types, `as const` data, pure functions) imported by relative path from both `src/` and `growth/`, e.g. `shared/growth/demoRequest.ts` is the demo-request wire contract. Change a contract here, not in either consumer. Rules are in `shared/README.md`.

### AI System

The `ai-parse` function sends conversation + context to Claude with a detailed system prompt covering all application domains. The AI returns structured `ProposedAction` objects. The system prompt lives inline in `netlify/functions/ai-parse.ts` and covers:
- All automated action types (trim, harvest, plant map, packages, extraction, tags, etc.)
- Human task creation for physical operations that can't be automated
- Hybrid tasks with `onCompleteAction` for physical-then-digital workflows
- Harvest Day voice weighing protocol
- Extraction pipeline vocabulary (fresh frozen → bubble hash → rosin → carts)

## Key Patterns

- **Multi-tenancy:** Every DB query must filter by `company_id` from auth context
- **Action preview → confirm → execute:** AI proposes actions, user confirms, `actionExecutor.ts` runs them
- **Dev auth bypass:** Set `VITE_DEV_BYPASS_AUTH=true` (frontend) and `DEV_BYPASS_AUTH=true` (backend) to skip Auth0 and use seed admin user
- **Status workflows:** Trim entries: `upcoming` → `active` → `submitted`. Harvests: `planning` → `active` → `submitted` → `drying` → `ready` → `completed`

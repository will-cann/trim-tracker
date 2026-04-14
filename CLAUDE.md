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
- `plantMap.ts` — Plant map module types, health system, contamination constants, room entities

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

# Metrc → NeuroCann sync (via T3)

Phases 1 and 2 of `docs/briefs/t3-metrc-sync-brief.md`: on a per-customer deploy,
NeuroCann mirrors Metrc's **items, strains, locations, packages, plant batches,
harvests and plants** for every licence the T3 login can see. Writes back to Metrc
(phase 3) are not built.

Read `docs/manifest-t3.md` first for what T3 is and how the key and `T3_MODE` work.

## Where the credentials come from (self-serve)

A company reaches Metrc one of two ways, checked in this order by
`utils/metrcConnections.ts` → `resolveMetrcCredentials(companyId)`:

1. **Its own connection** (`metrc_connections`, migration 070). A director or admin
   opens **Settings → Metrc**, follows the three steps (T3 account on a Metrc login for
   the facility, T3+ subscription, generate a secret key) and pastes the key. The
   server verifies it against T3 (`/v2/auth/whoami`, `/v2/licenses`) *before* storing
   it, encrypts it with AES-256-GCM under `METRC_CONNECTION_KEY`, and from then on
   every T3 call for that company uses that key. The key is never returned; Settings
   shows its last four characters. This is the self-serve path and needs no deploy
   per customer.
2. **The deploy key**: `T3_API_KEY` / `T3_MODE` in the site's env, but only for a
   company listed in `MANIFEST_COMPANY_IDS`. This is the original per-customer-site
   model (Proper's `proper-neurocann`) and keeps working unchanged. For the *sync*
   the allowlist must name exactly one company (`NO_SYNC_COMPANY` otherwise), so a
   site-wide key can never land in several tenants.

`METRC_CONNECTION_KEY` is a long random string (`openssl rand -base64 48`) set on the
shared production site. Without it the Settings card says the server cannot store
keys yet and the POST answers `503 SELF_SERVE_DISABLED`; everything else still works.
Rotating it makes stored keys unreadable: the card then shows the connection as
present but not connected and asks for the key again.

How the credentials flow: `utils/t3.ts` keeps them in an `AsyncLocalStorage`.
Handlers call `withT3(creds, () => …)` and every T3 helper inside that scope uses
them; outside any scope the env vars apply. `authorizeManifestRequest` resolves the
caller's credentials and returns them as `auth.t3`, so the `t3-*` functions never
look at `process.env` themselves.

### The connection card (Settings → Metrc)

`metrc-connection.ts`: `GET` status (any role), `POST { apiKey, mode? }` connect or
rotate, `PATCH { mode?, status?, syncLicenses?, verify? }`, `DELETE` (director or
admin). Mode is `read-only` by default; `live` lets the manifest picker submit
transfers after a director confirms. `status: 'paused'` keeps the key but the
scheduler skips the company (Sync now and dry runs still work). `syncLicenses`
restricts the sync to some of the licences the login sees (`null` = all).
`verify: true` re-runs the whoami/licences check and records the result or the error
on the row. A failed sync run records `last_error` on the connection; a clean real
run records `last_synced_at`.

T3 failures are translated for someone setting this up alone: a 401 becomes
`400 KEY_REJECTED` ("copy it again from …/secret-key"), unreachable/5xx becomes
`502 T3_DOWN`, and a key that works but has no T3+ or sees no licences is stored with
warnings in the response.

## Moving parts

| Piece | What it does |
|---|---|
| `metrc-connection.ts` | Self-serve connection: GET / POST / PATCH / DELETE above. |
| `utils/metrcConnections.ts` | Rules: key encryption, `resolveMetrcCredentials`, `syncCompanyIds`, `syncGate(companyId)`, `verifyKey`, wire shape. |
| `utils/metrcConnectionStore.ts` | SQL for `metrc_connections`; mocked in handler tests. |
| `cron-metrc-sync.ts` | Every 15 minutes (schedule in `netlify.toml`). For **each** company from `syncCompanyIds()` (active connections + the single allowlisted env company): inserts a `metrc_sync_runs` row with `status='queued'` and POSTs `{ runId }` to the background function. Skips a company with a run queued or running. |
| `metrc-sync-background.ts` | Netlify **background** function (15-minute limit; the caller gets 202 at once). Reads the queued run's company, resolves that company's credentials with `syncGate`, claims the run (→ `running`), pulls inside `withT3`, upserts, finishes the run. The run id is the credential. |
| `metrc-sync-start.ts` | **Sync now** / **Dry run** from Settings. Director or admin of a company that passes `syncGate`. Queues a `manual` run and kicks the background function. |
| `metrc-sync-status.ts` | What Settings shows: enabled?, source (`connection` / `env`), last runs with per-licence/per-list counts and errors, each list's cursor, totals of synced rows. |
| `utils/metrcSync.ts` | Pure rules: which lists, since when, Metrc row → NeuroCann row, lab state / status / product-type maps, change detection and the conflict report. Unit-tested with no I/O. |
| `utils/metrcSyncStore.ts` | Batched upserts over one pooled client (200 rows per statement). Metrc-owned columns are named explicitly in every `SET`. |
| `utils/metrcSyncRunner.ts` | Orchestration with T3 and the store injected. |
| `migrations/067_metrc_sync.sql`, `068_metrc_sync_phase2.sql`, `070_metrc_connections.sql` | Schema below. |

### One run at a time

`metrc_sync_runs` has a partial unique index on `(company_id) WHERE status = 'running'`.
Claiming a second run while one is running fails and marks the queued row `skipped`.
Before claiming, the function fails any run still `running` after 20 minutes (a
background function can't live that long, so it died), which is what stops a killed
lambda from wedging the sync.

### Order and cursors

Per licence, in this order so later lists can link to earlier ones:
`items` → `strains` → `locations` → `packages/active` → `packages/intransit` → `packages/inactive`
→ `plantbatches/active` → `plantbatches/inactive` → `harvests/active` → `harvests/inactive`
→ `plants/vegetative` → `plants/flowering` → `plants/inactive`. Batches come before harvests
before plants because a plant links to its batch and to the harvest it went into.

- Every list except `strains` and `locations` is incremental: `filter=lastModified__gte:<cursor − 10 min>`.
  The 10-minute overlap re-reads a few rows every run; upserts make that harmless.
- `strains` and `locations` have no `lastModified` in T3 and are always a full pull (they are small).
- With no cursor yet, every `…/inactive` list (finished packages, finished batches and
  harvests, harvested/destroyed plants) pulls the last 90 days; the others pull everything.
- The cursor for a list is the time that list's pull started, stored in `metrc_sync_state`,
  and it is only written when the list finished cleanly. A failed list keeps its old cursor
  and is retried next run; its error is on the row and in the run.
- On-hold packages are not a separate list: Metrc includes them in `packages/active` with
  `isOnHold`, which maps to `on_hold`.

The background function budgets 13 of its 15 minutes. Lists it doesn't reach are recorded as
`Out of time` and the run ends `partial`; the next run continues from the cursors.

### Resilience

- A T3 `5xx` or dropped connection on a GET is retried once after 1.5 s.
- A batch the database rejects (one row tripping a constraint fails the whole statement) is
  retried row by row; rows that still fail are counted as `failed` in the list's cell and the
  first few reasons appear in the run's errors. The list still counts as pulled and its
  cursor advances, so one odd record never blocks a list.
- Before a licence's cultivation lists, the sync asks T3 for the login's permissions on the
  plants view. Manufacturing and processing licences have none and are skipped quietly;
  a 401/403 on a cultivation list is treated the same way rather than as an error.

### Matching and who wins

- Packages match on **tag** (`packages.label`, unique per company since 067). Items on
  `(company, licence, name)`, strains and rooms on name (case-insensitive).
- A hand-entered package that matches a Metrc tag is **linked** (gets `metrc_id`) and
  from then on Metrc owns: `license_number`, `item_name`, `metrc_item_id`, `strain` (unless
  Metrc's is blank), `package_type`, `quantity`, `unit`, `location`, `status`,
  `lab_testing_state` + `metrc_lab_state`, `packaged_date`, `finished_date`, the three
  Metrc flags, `source_package_labels`, `source_harvest_names`.
- NeuroCann keeps: `notes`, `contaminants`, `waste_weight`, `harvest_id`, `trim_entry_id`,
  `source_package_id`, `input_quantity`, `tag_id`, `created_by`, and everything on plants.
- Nothing is ever deleted. A package that stops appearing on the active list is only marked
  `finished` when the inactive list says so.
- Rows whose Metrc id, `lastModified` and Metrc-owned columns already match are skipped
  (`unchanged` in the counts), so a quiet 15 minutes writes nothing.

### Cultivation (phase 2)

- **Plant batches** match on name (`plant_batches` is unique per company on name). Metrc owns
  strain, room, untracked/tracked counts, planted date and batch type; health, contaminants,
  tag and source plant stay NeuroCann's.
- **Harvests** match on Metrc id. A hand-entered harvest with the same name and no Metrc id is
  linked first so it is not duplicated. Metrc owns name, licence, strain(s), plant count, wet and
  waste weight, drying location, hold and dates. Metrc only knows active and finished, so
  **finished always wins** (`completed`); otherwise NeuroCann's own pipeline stage
  (`cutting`, `submitted`, `hanging`, `bucking`) is kept, and a `completed` row Metrc reopens
  goes back to `hanging`. New rows start as `hanging`. Synced harvests have no `created_by` (068).
- **Plants** match on tag. Metrc owns strain, room, growth phase, the phase dates, hold,
  the batch link (by Metrc batch name) and the harvest link (by Metrc harvest id). Health,
  contaminants, target harvest date and tag stay NeuroCann's. Inactive plants are `destroyed`
  when Metrc has a destroyed date, else `harvested`. Metrc mother plants are not pulled.
- Rooms created from Metrc locations start as `general`. At the end of each real run, every
  synced room still typed `general` is typed once from what Metrc put in it: mostly flowering
  plants → `flower`, mostly veg plants → `veg`, only batches → `nursery`. Rooms holding only
  packages stay `general`. A type set by hand afterwards is never changed. The plant map's
  All view derives a room's phase from this type, so an untyped veg room would open empty.

### Value maps

- **Status**: finished (or on the inactive list) → `finished`; in transit → `in_transit`
  (new value, added to the CHECK in 067); on hold → `on_hold`; else `active`.
- **Lab state**: Metrc's raw name is kept in `metrc_lab_state`; `lab_testing_state` is the
  four-value summary — `TestPassed`/`RetestPassed`/`NotRequired`/`ProcessValidated` → `passed`
  (NotRequired reads as passed, matching the picker), anything `…Failed` → `failed`,
  `SubmittedForTesting`/in-progress states → `submitted`, `NotSubmitted` → `not_submitted`.
- **Product type**: Metrc's item category → a `product_types.name`. Known categories land on
  the catalog's existing names (Buds → `flower`, Pre-Roll → `preroll`, Vape Cartridge →
  `vape_cartridge`, Edible → `edible`, …); anything else becomes its own catalog row
  (`finished`/`each` when Metrc counts it, `intermediate`/`g` when it weighs it). Catalog rows
  are created when missing, never changed.
- **Units**: Metrc's unit name is stored as-is (`Grams`, `Each`, `Milligrams`, …). The package
  card and table format by unit.
- **Rooms** created from Metrc locations get `room_type = 'general'`; the type is yours to
  change afterwards (NeuroCann-owned).

### Dry run and the first run

**Dry run** pulls everything, writes nothing, and reports how many Metrc packages match a
tag someone typed into NeuroCann by hand (no `metrc_id` yet) and, for each, which
Metrc-owned columns would change. A real run includes the same report whenever it links
hand-entered rows. Run a dry run on the Proper site before the first real sync.

## Schema (migration 067)

- `packages`: unique `(company_id, label)` (the migration refuses with a list if duplicates
  exist — merge or relabel them first), `metrc_id`, `metrc_license`, `metrc_last_modified`,
  `metrc_lab_state`, `status` may be `in_transit`, `created_by` nullable (synced rows have no author).
- `strains`, `rooms`, `plants`, `plant_batches`, `harvests`: `metrc_id`, `metrc_license`,
  `metrc_last_modified`, `metrc_synced_at`. `metrc_items`: `metrc_last_modified`.
- 068: `harvests.created_by` nullable; partial unique indexes on `(company_id, metrc_id)` for
  harvests (their upsert key), plants and plant batches.
- `metrc_sync_state` (cursor per company/licence/list) and `metrc_sync_runs` (status, counts,
  errors, report, started_by). Partial unique index: one running run per company.
- 070: `metrc_connections` — one row per company: `api_key_encrypted` (`v1:<iv>:<tag>:<ct>`),
  `api_key_hint`, `mode`, `status` (`active` / `paused`), what T3 said about the login
  (`metrc_username`, `metrc_hostname`, `has_t3plus`, `t3plus_tier`, `api_access_level`,
  `licenses`), `sync_licenses`, `last_verified_at`, `last_synced_at`, `last_error`.

```bash
node scripts/run-migration.mjs migrations/067_metrc_sync.sql           # dev branch
node scripts/run-migration.mjs migrations/068_metrc_sync_phase2.sql
node scripts/run-migration.mjs migrations/070_metrc_connections.sql
node scripts/run-migration.mjs --prod migrations/067_metrc_sync.sql    # prod, per CLAUDE.md
node scripts/run-migration.mjs --prod migrations/068_metrc_sync_phase2.sql
node scripts/run-migration.mjs --prod migrations/070_metrc_connections.sql
```

## Settings → Metrc

Always in the nav. The top card is the connection (`MetrcConnectionSection`): the
three setup steps and the key form when nothing is connected; the login, key hint,
subscription, mode, licences (tick/untick to choose what syncs) and Re-check / Pause
schedule / Replace key / Disconnect once connected; a read-only summary when the
deploy's own key applies. Only directors and admins can change it; everyone can see it.

Below it, once `metrc-sync-status` says the company can sync, the sync panel
(`MetrcSyncSection`) shows totals, the last run (status, who started it, per-licence
counts per list, errors, dry-run report), each list's cursor and last error, and recent
runs. Directors and admins get **Sync now** and **Dry run**; the panel polls every 5 s
while a run is active.

Synced packages carry a small **Metrc** marker on the card and in the detail modal, where
status buttons are hidden and location, lab state and item are disabled with a tooltip
("Comes from Metrc; change it in Metrc and it will sync here"). Notes and waste stay editable.

## Running locally

```bash
netlify dev        # not `npm run dev` — Sync now needs the functions and process.env.URL
```

Self-serve path: `.env` needs `METRC_CONNECTION_KEY` (any long random string) and the dev
`DATABASE_URL`; apply 067, 068 and 070 to the dev branch. Then Settings → Metrc → paste a
T3 key → Dry run.

Deploy-key path: `T3_API_KEY`, `T3_MODE=read-only`, `MANIFEST_COMPANY_IDS=<one company id>`
instead of a stored connection.

## Before the first real run on Proper (from the brief's risk list)

1. **Security**: remove `T3_API_KEY`, `T3_MODE` and `MANIFEST_ACCESS_CODE` from the main
   `trimtracker` site and turn `DEV_BYPASS_AUTH` off for previews that use production data.
   With a key and bypass on, any preview URL reads Proper's Metrc inventory.
2. Confirm the Proper company id and put only it in `MANIFEST_COMPANY_IDS` on `proper-neurocann`.
3. Ask Proper for a view-only Metrc employee login and regenerate the T3 key under it; the sync
   is read-only, the key is not.
4. Check with Track & Trace that the T3+ plan covers a 15-minute pull over three licences
   (a first full pull is roughly one request per 500 rows per list per licence, then only
   changed rows).
5. Dry run, read the conflict report, then Sync now.

# Metrc → NeuroCann sync (via T3)

Phase 1 of `docs/briefs/t3-metrc-sync-brief.md`: on a per-customer deploy, NeuroCann
mirrors Metrc's **items, strains, locations and packages** for every licence the T3
login can see. Plants, plant batches and harvests (phase 2) and writes back to Metrc
(phase 3) are not built.

Read `docs/manifest-t3.md` first for what T3 is and how the key and `T3_MODE` work.

## When it runs, and into which company

The sync is on when **both** are true on a Netlify site:

- `T3_API_KEY` is set (the same key the manifest picker uses), and
- `MANIFEST_COMPANY_IDS` names **exactly one** company.

That one company is where Metrc data lands. Zero or several ids and every entry point
refuses (`NO_SYNC_COMPANY`), so the shared production site — which must never have a
T3 key — can't sync by accident, and neither can a site with several tenants
allowlisted. Before a second customer gets a sync, the key and the company move into
a `metrc_connections` table (out of scope, see the brief).

For Proper: `proper-neurocann` on Netlify, `MANIFEST_COMPANY_IDS` = the new Proper
company id (not Brian's existing neurocann.app team). Confirm the id in Settings →
*Metrc via T3* on the picker (the 403 message quotes it) before the first run.

## Moving parts

| Piece | What it does |
|---|---|
| `cron-metrc-sync.ts` | Every 15 minutes (schedule in `netlify.toml`). Inserts a `metrc_sync_runs` row with `status='queued'` and POSTs `{ runId }` to the background function. Skips when a run is queued or running. |
| `metrc-sync-background.ts` | Netlify **background** function (15-minute limit; the caller gets 202 at once). Claims the queued run (→ `running`), pulls, upserts, finishes the run. Only runs a row that is queued for the allowlisted company — the run id is the credential. |
| `metrc-sync-start.ts` | **Sync now** / **Dry run** from Settings. Director or admin of the allowlisted company. Queues a `manual` run and kicks the background function. |
| `metrc-sync-status.ts` | What Settings shows: enabled?, last runs with per-licence/per-list counts and errors, each list's cursor, totals of synced rows. |
| `utils/metrcSync.ts` | Pure rules: which lists, since when, Metrc row → NeuroCann row, lab state / status / product-type maps, change detection and the conflict report. Unit-tested with no I/O. |
| `utils/metrcSyncStore.ts` | Batched upserts over one pooled client (200 rows per statement). Metrc-owned columns are named explicitly in every `SET`. |
| `utils/metrcSyncRunner.ts` | Orchestration with T3 and the store injected. |
| `migrations/067_metrc_sync.sql` | Schema below. |

### One run at a time

`metrc_sync_runs` has a partial unique index on `(company_id) WHERE status = 'running'`.
Claiming a second run while one is running fails and marks the queued row `skipped`.
Before claiming, the function fails any run still `running` after 20 minutes (a
background function can't live that long, so it died), which is what stops a killed
lambda from wedging the sync.

### Order and cursors

Per licence, in this order so later lists can link to earlier ones:
`items` → `strains` → `locations` → `packages/active` → `packages/intransit` → `packages/inactive`.

- `items` and the package lists are incremental: `filter=lastModified__gte:<cursor − 10 min>`.
  The 10-minute overlap re-reads a few rows every run; upserts make that harmless.
- `strains` and `locations` have no `lastModified` in T3 and are always a full pull (they are small).
- With no cursor yet, `packages/inactive` pulls the last 90 days; the others pull everything.
- The cursor for a list is the time that list's pull started, stored in `metrc_sync_state`,
  and it is only written when the list finished cleanly. A failed list keeps its old cursor
  and is retried next run; its error is on the row and in the run.
- On-hold packages are not a separate list: Metrc includes them in `packages/active` with
  `isOnHold`, which maps to `on_hold`.

The background function budgets 13 of its 15 minutes. Lists it doesn't reach are recorded as
`Out of time` and the run ends `partial`; the next run continues from the cursors.

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
- `metrc_sync_state` (cursor per company/licence/list) and `metrc_sync_runs` (status, counts,
  errors, report, started_by). Partial unique index: one running run per company.

```bash
node scripts/run-migration.mjs migrations/067_metrc_sync.sql           # dev branch
node scripts/run-migration.mjs --prod migrations/067_metrc_sync.sql    # prod, per CLAUDE.md
```

`harvests.created_by` is still NOT NULL; phase 2 handles it with the harvest sync.

## Settings → Metrc Sync

Appears in the main app only when `metrc-sync-status` says the sync is enabled for the
signed-in company (other tenants never see it). Shows totals, the last run (status, who
started it, per-licence counts per list, errors, dry-run report), each list's cursor and
last error, and recent runs. Directors and admins get **Sync now** and **Dry run**; the
panel polls every 5 s while a run is active.

Synced packages carry a small **Metrc** marker on the card and in the detail modal, where
status buttons are hidden and location, lab state and item are disabled with a tooltip
("Comes from Metrc; change it in Metrc and it will sync here"). Notes and waste stay editable.

## Running locally

```bash
netlify dev        # not `npm run dev` — Sync now needs the functions and process.env.URL
```

`.env`: `T3_API_KEY`, `T3_MODE=read-only`, `MANIFEST_COMPANY_IDS=<one company id>`, dev
`DATABASE_URL`. Apply 067 to the dev branch first. Then Settings → Metrc Sync → Dry run.

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

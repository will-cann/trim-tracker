# Handoff Brief: Sync Metrc data into NeuroCann via T3

Status as of 2026-10-16: **phase 1 built** (migration 067, `netlify/functions/metrc-sync-*.ts`,
`utils/metrcSync*.ts`, Settings → Metrc Sync) — see `docs/metrc-sync.md` for how it runs and what
is left before the first real run. Phases 2 and 3 not started. Read with `docs/manifest-t3.md`
(how the T3 connection works) and `docs/handoff-proper-manifest.md` (the Proper deploy).

## Goal

Keep NeuroCann's plants, plant batches, harvests and packages in step with Metrc for Proper
Cannabis, using the T3 API connection the manifest picker already has. NeuroCann becomes a
live mirror of Metrc (plus the things Metrc doesn't track: plant health, tasks, notes), so
Proper's team stops re-keying Metrc data and the picker can check tags against our own copy.

**Only the Proper company gets synced data.** Brian Larsen's existing NeuroCann team (company
`d0d34e1c-3473-4416-908e-7acda1ad2124`, used at neurocann.app) is a separate tenant and must not
receive Proper's Metrc data, even though it involves the same people and licences.

## Where things stand

- **T3 connection works.** On proper.neurocann.app, Settings → *Metrc via T3* → Check connection
  shows Metrc user `agt026642` on `mo.metrc.com`, T3+ active (basic, trialing), mode
  `read-only`, and three licences, all "can create transfers":
  - `MAN000020` — 5150 Processing LLC
  - `CUL000030` — New Growth Horizon, LLC
  - `MAN000043` — New Growth Horizon, LLC
- **Client:** `netlify/functions/utils/t3.ts` — `t3Request`, `t3Collection` (paged lists, up
  to 20 pages), `t3PackagesByLabel` (ORs up to 40 `label__eq` filters), `t3Licenses`,
  `t3WhoAmI`. `T3Package` there is the package shape we already parse.
- **Key and mode are per Netlify site** (`T3_API_KEY`, `T3_MODE`) on the `proper-neurocann`
  site. The main `trimtracker` site still has a T3 key it shouldn't have (see Risks).
- **Proper company:** being created now as a separate tenant (signed up with
  `will@neurocann.app`; Brian `blarsen@properbrands.com`, Jacob Modrusic, Nick Fedoronko added
  on its Team list). Its id goes in `MANIFEST_COMPANY_IDS` on the Proper site, replacing
  `d0d34e1c…`. **Confirm the new id before building**; the sync targets it.
- **Latency:** a single connection check took ~8 s. Every T3 call loads real metrc.com pages;
  assume seconds per call and design for that.

## Design

### Runner

- A scheduled function (every 15 min) that only enqueues, plus a **background function**
  (`metrc-sync-background.ts`, 15 min limit) that does the pulling. A normal synchronous
  function's limit isn't enough for a first full pull across three licences.
- A **Sync now** button (director+) calls the same background function.
- One run at a time per company: take a Postgres advisory lock keyed on the company id; skip if
  held.

### Which company

- Phase 1: the target company is the single id in the Proper site's `MANIFEST_COMPANY_IDS`.
  Refuse to run if that list has more or fewer than one id. Never sync into a company that isn't
  on it.
- Before a second customer: move the key off the site into a `metrc_connections` table
  (`company_id`, encrypted T3 key, mode, licences, `last_synced_at`), configured from
  Settings by an admin. The runner then loops over connections. Out of scope for phase 1, but
  keep the code shaped so the key and company come from one place.

### What it pulls

T3 mirrors Metrc's per-licence lists (`/v2/<thing>/<state>?licenseNumber=…`, paged). We already
use `/v2/packages/active`. **Confirm exact paths and filter syntax in the T3 docs
(https://api.trackandtrace.tools/v2/docs) before coding**; the ones below follow Metrc's naming
and are unverified:

| Metrc data | Likely T3 lists | NeuroCann table |
|---|---|---|
| Items | items active | `metrc_items` (exists, has `metrc_id`) |
| Strains | strains active | `strains` |
| Locations | locations active | `rooms` |
| Packages | packages active / onhold / intransit / inactive | `packages` |
| Plant batches | plantbatches active / inactive | `plant_batches` |
| Plants | plants vegetative / flowering / inactive | `plants` |
| Harvests | harvests active / inactive | `harvests` |

Run per licence, in that order (items, strains and locations first so packages and plants can
link to them).

### Incremental pulls

- First run: full pull of active lists, plus inactive lists back 90 days.
- After that: only records modified since the last successful run minus a 10-minute overlap,
  using T3's last-modified filter (confirm the operator name). Upserts make the overlap
  harmless.
- Store a cursor per (company, licence, list) in a `metrc_sync_state` table. Only advance it
  when that list finished cleanly.

### Matching and upserts

- **Plants and packages match on Metrc tag** (`label`). `plants` already has a unique
  `(company_id, label)`; `packages` doesn't (see Schema).
- Plant batches match on name, harvests on name/batch id, items on `(company_id, licence,
  name)` (existing unique), strains on name, rooms on name. Create missing strains/rooms;
  don't merge near-duplicates automatically, log them.
- Every synced row stores `metrc_id`, `metrc_license`, `metrc_last_modified`,
  `metrc_synced_at`. Rows created in NeuroCann that later appear in Metrc get linked on first
  match by tag.

### Who wins on conflict

- **Metrc wins** on what Metrc is the record of: growth phase and dates, location/room,
  quantity and unit, item, package status (on hold / in transit / finished), lab testing
  state, source packages, destroyed/harvested.
- **NeuroCann keeps** what Metrc doesn't have: plant health, contaminants, tasks, notes, trim
  data, extraction runs, anything not in the table above. The upsert must list the
  Metrc-owned columns explicitly and leave the rest untouched.
- Rows that disappear from active lists move to the matching inactive state only when an
  inactive list confirms it. Never delete NeuroCann rows.

### Mapping notes

- **Package type:** `packages.package_type` is open now (migration 046 replaced the old enum
  with the `product_types` catalog). Map from the Metrc item's product category to a
  `product_types.name`, creating catalog rows (`category = 'finished'` etc.) as needed. Proper's
  vault is mostly finished goods: edibles, vapes, pre-rolls, packaged flower.
- **Package status:** Metrc on hold → `on_hold`; finished → `finished`; in transit has no
  value in the `status` CHECK (`active | on_hold | finished | archived`). Add `in_transit`.
- **Lab state:** `lab_testing_state` only allows `not_submitted | submitted | passed |
  failed`. Metrc has more (e.g. TestPassed, NotRequired, TestFailed, SubmittedForTesting,
  RetestPassed…). Store Metrc's raw value in a new column and map to the four for the UI;
  `NotRequired` should read as passed for transfer purposes, matching `reconcile.ts`.
- **Zero quantity** is fine (migration 056 removed `quantity > 0`).
- **Plant growth phase:** `plants.growth_phase` allows `vegetative | flowering | harvested |
  destroyed`. Metrc's immature plants live in plant batches, not plants; keep that split.
- **Harvest status** CHECK (`planning | active | drying | ready | completed`) doesn't line up
  with Metrc's harvest states; map Metrc active → `drying`, finished → `completed`, and leave
  NeuroCann's own planning stages alone.

### Schema changes (one migration, before any sync code)

1. `packages`: unique `(company_id, label)` (check for existing duplicates first),
   `metrc_id BIGINT`, `metrc_license`, `metrc_last_modified`, `metrc_lab_state TEXT`; allow
   `status = 'in_transit'`; make `created_by` nullable or point synced rows at a per-company
   system user (pick one; nullable is simpler, but check queries that join `users` on it).
2. `plants`, `plant_batches`, `harvests`, `strains`, `rooms`: `metrc_id`, `metrc_license`,
   `metrc_last_modified`, `metrc_synced_at`. `harvests.created_by` has the same NOT NULL issue
   as packages.
3. `metrc_sync_state` (company, licence, list, cursor, last_success_at, last_error) and
   `metrc_sync_runs` (company, started/finished, counts per list, errors) for the Settings
   panel.

Run against the dev Neon branch first (`node scripts/run-migration.mjs …`), prod with `--prod`
per CLAUDE.md.

### UI

- Settings → *Metrc via T3* (main app, Proper company only): last sync time, per-list counts
  and errors from `metrc_sync_runs`, **Sync now**.
- Synced rows show a small "Metrc" marker; Metrc-owned fields are read-only in the UI with a
  tooltip ("comes from Metrc; change it in Metrc").
- Picker: once packages are synced, `t3-verify-packages` can read from our table first and only
  call T3 for misses or stale rows. This is a follow-up, not phase 1.

## Phases

1. **Schema migration + items, strains, locations, packages.** Packages first because it's
   what Proper uses every day (the vault, the picker). Done when a run fills Packages for all
   three licences, a second run only touches changed rows, and re-running is a no-op.
2. **Plant batches, plants, harvests.** Fills Plants and Harvest for the cultivation licence
   (`CUL000030`).
3. **Writes back to Metrc** (create packages, move plants, finish packages) through T3, gated
   by the same `T3_MODE` (`read-only` → `live`) as transfers. Separate brief.

## Tests

- Pure mapping functions (Metrc row → NeuroCann row, status/lab/phase/category maps) with
  fixtures copied from real T3 responses. Put the pure logic in a `utils/metrcSync*.ts` module
  like `utils/t3Transfer.ts`, so it tests without network or DB.
- Upsert tests asserting NeuroCann-owned columns (plant health, notes) survive a sync.
- Runner test with T3 mocked: cursor only advances on success; lock prevents overlap;
  refuses to run unless exactly one company is allowlisted.

## Risks and open questions

- **Security, fix before building:** the main `trimtracker` site still has `T3_API_KEY` set in
  every context, and `DEV_BYPASS_AUTH=true` on deploy previews and branch deploys, which skips
  login and the manifest allowlist. Anyone with a preview URL can read Proper's Metrc
  inventory. Remove `T3_API_KEY`, `T3_MODE` and `MANIFEST_ACCESS_CODE` from `trimtracker`, and
  turn the bypass off for previews that use production data.
- **T3 costs and limits:** T3+ basic is trialing; confirm the plan covers a 15-minute sync for
  three licences, and any rate limits, with Matt at Track & Trace.
- **The key is the director of ops' full Metrc login.** Sync is read-only, but the key isn't.
  Ask Proper for a view-only Metrc employee login for the sync key.
- **Unverified T3 paths and filters** (above). Check the docs or a sandbox call first.
- **Two copies of the truth during rollout:** some packages may already have been entered by
  hand in the Proper company. First run should report tag matches and conflicts (dry-run
  mode) before writing.

# Frozen Pathway Separation — Design Brief

> Status: design, not implemented

## Problem

The harvest lifecycle uses a single status enum (`planning → cutting → submitted → hanging → bucking → completed`) designed for the dry-flower pathway. Fresh Frozen harvests are forced through stages that don't apply — hanging (no drying) and bucking/Final Prep (no bins) — creating a confusing kanban where frozen harvests sit in columns that misrepresent their actual state.

Additionally, one group of plants can produce both dry and frozen material (e.g., lowers frozen while tops dry for flower, or rot-damaged portions salvaged to freezing). The current allocation model supports this as two allocations on one harvest row, but the single status enum can't represent two pathways simultaneously.

## SME Context (from harvest operations)

- **Intentional frozen**: planned in advance. Crew selects trays/platforms of cut material until target weight is reached. Whole-tray bulk selection, not plant-level.
- **Rot-driven frozen**: reactive. Mold/rot discovered mid-cut, affected portions (typically tops) salvaged to freezing. Rest of batch continues to dry flower.
- **Both can happen in the same room**, but usually one harvest batch is one pathway.
- **One group of plants can absolutely produce both dry and frozen piles** — lowers, tops, or individual plants redirected to freezing while the rest hangs.
- **Frozen material doesn't need intermediate tracking** — no "frozen bin" concept. Material goes cut → freezer → package in one session. No curing days, no burping, no "ready" gate. Just bulk weight in, package out.
- **Trays are not a tracked unit** — frozen weight is bulk, measured once at cut time.

## Proposed Design

### Two pathway-specific state machines

**Dry pathway** (unchanged):
```
planning → cutting → submitted → hanging → final_prep → completed
```
- `submitted`: total wet weight recorded
- `hanging`: drying room assigned, drying days tracked
- `final_prep`: dry flower bucked into tagged bins, bins cure, bins marked ready, bins sent to trim
- `completed`: all flower allocations sent to trim

**Frozen pathway** (new, compressed):
```
planning → cutting → submitted → completed
```
- `cutting`: stays here until frozen weight is entered
- `submitted`: weight locked, awaiting package creation against frozen allocation
- `completed`: auto-advances when all frozen allocation packages exist
- **Never touches `hanging` or `final_prep`** — those stages don't apply

### Planning-time split

At planning, user declares allocation intent:
- "100% dry flower" → single dry-pathway harvest
- "100% fresh frozen" → single frozen-pathway harvest
- "60% dry, 40% frozen" → intent recorded; physical split happens at cutting

### Cutting-time batch split

When a planned harvest has both dry and frozen allocations and enters cutting:

1. User enters the frozen weight (bulk, from tray selection or rot salvage)
2. System auto-creates a **frozen daughter batch** with:
   - Same strain, license, plant references
   - Frozen allocation with the entered weight
   - Status: `cutting` (advances to `submitted` once weight is confirmed)
   - Batch ID: parent batch ID + `[FF]` suffix (e.g., `032626[LIC-123456]BD-FF`)
3. The **parent harvest** retains the dry allocation with remaining weight
4. Both batches are pathway-pure from this point forward
5. UI shows the split as a confirmation: "Created frozen batch BD-FF (14.8kg). Remaining dry: 32.1kg."

The user currently creates the second batch manually. This automates that step while keeping the user informed.

### Pathway detection

**Short term (frontend only, no migration):** Infer pathway from allocations:
- `frozen allocation > 0 && flower allocation === 0` → frozen pathway
- `flower allocation > 0 && frozen allocation === 0` → dry pathway
- Both → pre-split (planning stage only; should not persist past cutting)

**Long term (with migration):** Add `pathway: 'dry' | 'frozen'` column to `harvests` table. Set explicitly at batch creation (or at cutting-time split). More reliable than inference, required for clean queries and METRC reporting.

### Kanban rendering

Option A (recommended): **Filter toggle** — "All | Dry | Frozen" pills above the kanban. Each filter shows only the relevant columns:
- Dry: all 6 columns
- Frozen: Planning, Cutting, Submitted, Completed (4 columns, no Hanging/Final Prep)
- All: all 6 columns, but frozen harvests skip Hanging/Final Prep visually (they jump from Submitted to Completed)

Option B: **Two separate kanban boards** — separate tabs or stacked boards. Cleaner separation but adds navigation overhead.

### Frozen pathway UI

Since frozen is compressed (no hanging, no bins, no cure), the frozen harvest card in Submitted is simple:
- Shows: strain, batch ID, frozen weight, license
- Primary action: "Create Package" (creates the package row, marks allocation complete)
- Auto-advance: when all frozen allocations have packages → harvest moves to `completed`
- No bin management, no cure logging, no drying room assignment

## METRC Integration Touchpoints

Deferred to METRC Phase 1 (see `docs/briefs/project_metrc_integration.md`), but flagged here:

1. **Plant-level harvest events**: METRC requires individual plant harvest reports. For bulk-weight frozen batches, the system will need to map "14.8kg frozen from batch XYZ" to specific plant IDs — either proportional split or explicit plant selection at cut time.
2. **Manicure batch creation**: frozen harvests create a "manicure batch" in METRC (wet, unprocessed). Package creation against frozen allocation will trigger the METRC package event.
3. **Weight submissions**: METRC requires weight at harvest (wet) and at package (may differ if moisture loss during freezing). The frozen pathway captures wet weight at cutting; package weight is entered at packaging.

## Implementation Plan

### Phase 1: Frontend pathway awareness (no migration)
- Derive `pathway` from allocations in the frontend Harvest type
- Hide Hanging and Final Prep columns for frozen harvests in kanban
- Show pathway-specific status hints on kanban cards
- Frozen cards in Submitted show "Create Package" as primary action
- ~2-3 hours

### Phase 2: Cutting-time auto-split
- New API endpoint or extension of `updateHarvest`: when a mixed-allocation harvest enters cutting and frozen weight is provided, auto-create the frozen daughter batch
- UI: weight entry form during cutting that triggers the split
- Migration: add `parent_harvest_id` nullable FK to `harvests` for tracking lineage
- ~4-6 hours

### Phase 3: Auto-completion
- When all frozen allocation packages exist → auto-advance harvest to `completed`
- Backend trigger: after package creation, check if harvest's frozen allocations are fully packaged
- ~1-2 hours

### Phase 4: Pathway column (optional, recommended)
- Migration: add `pathway` column to `harvests` (`'dry' | 'frozen'`)
- Backfill from existing allocations
- Replace frontend inference with DB field
- ~1-2 hours

## Files Likely Touched

- `src/components/Harvest/HarvestKanban.tsx` — column filtering by pathway
- `src/components/Harvest/HarvestDashboard.tsx` — pathway filter toggle
- `src/components/Harvest/HarvestCard.tsx` — pathway-specific card rendering
- `src/types/definitions.ts` — Harvest type extension
- `netlify/functions/update-harvest.ts` — auto-split logic
- `netlify/functions/create-package.ts` — auto-completion trigger
- `migrations/NNNN_harvest_pathway.sql` — pathway column + parent_harvest_id FK

## Open Questions

1. **Batch ID format for frozen daughters**: `BD-FF` suffix? Or separate numbering? Needs to be METRC-compatible eventually.
2. **Existing mixed-allocation harvests**: should the backfill migration auto-split them, or leave them as-is and only apply the new model going forward?
3. **Rot-driven frozen at scale**: if rot is discovered on 3 of 200 plants, does the frozen daughter batch reference just those 3 plants? Or is it weight-only with no plant linkage until METRC integration?

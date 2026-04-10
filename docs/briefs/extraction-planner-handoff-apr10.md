# Extraction Workflow + Demand Planner — Session Handoff

**Date:** 2026-04-10
**Branch:** main (pushed)
**Commits this session:** ~45 commits from `e952373` to `c02fec9`

---

## What shipped

A full end-to-end demand-backward planning system for extraction, plus a supporting product catalog, SOP library, and Settings management UI.

### Sprint 1 — Catalog-Driven SOPs
- **Migration 048**: `producible_outputs TEXT[]` + `standard_batch_size_g` on `process_templates`
- Replaced all hardcoded `MATERIAL_LABELS` / `PRODUCT_VARIANTS` across `ProcessTemplateList.tsx`, `StartRunModal.tsx`, `FinishRunModal.tsx` with runtime data from the `product_types` catalog
- SOP editor now has "Accepts", "Produces", and "Min batch" fields on the template header
- FinishRunModal constrains output types to the SOP's declared `producible_outputs`

### Sprint 2 — Yield Intelligence + Supply Hooks
- **`get-yield-averages.ts`** endpoint — aggregates `extraction_logs` by `(strain, input_type, output_type)`
- **`get-step-supply-requirements.ts`** endpoint
- `update-run-step.ts` now auto-decrements `supply_items` and writes `supply_ledger` entries on step completion via `step_supply_requirements` lookup
- SOP editor has a per-step "Supplies consumed" section with item picker + quantity
- FinishRunModal shows below-par supply alerts

### Sprint 3 — Demand-Backward Planning Engine
- **`plan-backward.ts`** endpoint — walks SOPs in reverse, applies historical or template yields, returns stages + biomass gap + supply needs
- Chains across templates via `producible_outputs → accepted_inputs` matching (e.g. distillate can start from BHO-produced crude)
- **`PlanningCalculator.tsx`** UI with sentence-style form ("I need 500 g of Rosin, from Blue Dream")
- AI tool `plan_backward` added to `ai-parse.ts` so the AI can answer demand questions conversationally
- **Tabbed ExtractionDashboard** — Runs / Processes / Planning

### Product Catalog Management
- **Migration 049**: seeded 18 BHO/solventless/distillate product variants (shatter, wax, crumble, live resin diamonds/sugar/sauce/badder, etc.)
- **Migration 050**: `process_types TEXT[]` on `product_types` tagging pathway membership
- **Migration 052**: added `bho_concentrate` to catalog (was rendering as raw snake_case in legacy preset)
- **Settings → Product Catalog** — full inline-editable table with category filter pills, pathway toggles, cannabis checkbox, soft-delete

### SOP Library (Migration 051)
Seeded 20 preset SOPs for new companies:
- **Solventless (6):** FF→Bubble Hash, FF→Live Rosin Jar/Badder/Carts, Dry Flower→Rosin, Dry Trim→Dry Sift
- **BHO (8):** FF→Live Resin Badder/Diamonds&Sauce/Sugar/Shatter, Dry Trim→Shatter/Wax/Crumble, FF→Live Resin Pens
- **Distillate (4):** Trim→Distillate, Trim→Carts, Crude→Distillate, Trim→Isolate
- **Custom (2):** Pre-Roll Pack, Infused Pre-Rolls

All seeded yields reflect Holland's SME correction on the fresh frozen vs dry heuristic (see memory: `project_fresh_frozen_moisture_heuristic.md`).

### Quality-of-Life Fixes
- **Gantt view** shows active runs even without `plannedStart` (falls back to `createdAt`, adds "Unassigned" lane for runs without equipment)
- **StartRunModal** 4-step progress indicator, preset date picker ("Now / Tomorrow 7am / Monday 7am / Pick date"), cycle-count display (no more "press can only handle 60g" warning — shows "3 cycles needed" instead)
- **Planning form** mobile-responsive, strain dropdown filters by target SOP's accepted biomass types with type breakdown in labels
- **Planner ranking** — when multiple SOPs produce the same output, prefer pathway match then shortest chain, emits warning listing alternatives
- **Product dropdown** filters to only products at least one SOP can produce

---

## Current state on production (neurocann.app)

- All 52 migrations applied to live DB
- 12 companies have full catalog + SOP library seeded
- Planning tab is functional and tested through several scenarios
- AI `plan_backward` tool is live

### Known data issues
1. **Duplicate template rows** — each preset has ~12 copies per company (from seeder running across multiple dev sessions). The idempotency check in `_seed_sop()` prevents future dupes but doesn't clean up historical ones. Cleanup script needed.
2. **A few templates have stale `producible_outputs`** from user clicks in the editor before we fixed the GET column bug. Cleaned up the BHO→rosin_cart case manually; may be others.

---

## What's still broken / incomplete

### Explicit gaps
1. **Supply inventory seed data** — the supply items system exists but no supplies are seeded, so planning shows empty "Supplies Needed" sections. No blocker, just less useful.
2. **Historical yield data** — `extraction_logs` is empty for most strains, so the planner falls back to template yields. Gets better as operators actually run extractions.
3. **Working hours / shift scheduling** — the scheduler doesn't model attended vs unattended steps. Freeze dryer runs overnight without issue but press steps assume 24/7 availability. See memory: `project_working_hours_scheduling.md`.
4. **Multi-run planning sessions (Sprint 4)** — not started. The planner emits a single-run waterfall; no way yet to say "break this into 3 runs of 500g each."
5. **Cost intelligence** — no vendor pricing integration in plans yet.

### Polish punch list
- "Other strains" / "No compatible stock" label can be clearer when a specific biomass is expected but absent
- Error states on `plan-backward` return raw `message` — could format more helpfully
- No loading skeleton on the Planning tab while catalog/templates load
- StartRunModal's date picker doesn't surface weekends differently
- Process Catalog table columns crowd on narrow viewports even after the polish pass

---

## Key architectural decisions (don't forget)

1. **Pathway tags describe what a process PRODUCES, not what it accepts** — so SOP "Accepts" is pathway-agnostic (distillate can start from BHO crude), but "Produces" is filtered by the template's process type.

2. **Fresh frozen ≠ dry** — FF is ~80% water. For solventless pathways, dry flower yields ~4-5× FF; trim is half to a third of flower. BHO/distillate are much less moisture-sensitive. All seeded yields reflect this.

3. **SOP chaining happens at the planning layer, not in templates** — each SOP is self-contained. The planner connects them via `producible_outputs → accepted_inputs` matching across templates. See memory: `project_sop_chaining.md`.

4. **Product catalog pathway tag rules** — biomass/additives have empty `processTypes` (universal). Intermediates/finished have specific pathway tags. The SOP editor's "Produces" picker filters to matching types.

5. **Yield data is grouped by `(strain, input_package_type, output_package_type)`** — fresh frozen and dry material yields stay separate in the historical averages.

---

## Things worth considering next

Ordered roughly by value vs. effort:

1. **Dedupe the duplicated preset templates** — one-off cleanup script that keeps the oldest `is_preset=true` per `(company_id, name)` and deletes the rest. ~15 min.

2. **Sankey diagram for the planner** — already scoped in memory (`project_demand_planner_sankey.md`). Once `plan-backward` returns multi-source/multi-product shapes, drop in `visx/sankey`. This is the visualization that best matches Holland's mental model.

3. **Sprint 4: Planning Sessions** — `planning_sessions` table, "Create Runs from Plan" flow, cost tracking, vendor pricing integration. This closes the loop from demand → executable runs → real yield data.

4. **Recording actual yields** — the planner improves dramatically once `extraction_logs` has real data per strain. The infrastructure exists; just need real runs happening. Nothing to build, just patience.

5. **SOP library → installable library → community marketplace** — full vision in memory (`project_sop_library_community.md`). Current seed SOPs are step 1. Step 2 is a browsable library of validated SOPs. Step 3 is user contributions.

6. **METRC integration** — Holland's hard blocker. 4-phase plan in memory (`project_metrc_integration.md`). Nothing done here yet but the SOP + package infrastructure is ready to feed it.

7. **Supply reordering for lab techs** — the other Holland blocker. Supply inventory exists; needs a tech-facing "request reorder" flow. Small UI lift.

---

## Memory updates this session

New:
- `project_sop_chaining.md`
- `project_working_hours_scheduling.md`
- `project_sop_library_community.md`
- `project_demand_planner_sankey.md`
- `project_fresh_frozen_moisture_heuristic.md`

Removed (fixed bugs):
- `project_extraction_run_submission_bug.md`
- `project_extraction_sop_fixes.md`

---

## How to pick up where we left off

1. Pull `main` — all commits pushed
2. Run any unapplied migrations: `node scripts/run-migration.mjs migrations/048_*.sql` through `052_*.sql` (all already applied to prod, but check if local DB is behind)
3. `npm run dev` + `netlify dev` in parallel
4. Test the Planning tab with "500 g Rosin" and a dry-flower-stocked strain
5. If continuing: Sprint 4 is the natural next step, or tackle the dedupe script as a warm-up

Final commit on main: `c02fec9 fix(planner): strain availability should match selected target's SOP inputs`

# Holland SME Call #2 — Extraction Workflow Feedback

## P4 implementation status (Apr 2026)

### Landed

**Supplier CRM + email (original P4 batch, 10 units):**
- Demand-planning inventory overlay — on-hand inputs shown alongside
  demand-backward requirements so the gap to source is explicit.
- Biomass supplier type on vendors — distinguishes fresh-frozen / flower
  suppliers from consumables vendors for outreach and ordering.
- Email-based supplier CRM — outbound via `netlify/functions/send-supplier-email.ts`,
  inbound via `netlify/functions/receive-email.ts` behind SendGrid Inbound Parse on
  `replies.neurocann.app`, threads in `contact_threads`/`contact_messages`, AI
  `compose_supplier_email` action with editable preview, Claude-parsed inbound
  bodies into `vendor_products`.
- Outreach reminders — follow-up `human_tasks` generated when a supplier thread
  goes stale past its `outreach_cadence_days`.
- Vendor CRUD AI tools — `create_vendor` / `update_vendor` / `delete_vendor`
  with editable previews (chip-array editor for `strainsGrown`, dropdowns for
  `vendorType` and `preferredChannel`).
- Context-aware Cadence column — order cadence for consumables, outreach
  cadence for biomass suppliers.

**Variety planner (Track A + δ.1):**
- Strain variety metadata — `phenotype` (sativa/indica/hybrid) and
  `terpeneTags` (canonical 9-bucket taxonomy, up to 3 per strain: gassy,
  citrus, floral, sweet_dessert, earthy_pine, creamy, fruit, spicy_herbal,
  candy) on the strain row. Columns added in migration 063.
- AI `create_strain` / `update_strain` tools accept the new variety fields
  with strict enum mapping for free-form terpene descriptions.
- Variety-blend targets in the demand planner — operators can say *"5000
  rosin pens, 4 strains, 1 sativa, 1 indica, 2 hybrid"* via a new variety
  option on the target form. The client-side solver
  (`src/components/Extraction/varietySolver.ts`) expands a variety target
  into N single-strain targets ranked by on-hand biomass, then hands them
  to `plan-backward` unchanged. Partial fulfillment surfaces as a warning
  ("Requested 2 hybrids, catalog has 1 — slot unfilled") instead of silent
  skip. Variety spec persists in the existing `planning_sessions.targets`
  JSONB column (no migration needed; re-expands against current catalog on
  load).
- Planning tab resilience — `Promise.allSettled` + inline retry banner so
  a single failed endpoint doesn't brick the whole tab (motivated by the
  mid-deploy outage where `get-strains` 500'd against the dropped
  `avg_cost_per_g` column).

**Design corrections:**
- `strains.avg_cost_per_g` dropped (migration 064). Cost varies by product
  form (fresh frozen vs dry flower vs trim vs shake) and supplier, so it
  belongs in `vendor_products`, aggregated at query time.
- `strains.expected_yield_pct` dropped (migration 065). Same flaw: yield
  only exists in the context of an extraction route (FF→bubble hash ≈ 8%,
  FF→live rosin ≈ 4%, dry trim→rosin ≈ 20%). Per-route yield lives in
  `strain_yield_overrides` + `extraction_logs`; cultivation yield (per
  plant / sq ft) is a future harvest-aggregation concern.

### Next up when we resume

**δ.2 — Cost + yield filter for the variety planner**
- New `netlify/functions/get-strain-pricing.ts` aggregator: reads
  `vendor_products` grouped by strain × input type, returns
  `{ avgPricePerG, minPricePerG, maxPricePerG, lastPricePerG, vendorCount }`.
- New yield aggregator reading `strain_yield_overrides` + `extraction_logs`
  keyed by strain × templateId × inputType × outputType.
- Extend `VarietySpec` with `costMaxPerG?: { inputType, max }` and
  `yieldMin?: { templateId, inputType, outputType, minPct }` — scoped to
  specific extraction routes, not strain-global.
- Planner UI: cost-per-gram column on each variety row; yield badge
  keyed to the target's SOP.

**δ.3 — AI tool for variety targets**
- New tool schema so the AI can emit variety-mode targets directly from
  phrasings like *"plan 5000 rosin pens across 4 strains, one sativa,
  one indica, two hybrid."*
- Sequenced after δ.2 so the tool's shape lands once, with cost/yield
  filters built in from day one.

**Track B+C — Global strain catalog (lower priority)**
- Seed ~30 common strains with canonical phenotype + terpene attributes.
- Suggest-on-create fuzzy match: when an operator adds "Wedding Cake,"
  offer to prefill variety attributes from the shared catalog.

### Explicitly out of scope for this slice

- METRC integration (creation, adjustments, lab results, sync).
- SMS notifications or SMS-based CRM (schema-ready, not wired).
- Inventory snapshots (`inventory_snapshots` table / cron).
- Multi-run planning sessions (batched planning across simultaneous runs).
- Working-hours / shift-aware scheduling for multi-day runs.
- Weighted balance in variety targets (currently always 'even' —
  `quantity / N` per chosen strain).

### Testing state as of pause

- PRs #23, #24, #25, #26, #27 merged to main.
- Migration 065 applied to dev. **Prod migration pending** — must run
  `node scripts/run-migration.mjs --prod migrations/065_drop_strain_expected_yield.sql`
  after Netlify deploys main (same drop-column ordering as PR #22 / migration 064).
- Variety planner end-to-end not yet validated in-app — next session
  should start there: verify `"4 strains: 1 sativa, 1 indica, 2 hybrid"`
  in the UI produces 4 per-strain plan rows with correct quantity split
  and surfaces warnings for under-stocked phenotypes.
- No regressions expected in single-strain / any-strain planning; solver
  passes variety-less targets through unchanged (8 unit tests in
  `varietySolver.test.ts` cover the expansion math + partial fulfillment
  warnings).

---


**Date:** April 9, 2026
**Participants:** Will Parkhurst, Holland (extraction consultant)
**Context:** Follow-up to the March 30 SME call. Holland operates across Cherry, Fusion, Hybrid, with Buffalo and Maryland facilities planned. Runs a wholesale rosin program sourcing external fresh frozen, managing remote lab techs, and handling METRC compliance through a third-party admin (Caitlyn).

---

## Meeting Summary

Demo walkthrough of current extraction SOP editor, run lifecycle, and inventory model. Holland provided feedback on planning workflows, batch sizing, sourcing, and what would make the app useful to him today.

---

## Key Findings

### 1. Demand-backward planning is the primary workflow

Holland's planning starts from sales demand, not from available inventory:

```
"I need 1,000 carts"
  → need ~500g rosin
  → at 3.5% yield, need ~35 lbs fresh frozen
  → source from garden X at $65/lb or garden Y at $100/lb
```

This is the inverse of our current run-creation flow (pick inventory on hand → start a run). Both models are valid — vertically integrated facilities start from inventory, wholesale/contract extractors start from demand. The system needs to support both directions.

**Implication:** Run planning should accept a target output quantity and reverse-engineer input requirements using historical yield data per strain.

### 2. Batch sizes are standardized around testing minimums

- Testing requires 500g minimum per batch in most states
- A single wash typically yields ~500g of bubble hash
- Holland does 2-3 washes of a strain, combining into a 1,000-1,500g batch
- Equipment also constrains batch size (PurePressure Bruteless = 17,000g input capacity)
- Batch sizes are always in increments of 500g

**Implication:** SOPs or equipment profiles need a `standardBatchSizeGrams` field. The system should use it for planning estimates and soft validation ("this is 2x your standard batch — confirm?"), never as a hard block.

### 3. Cycle time is fixed, not input-dependent

A wash takes ~4.5 hours regardless of whether it's 10,000g or 17,000g of input. Holland can do 1-3 washes per day depending on his schedule. This validates our current SOP model where step durations are fixed constants rather than scaling with input weight.

**Implication:** No need to build time-scaling logic into SOP steps. Keep durations as fixed estimates per step.

### 4. External fresh frozen sourcing is ~1/3 of the job

Holland acquires material from external gardens at negotiated rates:
- Gave genetics to a grower, gets first refusal at $65/lb
- Buys from new gardens at $100-160/lb after negotiation
- Evaluates new suppliers on-site before first purchase
- Seasonal demand spikes (420, 710) require forward planning months in advance

He explicitly said a system that tracked supplier relationships, pricing history, and available strains — and could do automated outreach — would turn the app into "my assistant."

**Implication:** A lightweight supplier/grower CRM is high-value for the contract extractor persona. Not a marketplace — just a contacts + history + reminder system.

### 5. Two hard blockers to real adoption

Holland was direct about what he needs before the app replaces any part of his workflow:

1. **METRC API integration.** Without it, every run still requires a phone call to Caitlyn to manually enter packages, transfers, and inventory adjustments. He described spending 45+ minutes on calls dictating batch numbers and weights. "Reorders and METRC API — you solve a lot of problems for me."

2. **Consumable reordering for lab techs.** His techs in Maryland and Buffalo will call him to order press bags, silicone papers, wash bags, etc. The app should let techs see what they need and trigger reorders without calling Holland. "Your app should be able to do that for us."

### 6. Technician experience = notifications + task list

Holland's vision for the tech-facing app is minimal:
- Show up, get a push notification with today's tasks
- Green-check each task when done
- Accountability: "why did you green-check it if it's not done?"
- No complex UI needed — just the task list and a check button

He suggested SMS/text as a faster proof of concept than building and shipping a native app.

### 7. Security and data integrity

Holland's father (network security background) raised the disgruntled employee scenario: what stops someone from nuking data right before being fired?

Mitigations discussed:
- Compliance actions gated behind manager approval (already planned)
- RBAC with department scoping (already planned)
- Immediate account deactivation before termination
- **New:** Point-in-time inventory snapshots for rollback (e.g., every 6 hours)

### 8. Potential design partner: Maryland facility

Holland is setting up a facility in Maryland with a well-capitalized partner (Jordan). Key attributes:
- Holland is the sole decision-maker on operations
- Indoor + outdoor + light dep + modular extraction unit
- Owner-operator model with small team
- Cultivation, trimming, tissue culture, extraction all in scope
- Partner has significant capital available
- "Anything we say goes" — ideal for a design partnership

---

## Roadmap Alignment

### Already covered by existing plans

| Feedback | Existing work |
|---|---|
| SOP-driven daily task lists for techs | SOP workflow templates |
| Equipment capacity as planning hint | Extraction throughput modeling |
| Push notifications for task assignments | Notifications service |
| Historical yield-based estimates | Yield estimate tracking |
| METRC API integration | METRC integration plan (4-phase) |
| Consumable/supply tracking per SOP step | SOP I/O products |

### New items to add

#### Demand-backward planning mode
**Priority:** High
**Effort:** Medium

A planning flow that starts from a target output ("I need 500g of rosin") and works backward through yield assumptions to determine input requirements. Surfaces what's on hand vs. what needs to be sourced. Could be conversational (AI chat) or a dedicated planning view.

This is distinct from run creation. A planning session might produce multiple runs across multiple days.

#### Supplier CRM for fresh frozen sourcing
**Priority:** Medium (high for contract extractor persona)
**Effort:** Medium

Track external growers/suppliers: contact info, strains available, pricing history, quality notes, last purchase date. Enable reminders ("you bought from this grower last June for 710 prep — time to reach out again"). Future: automated email/voice outreach.

Not a marketplace. Just a contacts + history system that makes sourcing less manual.

#### Standard batch size field
**Priority:** Low
**Effort:** Small

Add `standard_batch_size_grams` to SOPs or equipment profiles. Use for planning estimates and soft warnings. Always in increments of 500g for testing compliance.

#### Inventory snapshots for rollback
**Priority:** Low
**Effort:** Small

Periodic snapshots of inventory state (e.g., every 6 hours via cron). Enables recovery from accidental or malicious data changes. Simple implementation: dump current inventory quantities to a `inventory_snapshots` table with timestamp.

#### SMS task notifications (tactical MVP)
**Priority:** Medium
**Effort:** Small

Before a native mobile app, wire up SMS delivery of daily task assignments. Morning message with the day's tasks, reply to mark complete. Twilio or similar. Holland explicitly suggested this as the faster path.

### Explicitly out of scope (for now)

- **Fresh frozen marketplace / network** — requires network effects, is a separate product
- **Amazon/vendor purchasing integration** — too complex; simple low-stock alerts are sufficient
- **Voice agent for supplier outreach** — compelling but premature; needs the supplier CRM first

# NeuroCann Roadmap

Planned features, integrations, and improvements. Updated as priorities evolve.

> Last updated: 2026-04-13

---

## Product Catalog & Custom Categories

### Product/Item System
- New top-level entity: Product catalog with templates
- Products define: name, UOM (weight vs. each), required inputs (bill of materials), production steps
- Example: "Rosin Vape Pen" requires 0.5g decarbed rosin + 1 hardware unit, requires filling, sold in each
- Creating a production run (e.g., 100 pens of a specific strain) generates packages from the product template
- Packages are instances of products

### Custom Sort Categories
- Replace hardcoded flower/shake/trim/waste categories with operator-defined sort categories
- Each operator configures their own sort types to match their operation
- Sort categories map to products in the catalog (e.g., "tops" maps to a flower product, "larf" maps to fresh frozen)

### Package Allocation & Run Planning
- Planning board for grouping packages into upcoming production runs
- Packages can be earmarked for specific extraction methods or products
- Allocation status reflected in inventory (e.g., "allocated to ice water run 03/15")
- Visual: what's available vs. what's committed

---

## Harvest Page Overhaul

- **Needs SME input (Brian or similar)** before implementation
- Audit current status workflow (`planning → active → submitted → drying → ready → completed`) against real operations
- ~~Rethink tab/filter UX — current drying vs. planning vs. ready view isn't well structured~~ **Done** — 4-stage pipeline built: upcoming, in progress, drying, finished
- Better sorting and filtering throughout
- Ensure status transitions reflect what actually happens on the floor
- **Harvest Day cockpit built** — live weighing ops tool with allocation-type mode switching (flower/frozen/both)
- **Moisture loss tracking built** — `moisture_loss_pct` on harvests (default 75%), estimated dry weight calculated for trim entries, progress bars use dry weight baseline

### Frozen Pathway Separation
- Current harvest lifecycle assumes dry-flower path; frozen harvests are forced through stages that don't apply (hanging, bucking)
- **Proposed:** Two pathway-specific state machines sharing `planning → cutting` then diverging:
  - Dry: `submitted → hanging → final_prep → completed` (unchanged)
  - Frozen: `submitted → completed` (compressed — no drying, no bins, bulk weight to package)
- **Planning-time split:** one harvest can declare intent for both dry + frozen allocations
- **Cutting-time auto-split:** system creates two daughter batches when both pathways are present, each pathway-pure from that point
- **Frozen material doesn't need intermediate tracking** — no bin concept, just bulk weight → package
- **Design brief:** `docs/briefs/frozen-pathway-separation.md`

---

## Plant Lifecycle & SOPs

### Plant Batch SOPs
- Define a standard operating procedure at the plant batch level
- SOP is a repeatable lifecycle plan: sequence of procedures a batch goes through (up-pot, flip, defoliation, IPM treatments, etc.)
- On batch creation, system auto-generates tasks from the SOP template with estimated dates
- SOPs can be adjusted post-creation via individual task edits
- Templates are reusable across batches (e.g., "8-week flower cycle with weekly IPM")
- **Design note:** physical task completion should auto-queue AI to execute METRC compliance equivalent (physical→compliance chain)
- **Data model sketch:** `sop_templates` → `sop_task_definitions` → `scheduled_tasks`; design before METRC integration

### Plant Tagging & Compliance
- Physical tags from printed rolls with sequential METRC numbers
- Users select a starting tag from available inventory; system assigns sequentially
- **Current state:** silent auto-tagging placeholder — needs starting tag selector UI before METRC goes live
- Tag assignment UI belongs on phase promotion flow (nursery→veg, veg→flower), not on plant creation
- Batch tags vs. individual plant tags follow METRC lifecycle model

### License Scoping
- Plants need `license_number` column (currently missing)
- Rooms are NOT license-scoped — a single room can hold plants from multiple licenses (e.g., med + rec in Colorado)
- Future: add license to plants table, auto-fill harvest license from selected plants, group plant pickers by license within rooms

### Strain Custom Fields
- Strains need a "stretch" trait (low/medium/high) for canopy planning
- Future: user-defined custom columns (feeding schedule, IPM schedule, plant orders)
- Recommend flexible schema (JSONB or key-value table) over individual columns

### Room Types
- Rooms get a type label that drives behavior throughout the app:
  - **Nursery** — clone/seed starting
  - **Veg Room** — vegetative growth
  - **Flower Room** — flowering
  - **Drying Room** — post-harvest drying
  - **Trimming Room** — trim operations
  - **Harvest Operations Room** — harvest day processing
  - **Dry Storage** — cured product storage
  - **Cold Storage** — fresh frozen, freezer storage
  - **Equipment Storage** — tools, hardware
  - **Nutrient Mixing Room** — feed preparation
- Room type constrains location selection contextually (drying plants → only drying rooms, freezing packages → only cold storage)
- Room type informs what UI/actions are relevant when viewing that room

### Room Capacity & Movement Planning
- `rooms.capacity` column and `Room.capacity` type already exist — needs to be surfaced in UI
- **Room cards (RoomCard.tsx):** show `12 / 50 plants` instead of just `12 plants` when capacity is set
- **Plant movement modal (PlantActionModal.tsx):** room selection grid should display current count vs. capacity for each target room, with visual indicator (green/yellow/red) for available space
- **Warn on over-capacity:** soft warning when a move would exceed capacity (don't block — real ops sometimes overfill temporarily)
- **Room creation/edit:** capacity field already accepted by `manage-room.ts`, ensure it's prominent in room setup UI
- Applies to grow rooms (nursery, veg, flower) — not relevant for storage/equipment rooms

### Plant Map — Full Facility View
- Show all rooms across all phases in a single view
- Current view is phase-tabbed; add an "All Rooms" option showing the full facility layout

---

## AI Agent

### Expanded Context
- Give the AI access to more data — historical yields, full package inventory, room details, strain performance
- Enable the AI to run SQL queries against the database to generate reports on demand
- Users can ask questions like "what was our average yield on OG Kush last quarter" and get real answers

### Sub-Agents
- Explore specialized sub-agents for different domains (extraction, cultivation, compliance)
- TBD on architecture and scope

### Assign-to-AI Tasks
- Planned "Assign to AI" button for bot-executable tasks from ambient voice transcription
- **Runtime:** Anthropic Managed Agents (`/v1/agents`, `/v1/sessions`) — one persisted agent per company per tier (Opus/Haiku), one session per task. Custom tools wrap existing `ProposedAction` handlers; credentials stay host-side.
- **Build order before UI:** (1) bot service account / audit identity, (2) action type allowlist (safe-only: record_wet_weight, etc.; never destructive), (3) new task statuses `ai_pending` / `ai_running` / `ai_failed`, (4) `ai_task_events` audit table with `UNIQUE (session_id, event_id)` for stream-reconnect dedup, (5) `ai-task-runner.ts` + `ai-task-approve.ts` Netlify functions, (6) UI button only for allowlisted actions
- **`always_ask` is emulated in the handler**, not configured on the agent — built-in policy only covers server-executed tools, not custom tools. Gate maps to `ai_pending` status rendered in our UI.
- Alternative path: AI-assisted confirmation (one-tap human approval) for non-allowlisted actions
- **Design brief:** `docs/briefs/assign-to-ai-managed-agents-brief.md`

### Eval Framework
- **Built:** Python + pytest suite at `tests/eval/` — 103 test cases across 5 areas (silence chunking, intent classification, entity extraction, edge cases, end-to-end)
- 40 chunking tests pass without fixtures
- **Next:** record fixtures via `pytest --eval-mode=record` against live netlify dev (~$1.70 in Sonnet tokens), then run freely with `pytest --eval-mode=mock`

### Ambient Mode (deferred — deletion planned)
- **Out of scope short term.** Deferred until chat-mode chunking + intent quality are measured and more of the pathways ambient needs to execute are working in chat mode first.
- **Planned action:** delete the dormant `AmbientProvider` + `AmbientActionCenter` UI/lifecycle layer from main (~1,700 LOC, currently flag-off and unreachable). Keep the `ambientChunker.ts` primitive since it's already reused in `ChatPanel` and is directly applicable to chat-mode chunking work.
- **Revive strategy:** tag `ambient-v1-dormant` before deletion; when ambient comes back on the roadmap, reference the tag + deletion brief rather than trying to revert — integration points will have drifted.
- **Deletion brief:** `docs/briefs/ambient-mode-deletion-brief.md`

---

## UX & Interface

### Meeting Mode (Executive Engagement)
- Dedicated mode for leadership meetings — AI-powered note taker with task extraction
- Ambient voice transcription captures discussion in real time (reuses existing Deepgram infrastructure)
- AI parses meeting transcript into structured meeting notes + actionable tasks
- Tasks auto-created and assigned to team members mentioned in conversation
- Post-meeting summary: decisions made, tasks generated, follow-ups with due dates
- Designed for executives who don't touch day-to-day ops but need visibility and accountability
- Increases platform stickiness at the leadership level — not just a floor-ops tool
- Could tie into department lead structure (tasks route to the right lead automatically)
- Potential: recurring meeting templates (weekly cultivation review, harvest planning, etc.)

### Keyboard Shortcuts
- Navigation hotkeys for switching views
- Global shortcut to toggle ambient voice mode
- `n` for quick new task creation
- Power-user efficiency during active operations

### Saved Filter Views
- All filter/sort tables should support saving views
- User creates a filter configuration, names it, reuses it
- Applies across: plant map, packages, harvests, tasks, etc.

### SMS Task Notifications (Tactical MVP)
- Before a native mobile app, wire up SMS delivery of daily task assignments via Twilio or similar
- Morning message with the day's tasks, reply to mark complete
- Fastest path to the "show up and get told what to do" tech experience
- **SME context (2026-04-09):** Holland explicitly suggested text/SMS as faster than building an iOS app. His vision: tech shows up, gets a push notification with today's tasks, green-checks each one when done. Accountability trail if tasks aren't completed.

### Settings Reorganization
- Add sub-tabs to settings for better organization
- Current settings page is flat; needs grouping (account, team, facility, integrations, etc.)

### Plant Map Polish
- Expanded room responsive improvements for smaller screens
- Strain name truncation — consider expandable cells or tooltip

### Package Inventory
- **Backend CRUD built** (2026-03-29)
- **Next:** mutation UI (inline editing, modals for location/notes/lab testing/quantity), status transition UX (Hold/Release/Finish)

---

## Team & Delegation

### Current State (built)
- Team dashboard with inline editing (name, role, email, status)
- Auth0 invite flow with copy-to-clipboard modal
- Role hierarchy: admin, manager, lead, worker
- Admin auto-provisioned into team roster
- Task assignment to any team member including self

### Email Service (Team Invites & Transactional)
- Transactional email server for sending team invite links directly (vs. current copy-to-clipboard flow)
- Foundation for all outbound email: invites, task notifications, daily summaries, CRM outreach
- Evaluate providers: Resend, Postmark, or SES
- Templates for invite emails with branded NeuroCann styling

### Lightweight CRM (Suppliers & Customers)
- Contact management for both suppliers (growers, vendors) and customers (stores, dispensaries)
- **Supplier side:** email suppliers with material requests, track pricing history, seasonal reminders (extends existing Supplier CRM concept in Extraction section)
- **Customer side:** email customers with product menus/availability, track order history, manage store relationships
- Ties into ordering workflow — 20+ vendors, 11-12 stores, velocity-based pars
- Future: automated outreach via AI ("what fresh frozen do you have?" / "here's this week's menu")

### Department Leads
- Each department (cultivation, harvest, extraction, trim, packaging, etc.) can have a designated lead
- New tasks created in a department are auto-assigned to the department lead by default
- Lead can then reassign/delegate tasks to their team members
- Reduces bottleneck on admins/owners — leads manage their own crew's workload
- Lead gets a view of all tasks in their department and who's assigned to what

### Role Hierarchy (expansion)
- Leads have permission to assign/reassign tasks within their department but not facility-wide settings
- Consider: can a person lead multiple departments? (common in smaller ops)

---

## Extraction & Concentrate Tracking

> Full brief: [docs/briefs/extraction-workflow-brief.md](briefs/extraction-workflow-brief.md)

### P0: Core Manufacturing Tracker
- Multi-stage inventory view (fresh frozen → washing → bubble hash → pressing → rosin → cart filling → finished)
- Per-strain visibility at every stage
- Batch tracking with yield % (input weight → output weight)
- Ambient/voice input at natural stopping points in extraction workflow
- METRC package creation & adjustment for extraction batches
- **Basic extraction logging built** — `record-extraction` endpoint, extraction_logs table, package creation from extraction output
- **SME guidance (2026-03-30):** hash making and METRC concentrate packages are universal — build now, refine with feedback. "Don't build on hypotheticals" — SME wants to run batches first.
- **Standard batch size (2026-04-09):** add `standard_batch_size_grams` to SOPs or equipment profiles. Batch sizes are always in increments of 500g (testing minimum). Use for planning estimates and soft validation, never as a hard block.
- **Cycle time is fixed, not input-dependent (2026-04-09):** a wash takes ~4.5 hours regardless of input weight. No need for time-scaling logic in SOP steps — keep durations as fixed estimates.

### Demand-Backward Planning
- Planning flow that starts from a target output ("I need 500g of rosin") and reverse-engineers input requirements using historical yield data per strain
- Surfaces what's on hand vs. what needs to be sourced externally
- Both planning directions must coexist: vertically integrated ops start from inventory on hand, wholesale/contract extractors start from sales demand
- Could be conversational (AI chat: "I need 1,000 carts for next month") or a dedicated planning view
- A single planning session may produce multiple runs across multiple days
- **SME context (2026-04-09):** Holland's entire workflow starts from "how many grams do I need?" and works backward. "I need 500g rosin → at 3.5% yield I need 35 lbs fresh frozen → source from garden X at $65/lb." This is the primary workflow for contract extractors.

### Supplier CRM (External Fresh Frozen Sourcing)
- Lightweight contacts/vendor system for tracking external growers who supply fresh frozen
- Track: contact info, strains available, pricing history, quality notes, last purchase date
- Seasonal reminders ("you bought from this grower last June for 710 prep — time to reach out")
- Future: automated email/voice outreach ("this is Holland's team — what fresh frozen do you have available?")
- Not a marketplace — just a contacts + history + reminder system
- **SME context (2026-04-09):** sourcing external fresh frozen is ~1/3 of Holland's job. He gives genetics to growers, gets first refusal at discounted rates. An agent that manages this sourcing would "be my assistant."

### P1: Supply Chain & Reorder Alerts
- Recipe / Bill of Materials (e.g., 1 cart = 0.5g rosin + 1 empty cart)
- Smart reorder alerts with lead time learning
- Lab tech reorder permissions with spend limits
- Track consumables (bags, screens, carts, hardware) with smart reorder
- **SME blocker (2026-04-09):** lab tech self-service reordering is one of two hard blockers to adoption. Techs in remote facilities (Maryland, Buffalo) call Holland to order press bags, silicone papers, wash bags. The app should let techs trigger reorders without a phone call.

### P2: Analytics & Optimization
- Strain-level economics (yield %, cost per gram over time)
- Harvest-to-extraction handoff (target quantities, alerts when hit)
- Cycle time tracking (actual vs. planned at each stage)

---

## Integrations

### METRC
- Bidirectional sync for package creation, adjustments, transfers
- Manufacturing/processing API endpoints
- Goal: operators never log into METRC directly
- **Prerequisite:** plant tagging starting-tag selector, SOP workflow templates designed
- **SME blocker (2026-04-09):** METRC API is one of two hard blockers to adoption. Holland spends 45+ minutes on calls dictating batch numbers and weights to a compliance admin. "Reorders and METRC API — you solve a lot of problems for me."

### BioTrack
- Evaluate API availability and feature parity with METRC integration
- State-specific requirements (BioTrack states vs. METRC states)

### Microsoft Business Central
- ERP sync for financials, inventory valuation, purchase orders
- Scope TBD — likely starts with inventory and cost data

### Total Grow
- Cultivation management integration (mentioned by extraction SME as widely adopted)
- Research API documentation and availability

### Barcode Scanning
- Scan fresh frozen bags, packages, plant tags
- USB scanner or phone camera support

---

## Infrastructure & Brand

### Inventory Snapshots (Point-in-Time Rollback)
- Periodic snapshots of inventory state (e.g., every 6 hours via cron) for recovery from accidental or malicious data changes
- Simple implementation: dump current inventory quantities to an `inventory_snapshots` table with timestamp
- Enables fast recovery — admin reverts to last known-good state instead of reconstructing from scratch
- **Context (2026-04-09):** Holland's father (network security) raised the disgruntled employee scenario. Current mitigations: RBAC, compliance gate on METRC actions, immediate account deactivation. Snapshots add a safety net for data integrity.

### NeuroCann Domain Migration
- Domain: neurocann.ai (purchased ~2026-03-29)
- Code changes: HTML title, Auth0 audience URLs, Auth0 namespace, IndexedDB name, package.json name
- Infrastructure: Auth0 callback URLs, Netlify custom domain, DNS config
- SSL handled by Netlify automatically

---

## Open Questions

- Harvest page status workflow — needs SME validation before building
- Exact METRC package types and API calls for extraction/manufacturing
- BioTrack API availability and documentation
- Business Central connector scope and auth model
- Cart filling process details (hardware types, fill volumes, curing time)
- How testing/COA fits into the extraction workflow
- Multi-strain mixing rules for extraction
- AI SQL query access — sandboxing, read-only constraints, guardrails
- Sub-agent architecture — what domains, how they coordinate
- **Design partner (Maryland):** Holland setting up a facility with a well-capitalized partner (Jordan). Holland is sole decision-maker on ops, owner-operator model, indoor + outdoor + modular extraction. Could be the ideal first real deployment. Timeline: partner closing a deal, Holland on-site end of April.

# NeuroCann Roadmap

Planned features, integrations, and improvements. Updated as priorities evolve.

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
- Rethink tab/filter UX — current drying vs. planning vs. ready view isn't well structured
- Better sorting and filtering throughout
- Ensure status transitions reflect what actually happens on the floor

---

## Plant Lifecycle & SOPs

### Plant Batch SOPs
- Define a standard operating procedure at the plant batch level
- SOP is a repeatable lifecycle plan: sequence of procedures a batch goes through (up-pot, flip, defoliation, IPM treatments, etc.)
- On batch creation, system auto-generates tasks from the SOP template with estimated dates
- SOPs can be adjusted post-creation via individual task edits
- Templates are reusable across batches (e.g., "8-week flower cycle with weekly IPM")

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

---

## UX & Interface

### Keyboard Shortcuts
- Navigation hotkeys for switching views
- Global shortcut to toggle ambient voice mode
- `n` for quick new task creation
- Power-user efficiency during active operations

### Saved Filter Views
- All filter/sort tables should support saving views
- User creates a filter configuration, names it, reuses it
- Applies across: plant map, packages, harvests, tasks, etc.

### Settings Reorganization
- Add sub-tabs to settings for better organization
- Current settings page is flat; needs grouping (account, team, facility, integrations, etc.)

### Plant Map Polish
- Expanded room responsive improvements for smaller screens
- Strain name truncation — consider expandable cells or tooltip

---

## Team & Delegation

### Department Leads
- Each department (cultivation, harvest, extraction, trim, packaging, etc.) can have a designated lead
- New tasks created in a department are auto-assigned to the department lead by default
- Lead can then reassign/delegate tasks to their team members
- Reduces bottleneck on admins/owners — leads manage their own crew's workload
- Lead gets a view of all tasks in their department and who's assigned to what

### Role Hierarchy
- Current roles: admin, user — may need a "lead" role or per-department lead designation
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

### P1: Supply Chain & Reorder Alerts
- Recipe / Bill of Materials (e.g., 1 cart = 0.5g rosin + 1 empty cart)
- Smart reorder alerts with lead time learning
- Lab tech reorder permissions with spend limits

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

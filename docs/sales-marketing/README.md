# NeuroCann — Sales & Marketing Module Docs

Per-module enablement for demos, discovery calls, landing copy, and proposal language.

**Audience:** sales, marketing, founders running demos  
**Rule:** claim only what ships today. Roadmap items belong under "Do not claim."  
**Last reviewed against codebase:** 2026-09-25

## How to use these docs

| Need | Use |
|------|-----|
| 30-second pitch for a module | Elevator pitch at top of each module page |
| Live demo | Demo script section |
| Website / one-pager copy | Value + key capabilities (avoid "Do not claim") |
| Objection handling | Differentiators + do-not-claim |
| Discovery | Who it's for + problem |

## Platform story (open every call with this)

NeuroCann is a cannabis facility operations platform. Operators speak or type in plain language; the AI proposes structured actions; the user confirms; the system updates plant map, harvests, trim, packages, extraction, ordering, and tasks — same loop everywhere.

- **Action mode:** say what you need → review → confirm  
- **Ambient mode:** continuous background capture (built; currently feature-flagged off for general availability — confirm before promising in a demo)

Brand in product UI: **NeuroCann**. Product voice: operator-first, specific workflows, no hype words ("revolutionary," "game-changing").

## Module index

### Core operational modules

| Module | One-liner | Doc |
|--------|-----------|-----|
| Cultivation & Plant Map | Every room, every plant — move, flip, flag issues | [modules/cultivation-plant-map.md](./modules/cultivation-plant-map.md) |
| Harvest Pipeline | Weigh, allocate flower vs frozen, hang, bin, hand off | [modules/harvest-pipeline.md](./modules/harvest-pipeline.md) |
| Trim Sessions | Multi-batch sessions, trimmer weights, rollover | [modules/trim-sessions.md](./modules/trim-sessions.md) |
| Extraction | Template runs from frozen to concentrate packages | [modules/extraction.md](./modules/extraction.md) |
| Packaging & Compliance | Finished inventory, lab states, tags, audited adjusts | [modules/packaging-compliance.md](./modules/packaging-compliance.md) |
| Ordering & Procurement | Vendor menus, sales velocity, multi-store POs, supplier email | [modules/ordering-procurement.md](./modules/ordering-procurement.md) |
| SOPs | Cultivation calendars + extraction process library | [modules/sops.md](./modules/sops.md) |
| Reports & Analytics | Trim labor productivity and cost-per-pound | [modules/reports-analytics.md](./modules/reports-analytics.md) |

### Platform capabilities

| Capability | One-liner | Doc |
|------------|-----------|-----|
| AI & Voice | Conversational ops with confirm-before-execute | [modules/ai-voice.md](./modules/ai-voice.md) |
| Tasks | Human work queue with hybrid completion actions | [modules/tasks.md](./modules/tasks.md) |
| Supplies | Par-level non-cannabis inventory | [modules/supplies.md](./modules/supplies.md) |
| Team & Roles | Role + department gating across modules | [modules/team-roles.md](./modules/team-roles.md) |
| Settings | Licenses, strains, rooms, tags, equipment | [modules/settings.md](./modules/settings.md) |

## Seed-to-sale flow (for demos)

```
Plant Map → Harvest Day → Hanging / Bins → Trim → Packages
                ↘ Fresh frozen packages → Extraction runs → Concentrate packages
Ordering (vendors / velocity / POs) and Supplies sit beside the cannabis flow.
SOPs encode how cultivation and extraction should run.
Reports close the loop on trim labor.
```

## Cross-cutting claims — safe vs unsafe

| Safe to say | Do not say |
|-------------|------------|
| Voice-first facility ops with confirm-before-execute | Fully automated METRC sync |
| Seed-to-sale *workflow coverage* in one app | State-certified seed-to-sale compliance system |
| Tags and METRC-oriented fields ready for sync | Live METRC API integration (roadmap) |
| Contaminant catalog + health scoring on plant groups | Automated pest/pathogen detection from cameras/sensors |
| Multi-store PO matrix from imported POS sales CSV | Live Dutchie / POS API sync |
| AI-drafted supplier email with inbound thread parse | Full marketing automation / SMS outreach |

## Related internal briefs

- Landing page structure: `docs/briefs/landing-page-brief.md`
- Demo honesty checklist: `docs/briefs/demo-readiness-apr2026.md`
- Product roadmap: `docs/ROADMAP.md`

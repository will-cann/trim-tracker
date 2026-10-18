# NeuroCann — Sales & Marketing Module Docs

Per-module enablement for demos, discovery calls, landing copy, and proposal language.

**Audience:** sales, marketing, founders running demos  
**Rule:** claim only what ships today. Roadmap items belong under "Do not claim."  
**Last reviewed against codebase:** 2026-10-12

## How to use these docs

| Need | Use |
|------|-----|
| 30-second pitch for a module | Elevator pitch at top of each module page |
| Live demo | Demo script section |
| Website / one-pager copy | Value + key capabilities (avoid "Do not claim") |
| Objection handling | Differentiators + do-not-claim |
| Discovery | Who it's for + problem |

## Platform story (open every call with this)

NeuroCann is **headless cannabis management software**: the operations engine behind a facility, available from wherever the team already works. Operators speak or type in plain language — on the floor by voice, in ChatGPT or Claude on a phone, in Claude Code or Cursor at a desk, or in the NeuroCann app; the AI proposes structured actions; the user confirms; the system updates plant map, harvests, trim, packages, extraction, ordering, and tasks — same loop on every surface, one record underneath.

- **Action mode:** say what you need → review → confirm  
- **LLM plugin:** free planners with no account; live facility reads and task creation after a one-time link (ChatGPT Developer Mode and Claude custom connector today; Apps Directory after acceptance)
- **Ambient mode:** continuous background capture (built; currently feature-flagged off for general availability — confirm before promising in a demo)

With operators, translate "headless" to "works where you already are" in the next sentence. Full positioning: `docs/briefs/headless-positioning-brief.md`.

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
| LLM Plugin | NeuroCann inside ChatGPT, Claude, Claude Code, Cursor — planners free, facility after linking | [modules/llm-plugin.md](./modules/llm-plugin.md) |
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
| Works inside ChatGPT, Claude, Claude Code and Cursor (MCP) | "Works with any AI" |
| Free planners, no account; live facility reads + tasks after linking | Full facility control from an assistant (writes are tasks only today) |
| Available in ChatGPT Developer Mode and as a Claude custom connector | In the ChatGPT Apps Directory (until accepted) |

## Related internal briefs

- Blog content plan (formats, cadence, schedule, claims checklist): `docs/sales-marketing/blog-content-plan.md`
- Positioning (headless): `docs/briefs/headless-positioning-brief.md`
- Plugin launch and directory listing: `docs/briefs/llm-plugin-launch-brief.md`
- Landing page structure: `docs/briefs/landing-page-brief.md`, headless update: `docs/briefs/landing-page-headless-brief.md`
- Demo honesty checklist: `docs/briefs/demo-readiness-apr2026.md`
- Product roadmap: `docs/ROADMAP.md`

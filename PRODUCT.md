# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary buyers and users are **operations managers** who orchestrate people, processes, and systems across cultivation and processing. Day-to-day operators (trim leads, cultivation techs, lab techs) execute assigned floor work. Owners may review visibility and outcomes. Tech comfort is moderate to high; the manager’s job is coordination under time pressure, not data entry.

## Product Purpose

NeuroCann is the **operations orchestration layer** for cannabis facilities — built so managers can maximize **dollars per plant** and **mitigate harvest risk**. Conversational AI turns managerial intent into assigned work across people, process, and technology. Teams track what grows well, what runs well, and what sells well so the next cycle can be planned; plant health flags surface early so issues don’t take out a harvest. When physical work is marked complete, NeuroCann updates the digital trail and compliance path (including METRC). Square footage is fixed; output quality and risk aren’t.

## Positioning

Not another spreadsheet, MES form, or METRC UI. NeuroCann sits above tools as the conversation that assigns work, tracks completion, and syncs the facility’s digital state — creating **agility in operations** so measurement and planning actually happen. **Land with one workflow** (often METRC sync / facility visibility), then expand until grows / runs / sells data compounds into better planting decisions and earlier risk response. Built by cannabis operations experts who can shape the system to how a team actually runs.

A neighboring compliance portal or ERP cannot truthfully claim: meeting → assigned actions → floor completion → automated compliance updates, in one conversational control plane — plus the measurement loop that turns that work into revenue and risk decisions.

## Operating Context

Managers run morning meetings and floor walks; techs execute plant moves, harvests, trim, extraction, and packaging with gloves on. Ambient and action voice capture intent in the room. Hybrid tasks pair a physical “done” with an on-complete digital action. Multi-tenant by `company_id`. Auth0 (dev bypass available). Netlify + Neon PostgreSQL.

## Capabilities and Constraints

**Shipped:** AI chat with proposed actions; ambient voice; human tasks with assignees and hybrid `onCompleteAction`; plant map / rooms; harvests + harvest day; trim; extraction; packages + METRC-style tags / item catalog; ordering & supplier email; supplies; SOPs; team/roles; reports.

**Go-to-market wedge:** Start with METRC / digital facility-state visibility, then expand into orchestration workflows (tasks, cultivation, harvest, etc.). Full METRC API sync is the priority integration path — ship claims carefully until live sync is confirmed in production.

**Roadmap / do not over-claim:** AI sub-agents, multi-facility view, push notifications, SMS (columns exist, unwired).

## Brand Commitments

- **Name:** NeuroCann (UI brand); codebase historically “trim-tracker.”
- **Personality:** Clean. Smart. Intuitive. Premium operations tool; Apple-level simplicity applied to agricultural ops. Emotional goals: confidence, control, calm efficiency, speed.
- **Tagline (legacy):** “Elevating Harvest Efficiency.”
- **Light mode only** for product chrome — clean, bright, professional. No dark app chrome as the product default.
- **Type:** Lato (300, 400, 700, 900).
- **Palette:** Chameleon `#3BB570`, Macaw `#1C9EFF`, Lion `#FA9E52`, Cardinal `#DF5B59`, Panther `#1A1A1A`, Rhino `#959595`, Dolphin `#C0C0C0`, Koala `#F1F1F1`.
- **Anti-references (binding):** No stoner/cannabis aesthetic; no leaf motifs; no green-everything; no counter-culture vibes; nothing that reveals cannabis at first glance. No enterprise-heavy UI (SAP, Oracle). No cluttered dashboards.
- **Target feel:** Quiet confidence — whitespace, typography, subtle hierarchy. Domain-honest terminology (flower, shake, trim, waste) without cannabis branding.

Source: project `.impeccable.md` (confirmed incumbent brand record).

## Evidence on Hand

- Live product SPA (`src/`), landing page (`src/components/LandingPage.tsx`), logo (`src/assets/logo.png`).
- Demo contact: `will@neurocann.app`.
- No third-party testimonials or customer logos on hand — do not fabricate social proof.

## Product Principles

1. **Invisible by design** — reduce friction; every element earns its place.
2. **Speed is a feature** — fewest steps for common floor tasks; progressive disclosure.
3. **Quiet confidence** — no visual noise; professionalism through hierarchy and clarity.
4. **Domain-honest, brand-neutral** — industry terms without cannabis costume.
5. **Data clarity over density** — precise weights and metrics; show less with more clarity.

## Accessibility & Inclusion

Target **WCAG 2.2 AA** for public surfaces (landing and auth entry). Product SPA should meet the same bar for interactive controls, focus order, and contrast as modules are touched. Keyboard access and visible focus are required; decorative product mocks may use `aria-hidden` when a live interactive equivalent is provided.

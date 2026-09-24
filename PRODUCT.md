# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are operations professionals in cannabis cultivation and processing: trim managers, cultivation managers, and lab managers (extraction + manufacturing). Owners may access reports or run as owner/operators. They are busy, hands-on people managing crews, weights, and timelines in real time; tech comfort is moderate to high. They need to move fast during active sessions (harvest day, trim floor, extraction runs).

## Product Purpose

NeuroCann (product; formerly trim-tracking roots) is an AI-powered facility operations platform. It manages cultivation, plant maps, harvest pipelines, trim sessions, extraction, packaging, compliance/tags, ordering, supplies, SOPs, tasks, and reporting through a single conversational / voice-first interface. Success means operators complete floor work with fewer screen taps, fewer missed logs, and a continuous compliance trail — confidence, control, and calm speed.

## Positioning

Facility operations spoken: natural language and ambient voice propose structured actions across the full seed-to-sale stack; the user confirms before anything writes. Neighboring compliance or ERP tools do not truthfully claim a single conversational control plane that spans rooms → harvest → trim → extraction → packages → POs with action preview.

## Operating Context

Used on the floor and in the office: gloved harvest weighing, trim sessions, extraction check-ins, packaging/tagging, vendor POs, and ambient listening while work continues. Auth via Auth0 (dev bypass available). Multi-tenant by `company_id`. Deployed on Netlify; data on Neon PostgreSQL.

## Capabilities and Constraints

Confirmed modules include: AI chat with proposed actions, ambient voice capture, plant map / rooms, harvests + harvest day, trim sessions, extraction runs, packages + METRC-style tags, ordering / supplier email, supplies, SOPs, tasks, team/roles, reports. Voice via Deepgram; AI via Anthropic Claude server-side. SMS columns exist but are not wired. METRC API sync, AI sub-agents, multi-facility view, and push notifications are roadmap — not shipped claims.

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

No product-specific accessibility standard recorded beyond sensible web defaults (keyboard, contrast). Open decision if a formal WCAG target is required.

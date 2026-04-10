# NeuroCann Landing Page Rewrite Brief

## Goal

Rewrite `src/components/LandingPage.tsx` to accurately represent the full platform. The current page shows ~40% of what's built and incorrectly lists shipped features as "roadmap." The new page should position NeuroCann as a complete facility operations platform, not just a cultivation + trim tool.

## Technical constraints

- Single React component in `src/components/LandingPage.tsx`
- Uses Tailwind CSS (the project's design system)
- Font: Lato (already loaded). Never use Tailwind default fonts.
- No emoji in copy or UI markers. Use Lucide icons or typographic treatment.
- Color palette uses animal-named tokens from the existing system — reference `src/index.css` and existing components for the brand palette. Do not use raw Tailwind color defaults.
- The page renders when `user` is null in `App.tsx` (unauthenticated visitors)
- `useAuth()` provides `login()` for the Sign In button
- The existing `ActionPreview` component import is available for the AI demo
- Keep the `AIChatDemo` auto-playing conversation — it's the strongest element on the current page. Update its scenarios to cover more domains (extraction, ordering, ambient voice, tasks).
- CTAs: "Book a Demo" (mailto:will@neurocann.com) and "Sign In" (triggers Auth0 login)
- Must be fully responsive (mobile, tablet, desktop)
- Scroll-reveal animations are good — keep the pattern

## Brand voice

- Operator-first. Written by people who've run rooms and managed harvests.
- Confident but not hype. No "revolutionary" or "game-changing."
- Specific over generic. Name the workflow, not the category. "Weigh plants by voice on harvest day" not "streamlined operations."
- Short sentences. Punchy headlines. Let the UI mocks do the talking.

## Page structure

### 1. Nav (keep as-is)
Logo, Platform link, How It Works link, Sign In, Book Demo CTA.

### 2. Hero
**Keep the current hero** — it works. "Run your facility with your voice." with the live AI chat demo on the right.

Update the subtitle to reflect full scope:
> NeuroCann manages cultivation, harvests, trim, extraction, packaging, ordering, supplies, and compliance — through a single conversational interface. Voice-first. Hands-free.

### 3. Stats bar
Replace with real or defensible numbers, or reframe as capability stats:
- 51 voice-driven actions
- 8 operational modules
- Seed-to-sale coverage

### 4. Module showcases (the core of the rewrite)

Each module gets a showcase section with: headline, 1-2 sentence description, and a mock UI panel. Use the existing `ShowcasePanel` pattern. Alternate layout directions (text-left/panel-right, then flip).

**Showcase order (by operational flow):**

#### a. Cultivation & Plant Map
- Keep existing room cards mock
- Headline: "Every room. Every plant."
- Cover: room-based visualization, growth phases (nursery/veg/flower/dry/cure), health scoring, strain distribution, batch tracking

#### b. Harvest Pipeline
- Keep existing harvest stats mock
- Headline: "Weigh. Allocate. Submit."
- Cover: 6-stage kanban, allocation splits (flower/frozen/both), per-plant voice weighing, contamination flagging, waste documentation

#### c. Trim Sessions
- Keep existing trim progress mock
- Headline: "Flower. Shake. Waste. Accounted."
- Cover: multi-batch sessions, trimmer assignment, real-time weight entry, session rollover

#### d. Extraction (NEW — needs a mock panel)
- Build a new mock showing a multi-step extraction run (ice water > freeze dry > rosin press) with step completion indicators, input/output weights, and yield %
- Headline: "Fresh frozen to finished goods."
- Cover: template-based runs, multi-step tracking with weight/timestamp check-ins, equipment management, SOP-defined inputs and outputs, yield calculation

#### e. Packaging & Compliance (NEW — needs a mock panel)
- Build a mock showing package cards with lab testing states, METRC tags, and type chips
- Headline: "Every gram. Every tag."
- Cover: finished product inventory, lab testing state tracking, package adjustments, METRC tag management, production batch / trade sample flags

#### f. Ordering & Procurement (NEW — needs a mock panel)
- Build a mock showing a PO with vendor, line items, and per-store quantity matrix
- Headline: "Vendor to shelf."
- Cover: vendor management with product catalogs, multi-store purchase orders, order lifecycle, lead time tracking. This is SHIPPED, not roadmap.

#### g. SOPs
- Keep existing SOP editor mock
- Headline: "Build once. Run every time."
- Cover: step-by-step templates, AI auto-generates tasks on trigger, assignees and durations, auto-execute compliance steps

#### h. Reports & Analytics
- Keep existing reports mock
- Headline: "Data that drives decisions."
- Cover: natural language report generation, multiple chart types, saved reports, trimmer performance, yield trends

### 5. Ambient Voice — feature spotlight (NEW)

This deserves its own hero-weight section, not a card. It's the single most differentiated capability.

- Headline: "Always listening. Never in the way."
- Description: Ambient mode runs continuously in the background. Speak naturally while you work — weights, tasks, contamination flags, status updates. NeuroCann captures everything, queues actions for review, and stays out of your way. No buttons. No screens. Just your voice.
- Mock: show a transcript stream with captured actions (similar to the AmbientActionCenter UI — utterances flowing in, action cards appearing)

### 6. How It Works (keep as-is)
Three steps: Speak or type > Review the action > Confirm and go.

### 7. "Also Built In" cards
Use for secondary capabilities that don't need full showcases:
- Task management (AI-created tasks, priority levels, assignees, hybrid physical+digital tasks)
- Supply management (par levels, ledger tracking, vendor linkage)
- Team & roles (admin/director/manager/technician, department scoping)
- Bin & cure tracking (daily cure logs, moisture readings, ready-to-trim transitions)
- Settings & strain library (lifecycle defaults, room/equipment inventory, license management)

### 8. Roadmap section
Only include things that are genuinely not shipped:
- METRC API sync (direct state compliance integration — auto-submit harvests, packages, transfers)
- AI sub-agents (autonomous monitoring, anomaly detection, routine SOP execution)
- Multi-facility view (cross-location dashboards, comparative analytics)
- Push notifications (task due dates, daily summaries, anomaly alerts)

### 9. Closing CTA (keep as-is)
"Grown from necessity. Cultivated for cannabis." Dark section with demo + sign in buttons.

### 10. Footer (keep as-is)

## AI Chat Demo scenarios (update)

Replace the current 3 scenarios with 5 that span more of the platform:

1. **Cultivation**: "Move the OG Kush from veg 2 to flower 1" > move_plants action
2. **Harvest + voice**: "Plant 7 is 512 grams, has some PM" > record_plant_weight + flag_contamination
3. **Extraction**: "Start a rosin press run with 2kg of Wedding Cake bubble hash" > start_extraction_run action
4. **Ordering**: "Create a PO for Pacific Roots — 10 cases of rockwool, 5 cases of nutrients" > create_order action
5. **Packaging**: "Create a 1lb flower package from the Gelato harvest, tag it METRC-001234" > create_package + assign_tag actions

## SEO requirement

The current SPA renders nothing for crawlers. Add a Netlify prerender plugin or static meta tags in `index.html` so search engines see real content. At minimum, ensure `<title>`, `<meta name="description">`, and Open Graph tags are set with meaningful content before the React app hydrates.

## What NOT to do

- Don't add a pricing page or tier comparison — not ready yet
- Don't add fake testimonials or customer logos
- Don't add a blog or resources section
- Don't link to external docs that don't exist
- Don't use stock photography
- Don't over-animate — the current scroll-reveal is tasteful, keep it at that level

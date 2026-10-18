# Landing Page — Headless Angle Update Brief

**Status:** draft for founder review · **Owner:** Will · **Date:** 2026-10-12
**Supersedes in part:** [`landing-page-brief.md`](./landing-page-brief.md) (structure,
constraints and module showcases still apply; this brief changes the hero, adds two
sections and the planner pages, and updates the roadmap list).
**Positioning:** [`headless-positioning-brief.md`](./headless-positioning-brief.md)

## Goal

Make the first screen say what NeuroCann is now: headless cannabis management software
that works inside ChatGPT, Claude, your voice and our app. Give visitors something to do in
under a minute that needs no account (a planner), and give linked-account intent a clear
path ("Add to ChatGPT / Add to Claude").

## Technical constraints (carry over, plus)

- Everything in the original brief: single `LandingPage.tsx`, Tailwind with the existing
  palette tokens, Lato, Lucide icons, no emoji, no stock photos, scroll-reveal kept tasteful.
- New: the page must have crawlable content. Ship static `<title>`, `<meta description>` and
  Open Graph tags in `index.html` now, and a prerender step (Netlify prerender plugin or a
  static export of `/`, `/privacy`, `/terms`, `/tools/*`) in the same change.
- New: `/tools/*` planner pages are static HTML under `public/tools/` (same pattern as
  `privacy.html` / `terms.html`, shared `legal.css` renamed or a sibling `tools.css`), with
  `netlify.toml` rewrites before the SPA catch-all. No React needed; each page is copy plus a
  worked example plus the "ask it in ChatGPT / Claude" block.
- CTAs: keep "Book a Demo" and "Sign In"; add "Add to ChatGPT" and "Add to Claude" (see §3).

## Page structure (changes only; unchanged sections marked keep)

### 1. Nav — keep, add "Plugin" link to §3

### 2. Hero — rewrite

**Headline:** Run your facility from wherever you already talk.
**Eyebrow (small, above):** Headless cannabis management
**Sub:** NeuroCann manages cultivation, harvests, trim, extraction, packaging, ordering and
tasks — and answers from ChatGPT, Claude, your voice, or our app. Nothing changes without a
confirmation.

**Right side:** keep the auto-playing `AIChatDemo`, but alternate the "host chrome" so every
other scenario is visibly framed as a ChatGPT or Claude thread rendering a NeuroCann card
(use a neutral generic-assistant frame; do not reproduce either company's logo or exact UI).
Scenarios:

1. ChatGPT frame: "How much fresh frozen for 1,000 half-gram live rosin carts?" → extraction card
2. NeuroCann frame (voice): "Plant 7 is 512 grams, has some PM" → record weight + flag contamination preview
3. Claude frame: "What's drying right now?" → facility overview card
4. NeuroCann frame: "Start a rosin press run with 2 kg of Wedding Cake hash" → start run preview
5. ChatGPT frame: "Create a task to flip Flower 3 tomorrow, high priority" → task created confirmation

**CTA row:** Add to ChatGPT · Add to Claude · Book a Demo (tertiary: Sign In in nav only).

### 3. "Works where you already are" — new, directly under the hero

Six tiles, one line each, icon + label + detail. This is the headless proof.

| Tile | Detail |
| --- | --- |
| Voice on the floor | Say weights, moves and flags. Preview, confirm, done. |
| ChatGPT | Planners free. Link your facility for live answers and tasks. |
| Claude | Same plugin in claude.ai and Claude Desktop. |
| Claude Code / Cursor | One-line MCP setup with a scoped API key. |
| The NeuroCann app | The deepest head: setup, plant map, harvest day, runs, reports. |
| Your record | One tenant, one audit trail, whichever head the crew used. |

Under the tiles, the install block (tabbed, copyable), text per host:

- **ChatGPT** — *Until directory acceptance:* "Settings → Apps → Create (Developer Mode) →
  `https://neurocann.app/mcp` → OAuth." *After:* "Find NeuroCann in the Apps Directory."
- **Claude** — "Settings → Connectors → Add custom connector → `https://neurocann.app/mcp`."
- **Claude Code** — the `claude mcp add` one-liner with a placeholder key and a link to Settings → LLM Plugin.
- **Cursor** — the `.cursor/mcp.json` snippet.

### 4. "Try a planner now" — new

Three cards, each a real worked example with the actual numbers the tool returns and a
"Try it" link that opens the matching `/tools/` page:

- **Fresh frozen for 1,000 carts** — ~38 lb; wash 5% → freeze dry 96% → press 60% → decarb → fill.
- **Cost per gram of live rosin** — $13.09/g with defaults; material 88% of cost; break-even 3.2% at $12/g.
- **200 lb through one freeze dryer** — 6 days; washing is the bottleneck with two stations.

Copy under the cards: "Planners use NeuroCann process-template yields and say so. Link a
facility and they switch to your own strains and history."

### 5. Stats bar — replace numbers

- 20 assistant tools (8 free planners)
- 51 voice-driven actions in the app
- Seed-to-sale coverage in one record

(Keep the numbers derivable from the codebase; update when the tool count changes.)

### 6. Module showcases — keep (a–h from the original brief)

One copy change: in each showcase's description, where relevant, add the assistant angle in
a single trailing sentence, e.g. Harvest Pipeline: "Ask Claude what's drying and get the same
pipeline as a card."

### 7. Confirm-before-execute — new short band (replaces nothing; sits after showcases)

**Headline:** Nothing changes without a yes.
**Copy:** In the app, by voice, or from an assistant, every action is previewed with its fields
before it touches the record. Assistant access is scoped — read, or read plus tasks — and
revocable in Settings.

### 8. Ambient voice spotlight — keep, but label "rolling out" until the flag is on

### 9. How it works — keep (Speak or type → Review → Confirm), add "…from any head" to the intro line

### 10. Also built in — keep; add "LLM Plugin keys (scoped, hashed, revocable)"

### 11. Roadmap — update

Remove anything shipped. Current honest list:

- More assistant write tools behind consent (record weights, move plants, start runs)
- Harvest pipeline and task cards in assistants
- METRC API sync
- Multi-facility view
- Push notifications
- Ambient mode general availability

### 12. Closing CTA — keep copy, add the two plugin buttons beside Book a Demo

### 13. Footer — keep; add Privacy, Terms (already linked), Plugin, Tools

## `/tools/` planner pages (new static pages)

One page per public planner, same template:

1. H1 as the question people type ("How much fresh frozen do I need for live rosin carts?")
2. A worked example with the real tool output rendered as a static version of the card
3. The assumptions, verbatim from the tool
4. "Ask it live" block with the three install snippets
5. "With a linked facility" paragraph: what changes (own yields, inventory, history)
6. Footer links: other tools, Privacy, Terms

Pages and slugs:

| Slug | Tool |
| --- | --- |
| `/tools/fresh-frozen-to-rosin-planner` | `plan_extraction_inputs` |
| `/tools/live-rosin-cost-per-gram` | `estimate_cost_per_gram` |
| `/tools/wash-freeze-dry-schedule` | `plan_wash_schedule` |
| `/tools/harvest-dry-weight-calculator` | `estimate_dry_weight` |
| `/tools/harvest-yield-estimator` | `estimate_harvest_yield` |
| `/tools/harvest-timeline-planner` | `plan_harvest_timeline` |
| `/tools/trim-labor-estimator` | `estimate_trim_labor` |

Each page title and description targets the matching SEO term from the positioning brief.
No interactive calculator on the page in v1; the call to action is to ask it in an assistant
(that is the funnel). An embedded calculator can come later if page traffic justifies it.

## SEO head tags (ship first, independent of the redesign)

```
<title>NeuroCann — Headless cannabis management software</title>
<meta name="description" content="Run cultivation, harvest, trim, extraction, packaging and tasks from ChatGPT, Claude, your voice or the NeuroCann app. Free cannabis planning tools, no account needed.">
og:title / og:description same; og:image a card screenshot on dark.
```

## Copy bank (approved phrasings; reuse verbatim)

- Headless cannabis management.
- Run your facility from wherever you already talk.
- One engine. Every interface.
- Nothing changes without a yes.
- Planners free. Link your facility for live answers.
- Works inside ChatGPT, Claude, Claude Code and Cursor.
- Say it on the floor. See it in the record.

## What NOT to do

- Do not reproduce ChatGPT or Claude logos, wordmarks or exact UI; use generic assistant frames and the words only.
- Do not say "in the ChatGPT Apps Directory" before acceptance.
- Do not promise writes from assistants beyond tasks.
- Do not add pricing, testimonials, logos, a blog, or stock photography (unchanged).
- Do not let "headless" stand alone in operator-facing copy; always follow with the plain-language line.

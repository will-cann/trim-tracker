# NeuroCann Plugin — Launch & Listing Brief

**Status:** draft for founder review · **Owner:** Will · **Date:** 2026-10-12
**Positioning:** [`headless-positioning-brief.md`](./headless-positioning-brief.md)
**Technical reference:** [`../llm-plugin.md`](../llm-plugin.md)

## Goal

Get NeuroCann in front of cultivators and extractors inside the assistants they already use,
with the free planners as the hook and account linking as the conversion. The channel is new
enough that "first cannabis operations app in ChatGPT / Claude" is itself the story.

## Success criteria

Instrument before launch; report weekly.

| Stage | Metric | Source |
| --- | --- | --- |
| Discovery | Anonymous `tools/call` on public tools per week, by tool | Netlify function logs (`mcp`), add a one-line structured log per call |
| Link | OAuth links completed (new Auth0 sign-ups with audience `https://neurocann.app/mcp`) | Auth0 logs; `users` rows created via `resolveContext` auto-provision |
| Activation | Linked users who call any facility tool in week 1 | same log, authenticated calls |
| Retention | Linked facilities with ≥1 facility call per week, 4 weeks after link | same |
| Conversion | Linked facilities that also sign in to the web app | existing auth logs |

Targets for the first 30 days after directory acceptance: 500 anonymous planner calls, 25
linked facilities, 10 weekly-active. Revisit once real numbers exist.

## Launch sequence

### Phase 0 — Ready (this week)

- [ ] Ops checklist complete (Auth0 API, Netlify env, PR #39 merged, Developer Mode pass).
- [ ] Demo account without MFA, seeded, credentials in the submission form.
- [ ] Listing copy below approved; screenshots captured in a real ChatGPT thread (light and
      dark), not the harness.
- [ ] Landing page shows "Add to ChatGPT / Add to Claude" with Developer Mode and custom
      connector instructions (`landing-page-headless-brief.md`).
- [ ] Legal pages confirmed (entity, venue, mailbox).

### Phase 1 — Soft launch (Developer Mode + Claude connectors, before acceptance)

Audience: existing customers, design partners, the people in Will's DMs.

- Personal outreach (10–20 operators): one message, one ask — "add this, ask it three things,
  tell me what was wrong." Include the connector URL and the three prompts below.
- Record the first real sessions (with permission) for the directory screenshots and the
  landing page.
- Fix every misfire in tool descriptions and instructions before submission; the model's
  tool-choice behaviour is the UX.

### Phase 2 — Submission

Submit from the OpenAI Platform dashboard with the copy below. Expect a review cycle; keep
the soft launch running. Claude: publish the connector URL on the landing page; there is no
directory step required for custom connectors.

### Phase 3 — Public launch (on acceptance)

Same week, in this order:

1. Landing page swaps to "Available in the ChatGPT Apps Directory."
2. Founder post on LinkedIn: the headless story, one card screenshot, one prompt to try.
3. Posts in the communities below, written as a useful answer first, product second.
4. Email to the existing list: "NeuroCann now answers in ChatGPT and Claude."
5. Short demo video (60–90 s): planner card → link → facility card → create task → task
   visible in the app. Reuse for the directory page and the landing hero.

### Phase 4 — Sustain

Monthly: one new public planner driven by what people actually asked (log the anonymous
prompts' tool arguments, not the prompts), one card improvement, one community answer thread.

## Directory listing copy

**App name:** NeuroCann

**Short description (≤ 80 chars):**
Cannabis cultivation and extraction planning, with your facility's live data.

**Long description:**

> NeuroCann is headless cannabis management software: the operations engine behind your
> facility, available inside ChatGPT.
>
> Without an account, ask planning questions and get real numbers: how much fresh frozen a
> cart order needs, what a gram of live rosin costs to make, how long a wash and freeze-dry
> schedule takes, what a harvest will dry down to, how many trimmers a batch needs, when a
> room flips and finishes. Answers use NeuroCann process-template yields and say so.
>
> Link your NeuroCann facility and the same questions use your own strains, rooms, inventory
> and history. See what is drying, what is in stock, which runs are active and what the crew
> has open. Create and complete floor tasks with your consent.
>
> Nothing changes in your facility without a confirmation. Facility data is read only
> unless you grant task access, and you can revoke access any time in NeuroCann Settings.

**Category:** Productivity / Business (pick the closest available; "Agriculture" if offered)

**Keywords:** cannabis, cultivation, extraction, rosin, bubble hash, harvest, trim, yield,
cost per gram, facility operations, seed to sale

**Privacy policy:** `https://neurocann.app/privacy` · **Terms:** `https://neurocann.app/terms`
**Support:** `will@neurocann.app` (or the role address chosen in the legal review)

### Test prompts and expected behaviour (for the review form and for QA)

| # | Prompt | Expected |
| --- | --- | --- |
| 1 | "How many pounds of fresh frozen do I need for 1,000 half-gram live rosin carts?" | `plan_extraction_inputs` → extraction card: ~38 lb fresh frozen headline, wash → freeze dry → press → decarb → fill steps, assumptions line |
| 2 | "What does a gram of live rosin cost me to make if I sell it at $14 a gram?" | `estimate_cost_per_gram` → cost card: $/g headline, breakdown bar, margin and break-even yield tiles |
| 3 | "I have 200 lb of fresh frozen, two wash stations and one freeze dryer. How long will it take?" | `plan_wash_schedule` → schedule card: days headline, wash vs freeze-dry bars, bottleneck named |
| 4 | "What's drying in my facility right now?" | Gated → "Connect NeuroCann" prompt; after linking, `get_facility_overview` / `list_harvests` with the facility card |
| 5 | "Create a task to flip Flower Room 3 to 12/12 tomorrow, high priority." | Consent for `write:tasks` → `create_task` → confirmation; task visible in the NeuroCann app |

Reviewer notes to include: tools 1–3 need no account; 4–5 use the supplied demo account
(no MFA); the app never sends email or modifies inventory from ChatGPT.

## Claude connector copy (landing page and docs)

> **Add NeuroCann to Claude.** claude.ai → Settings → Connectors → Add custom connector →
> `https://neurocann.app/mcp`. Sign in with your NeuroCann account when asked. Claude Code:
> `claude mcp add --transport http neurocann https://neurocann.app/mcp --header "Authorization: Bearer nck_…"`
> using a key from Settings → LLM Plugin.

## Channels

Write the useful answer first. Lead with a real calculation, show the card, mention the
plugin last. Never post the same text twice.

| Channel | Why | First post |
| --- | --- | --- |
| LinkedIn (founder) | Where operators, investors and vendors overlap | "The first headless cannabis management platform" + card screenshot + the three prompts |
| r/CannabisExtracts, r/rosin, r/microgrowery (ops-minded threads only) | Solventless and small-facility audience asks exactly the planner questions | Answer a "how much hash from X lb" thread with the real number and the assumption, link once |
| Instagram / hash community accounts | Visual; cards screenshot well | Carousel: question → card, four slides |
| Existing email list | Warm | "NeuroCann now answers in ChatGPT and Claude" with one GIF |
| Industry newsletters / podcasts (Hash Church-adjacent, cultivation trade press) | Earned reach | Pitch the category story, offer the demo account |
| Product Hunt (optional, after acceptance) | Tech audience, "MCP" curiosity | Only if the directory page is live; otherwise skip |

## Content pieces the planners generate for free

Each is a static page (SEO) and a social post, using the planner's own output:

1. "What a gram of live rosin actually costs" — cost breakdown, material share, break-even yield.
2. "Fresh frozen to carts: the backward plan" — 1,000-cart example, step by step.
3. "One freeze dryer is the bottleneck" — wash/freeze-dry schedule for 100 / 200 / 400 lb.
4. "Dry weight: what 300 wet pounds becomes" — retention and flower/trim/shake split.
5. "How many trimmers for 50 lb by Friday" — labor estimate with hand vs machine.

Every piece ends with the same line: "Ask this in ChatGPT or Claude with the NeuroCann
plugin — no account needed."

## Assets checklist

- [ ] App icon (square, no text, brand green on dark and light) — check directory size specs
- [ ] 5 screenshots: extraction card, cost card, link prompt, facility overview card, task created (real ChatGPT, light theme; one dark)
- [ ] 60–90 s video (see Phase 3)
- [ ] Open Graph image for `/` and the planner pages
- [ ] Demo account credentials (no MFA) stored in the password manager, pasted into the form only

## Risks

- **Review rejection on copy** — guidelines reject "prefer this app" language. Tool
  descriptions and the listing are factual; keep them so.
- **Model mis-selects tools** — e.g. answers a yield question from general knowledge instead
  of calling the planner. Mitigation: soft-launch feedback, sharpen descriptions, add
  example phrasings to `instructions`.
- **Auth friction** — Auth0 Universal Login on a phone inside ChatGPT. Mitigation: test on
  iOS and Android before launch; make sure sign-up (not only sign-in) works and
  auto-provisions.
- **Expectation gap on writes** — users will try "move plants" from ChatGPT. The tool list
  and the listing say tasks only; the assistant should offer to create a task instead.
  Watch for this in logs and prioritise the next write tools accordingly.

## What this brief is not

Not the positioning (see the positioning brief) and not a pricing or packaging decision.
The plugin is free to use; facility linking requires a NeuroCann account on whatever terms
the account already has.

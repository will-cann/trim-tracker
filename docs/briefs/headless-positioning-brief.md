# Headless Cannabis Management — Positioning Brief

**Status:** draft for founder review · **Owner:** Will · **Date:** 2026-10-12
**Companion briefs:** [`llm-plugin-launch-brief.md`](./llm-plugin-launch-brief.md),
[`landing-page-headless-brief.md`](./landing-page-headless-brief.md),
module doc [`../sales-marketing/modules/llm-plugin.md`](../sales-marketing/modules/llm-plugin.md)

## Why this brief exists

Until now NeuroCann has been sold as "a cannabis facility operations platform you talk to."
That was true and it still is, but it undersells the structural change the MCP server made:
the operations engine no longer needs our screen. The same plants, harvests, inventory,
runs, tasks and reports are reachable from ChatGPT, Claude, Claude Code, Cursor, the voice
mic on the floor, and the web app. The web app is now one head among several.

That is the category story every other cannabis software vendor cannot tell. They sell a UI
you have to live in. We sell the engine underneath, delivered through whatever interface the
operator already has open. This brief fixes the language so the landing page, the directory
listing, sales calls and investor conversations all say the same thing.

## The claim

> **NeuroCann is headless cannabis management software.** The system of record and the
> action layer run behind whatever interface your team already uses — voice on the floor,
> ChatGPT or Claude on a phone, Claude Code or Cursor at a desk, or our own app. One engine,
> many heads.

### What "headless" means here (and what it does not)

| Headless means | Headless does not mean |
| --- | --- |
| The engine (multi-tenant data, the propose → confirm → execute action layer, yield presets, reports) is the product; interfaces are delivery channels | "No UI." The NeuroCann web app exists, is the deepest head, and is where most writes happen today |
| Any MCP-capable assistant can read the facility and plan against it after a one-time account link | Any chatbot anywhere. It works in hosts that implement MCP (ChatGPT, claude.ai, Claude Desktop, Claude Code, Cursor, VS Code) |
| Public planners answer real cultivation and extraction questions without an account | The planners are the product. They are the top of the funnel, not the value |
| Operators choose the head per moment: mic while weighing, phone while driving, desk app for setup | Operators have to learn several tools. Each head is something they already use |

Rule for copy: with operators, translate "headless" into **"works where you already are."**
Use the word "headless" in headlines, SEO, technical and investor contexts; follow it with
the plain-language version in the next sentence every time.

## Narrative (the 60-second version)

1. **The problem is the tablet.** Every cannabis platform assumes the operator stops working
   to tap. Weights, moves, flags and tasks get captured late, by someone else, or on paper.
2. **We fixed the capture layer first.** NeuroCann's AI turns plain language into structured,
   previewed actions. Say it, check it, confirm it. That loop is the same on every surface.
3. **Then we removed the requirement to open our app at all.** With the NeuroCann plugin,
   an operator can ask ChatGPT or Claude what is drying, how much fresh frozen a cart order
   needs, what a gram of rosin costs to make, or to create a floor task — and get a live,
   facility-specific answer with an inline card.
4. **That makes NeuroCann headless.** The engine is the product. Heads come and go; the
   record of what happened in the facility stays consistent, confirmed and auditable.
5. **Proof you can touch today:** eight free planners in any MCP assistant, account linking
   via OAuth, API keys for Claude Code and Cursor, inline cards, voice action mode, and a
   web app covering seed to sale.

## Positioning pillars

| Pillar | One line | Evidence (shipped) |
| --- | --- | --- |
| **Works where you already are** | Same engine behind voice, chat assistants, dev tools and the web app | MCP server at `/mcp`, OAuth link, `nck_` API keys, voice action mode, web app |
| **Confirm before execute** | Nothing mutates until a human says yes, on every head | ActionPreview in app; MCP write tools limited to tasks, consent-scoped (`write:tasks`) |
| **Plans with real numbers** | Planners use process-template yields; linked facilities use their own history | `plan_extraction_inputs`, `estimate_cost_per_gram`, `plan_wash_schedule`, dry-weight, harvest yield/timeline, trim labor |
| **One record, seed to sale** | Plant map → harvest → trim → packages → extraction → tasks → reports in one tenant | Module coverage per `docs/sales-marketing/README.md` |
| **Built by operators** | Specific workflows, no hype vocabulary | Existing brand voice; keep it |

## Audiences and the message per audience

| Audience | What they care about | Lead message | Head to demo first |
| --- | --- | --- | --- |
| Owner-operator (1–3 licenses, cultivation + solventless) | Labor, yield, not babysitting software | "Ask ChatGPT what a gram of your rosin costs. Link your facility and it uses your real yields." | ChatGPT planner → link → facility overview card |
| Head grower / extraction lead | Hands busy, wants capture without tapping | "Say it on the floor, see it in the record." | Voice action mode in the app, then the same data in Claude on a phone |
| Director of ops / multi-site | Consistency, audit trail, reports | "One confirmed record no matter which interface the crew used." | `run_report` from Claude, then Reports in the app |
| Technical founder / integrator | API, control, no lock-in | "An MCP server with scoped keys. Wire it into Claude Code or Cursor in one line." | Claude Code `claude mcp add`, `get_facility_overview` |
| Investor / press | Category, defensibility, distribution | "The first headless cannabis management platform: distribution through the assistants people already use, not through another login." | The ChatGPT card with the brand on it |

## Messaging hierarchy

**Headline family (pick one per surface, do not mix):**

- Headless cannabis management. *(category line — SEO, decks, press)*
- Run your facility from wherever you already talk. *(operator line — landing hero candidate)*
- One engine. Every interface. *(short form — social, footer)*

**Sub-headline (operator):**
NeuroCann manages cultivation, harvests, trim, extraction, packaging, ordering and tasks —
and answers from ChatGPT, Claude, your voice, or our app. Confirm before anything changes.

**Supporting lines by pillar:**

- Works where you already are → "Add NeuroCann to ChatGPT or Claude. Ask about your rooms. Create a task. Nothing to install on the floor."
- Confirm before execute → "Every action is previewed before it hits the record — in the app, by voice, or from an assistant."
- Plans with real numbers → "How much fresh frozen for 1,000 half-gram carts? Ask. The answer uses process-template yields until you link, then yours."
- One record → "Plant map to packages to extraction runs, one tenant, one audit trail."

**Proof line to close any section:** "Try a planner now — no account needed."

## Safe claims vs do-not-claim

| Safe to say | Do not say (yet) |
| --- | --- |
| Works inside ChatGPT, claude.ai, Claude Desktop, Claude Code and Cursor (MCP) | "Works with any AI" / "any chatbot" |
| Eight free planners, no account | "Free tier" of the product |
| Link your facility with your NeuroCann login (OAuth) | Available in the ChatGPT Apps Directory — only after acceptance; until then "available in ChatGPT Developer Mode and as a Claude custom connector" |
| Read live plants, harvests, inventory, runs, tasks and reports from an assistant; create and complete tasks | Full facility control from an assistant. Writes via MCP are tasks only today; moves, weights, packages and runs are app/voice |
| Inline cards render results in ChatGPT and Claude | Rich dashboards inside ChatGPT |
| Planners use NeuroCann process-template yields; linked facilities use their own history | Planners use "industry benchmark data" |
| Voice action mode ships today | Ambient (always-on) mode as GA — still flagged |
| Tags and METRC-oriented fields ready for sync | METRC API sync |
| API keys are scoped read / write-tasks and hashed at rest | SOC 2 or any certification not held |

Every public claim about the plugin must survive a reviewer re-running it from a clean
ChatGPT account. The demo-honesty rule from `demo-readiness-apr2026.md` applies.

## Competitive frame

Do not name competitors in copy. Frame the alternative as a behaviour, not a brand:

- **"Tablet-first seed-to-sale suites"** — compliance-centred systems of record with a UI you
  must live in. Our line: they are where the data has to end up; we are how it gets captured
  and used without stopping work. (Keep this complementary; many prospects already own one.)
- **"Spreadsheets and group chats"** — the real incumbent in small facilities. Our line:
  you already ask these questions in chat; now the chat can answer from the record.
- **"Generic AI assistants"** — ChatGPT alone guesses yields and has no idea what is in
  Flower Room 2. Our line: same assistant, real numbers, your facility.

## Objections and answers

| Objection | Answer |
| --- | --- |
| "I don't want my facility data in ChatGPT." | Linking is per user, scoped (`read:facility`, optionally `write:tasks`), revocable in Settings → LLM Plugin. Assistants see tool results only when a user asks; NeuroCann does not train on customer data and neither host is given database access. |
| "Headless sounds like no app." | There is a full app; headless means you are not forced into it. Floor crews use voice, managers use the app, owners ask their phone. |
| "Can it change things from ChatGPT?" | Today it creates and completes tasks with explicit consent; everything else is read. Moves, weights, packages and runs still go through the app or voice where the preview is richer. More writes come as demand shows up. |
| "Are the planner numbers real?" | They are NeuroCann process-template presets and say so in every answer. Link a facility and the planner switches to your own per-strain history. |
| "What about METRC?" | Tags and METRC-oriented fields are in the record and ready for sync; the API integration is roadmap. |

## SEO and naming

Primary term to own: **headless cannabis management software**. Secondary: *cannabis
ERP ChatGPT app*, *cannabis MCP server*, *live rosin cost per gram calculator*, *fresh
frozen to rosin yield calculator*, *bubble hash wash schedule freeze dryer*, *harvest
dry weight calculator*. The free planners are the SEO assets; each deserves a static page
(see the landing-page brief). The app has no crawlable content today, which is the first
fix.

Product naming: the ChatGPT/Claude surface is **"the NeuroCann plugin"** in operator copy
and **"NeuroCann MCP server"** in technical copy. Do not call it "the AI" — the assistant is
the host's; NeuroCann is the engine.

## Voice and style (unchanged, restated)

Operator-first, specific over generic, short sentences, no "revolutionary / game-changing /
unlock," no emoji, Lato in product UI, brand green as accent not wallpaper. Name the workflow
("plan 1,000 carts backward to fresh frozen"), not the category ("streamline operations").

## Rollout order

1. **Today:** finish the ops checklist (Auth0 API, env, Developer Mode test, demo account).
2. **This week:** landing page hero + "works where you already are" section + planner pages
   per `landing-page-headless-brief.md`; update `README.md` platform story (done in this
   change); directory listing copy locked per the launch brief.
3. **On directory acceptance:** launch sequence in the launch brief; swap "Developer Mode"
   language for "in the ChatGPT Apps Directory."
4. **Next quarter:** more write tools behind consent (record weight, move plants, start run)
   so "headless" covers the floor loop end to end; cards for harvest pipeline and tasks.

## What this brief is not

Not a landing-page spec (see the landing brief), not a launch plan (see the launch brief),
not a pricing decision. Pricing stays unpublished until a tier structure exists.

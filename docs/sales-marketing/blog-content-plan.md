# NeuroCann Blog — Content Plan

Operating plan for `/blog`. Covers formats, cadence, pillars, a scheduled first quarter, a backlog for the second, and the production checklist every post goes through.

**Audience:** founders and anyone drafting or reviewing posts
**Source of truth for claims:** `docs/sales-marketing/modules/*.md` — each module page has a "Do not claim" list. Posts inherit it.
**Where posts live:** `src/content/blog/<slug>.md` (see "Production" below)

---

## 1. Goal

The blog exists to do one thing: show that the people behind NeuroCann have run rooms, harvests, and trim floors, and built the tool accordingly. Every post should leave an operator thinking "they know what my Tuesday looks like." Demo requests follow from that; the blog does not sell directly.

Secondary goals, in order:

1. Give sales something to send after a discovery call that is more specific than the landing page.
2. Build search presence on operator vocabulary (wet weight, dry-down, buck, fresh frozen, par level, velocity) rather than category terms ("cannabis ERP").
3. Document product decisions publicly so they are easier to defend and harder to drift from.

## 2. Audience

Same people as the product: trim managers, cultivation managers, extraction/lab managers, and owner-operators. Moderate-to-high tech comfort, no patience for generalities. They read on a phone between tasks, which is why most posts are short.

Not the audience: investors, consumers, people new to cannabis. Do not explain what trim is.

## 3. The two formats

The mix is **75% short, 25% deep**. Reading time is computed by the site at 220 words per minute (`estimateReadingMinutes` in `src/lib/blog.ts`) and shown on every card, so word counts are not aspirational — they are what the reader sees.

| | Floor Notes | Deep Dives |
|---|---|---|
| Share of posts | 75% (3 of every 4) | 25% (1 of every 4) |
| Displayed read time | 1–2 min | 8–10 min |
| Word count | 250–400 | 1,800–2,100 |
| Structure | One idea. Opening line states it. 0–1 H2. Optional single table or blockquote. Last line lands it. | 5–7 H2 sections, at least one table, at least one blockquote, a mandatory "What this is not" section, a short "What changes downstream" close. |
| Job | Make one specific point an operator will nod at. | Teach a whole workflow end to end, accurately enough that a manager could run it from the post. |
| Series | Belongs to one of the four recurring series below. | Standalone. One per pillar per quarter at most. |

### Floor Notes — four recurring series

Every short post belongs to exactly one series, and the series dictates its shape. This keeps shorts fast to write and consistent to read.

**One command** — A single thing an operator says, what the AI proposes, and why the preview step matters for that case. Shape: the command as a blockquote → the proposed action(s) as a 2–4 row table (field, value, how it was resolved) → one paragraph on what could go wrong without the preview. Only use commands the conversational tool surface supports today (plants, harvest, trim, packages, tags, tasks, licenses, strains, rooms — not ordering mutations; see `ordering-procurement.md`).

**Floor math** — One calculation operators do by hand, written out once, correctly. Shape: the question → the formula → a worked example in a table → one paragraph on where the inputs come from in the product. Never show a number the product cannot produce.

**Why we built it this way** — One product decision and the floor reality behind it. Shape: the decision stated flatly → the alternative we rejected → the moment on the floor that decided it → what it costs us. Honest about trade-offs; these posts earn trust by admitting what the decision gives up.

**Field note** — One observed problem from an actual floor and how the workflow absorbs it. Anonymized, specific, no customer names. Shape: the scene in two sentences → what went wrong → the fix as it exists in the product → one line on the downstream effect.

### Deep Dives — required sections

1. **The problem as it exists on the floor** — clipboards, Slack, the spreadsheet rebuilt every Friday.
2. **How the work actually flows** — the real stages, named the way the product names them (e.g. planning → cutting → submitted → hanging → final prep → completed).
3. **The workflow in NeuroCann** — the longest section. Walk the module. Use the module doc's demo script as the skeleton.
4. **Where voice fits** — one or two commands, always with the propose → preview → confirm loop made explicit.
5. **What this is not** — mandatory. Pull directly from the module doc's "Do not claim". This section is the single biggest reason operators will trust the rest of the post.
6. **What changes downstream** — the second-order effect on the next module in the seed-to-sale chain.

## 4. Cadence

**One post per week, in a four-week cycle: three Floor Notes, then one Deep Dive.** That produces the 75/25 mix exactly and puts a deep dive at weeks 4, 8, 12 of each quarter.

Per quarter: 9 Floor Notes + 3 Deep Dives = 12 posts.

If the schedule slips, drop a Floor Note, never a Deep Dive. The deep dives are what sales sends after calls.

Writing budget, realistically: a Floor Note is a single sitting; a Deep Dive is a module-doc read, a draft, a claims pass, and a second read. Batch the shorts — write a month of Floor Notes in one session so the deep dive gets uninterrupted time.

## 5. Pillars

Six pillars, mapped to modules and the people who care about them. Each quarter should touch every pillar at least once; deep dives rotate so no pillar gets two in a row.

| Pillar | Modules | Reader | Vocabulary to own |
|---|---|---|---|
| Harvest & post-harvest | Harvest Pipeline, bins/cure | Harvest leads, cultivation managers | wet weight, dry-down, hang, buck, bin, burp, fresh frozen split |
| Trim floor | Trim Sessions, Reports | Trim leads, managers, owners | flower/shake/trim/waste, per-trimmer, rollover, g/hr, $/lb |
| Extraction | Extraction, Supplies | Extraction managers, contract extractors | wash, freeze-dry, press, yield %, backward planning, par level |
| Compliance & inventory | Packaging & Compliance, Tags, Settings | Compliance, post-harvest, lab | package, lab state, adjustment reason, tag pool, METRC-ready |
| Buying & vendors | Ordering & Procurement, Supplies | Buyers, procurement managers | velocity, coverage window, multi-store matrix, vendor menu, biomass sourcing |
| How NeuroCann works | AI & Voice, Tasks, Team & Roles, Settings | Everyone; especially owners evaluating | propose/preview/confirm, hybrid task, department gating, strain flowering days |

## 6. Quarter 1 schedule (weeks 1–12)

Three cycles. Deep dives at weeks 4, 8, 12. Slugs are proposed; tags use the taxonomy in section 8.

| Wk | Format / series | Working title | Pillar | Angle | Claims to watch |
|---|---|---|---|---|---|
| 1 | Floor math | **Dry-down math: what 75% moisture loss means for the trim schedule** | Harvest | Wet weight × (1 − moisture loss) = estimated dry weight; why trim progress bars use the dry baseline. Worked example from a 5,832 g harvest. | Moisture loss is a harvest-level estimate (default 75%), not a measured sensor value. |
| 2 | One command | **"Move the OG Kush from veg 2 to flower 1"** | How it works / Cultivation | What `move_plants` resolves (strain group, source room, target room, count), and how flipping to flower auto-fills a harvest date from the strain's flowering days. | Fuzzy resolution is the point; show the preview catching an ambiguous room name. |
| 3 | Why we built it | **Why quantity isn't a free-edit field** | Compliance | Package adjustments require a METRC-aligned reason (waste, moisture loss, processing loss, theft, reconciliation) and write a ledger entry. The alternative — editable number — and why it fails an audit. | Ledger is METRC-aligned, not METRC-synced. |
| 4 | **Deep Dive** | **The six stages of a harvest, and where each one leaks** | Harvest | Planning → cutting → submitted → hanging → final prep → completed. Harvest Day cockpit, flower/frozen/both allocation, manager approval gate, bins and cure logs, handoff to trim. | Not ambient auto-apply; not METRC auto-submit; frozen pathway skips hang/buck visually; approval-gated submitted → hanging. |
| 5 | Field note | **The press bags ran out mid-wash** | Extraction / Supplies | A remote lab stops because nobody owned the consumables count. Par levels, low/out badges, receive/consume ledger, SOP steps declaring supply requirements. | Supplies do not auto-decrement from every floor action; not an ERP. |
| 6 | Floor math | **Rolling velocity × coverage window − on hand** | Buying | The order-quantity math serious buyers already do, written out. Worked example across four stores with red/yellow/green cover status. | Sales data is a POS CSV import — not a live Dutchie/POS API. |
| 7 | One command | **"Add Maria to the Gelato batch with scissors"** | Trim | Trimmer assignment: profile resolution, batch resolution across two active entries, scissors vs machine, start time. | Not a timeclock or piece-rate system. |
| 8 | **Deep Dive** | **Planning a rosin run backward from the cart count** | Extraction | "I need 200 live rosin carts" → rosin grams → hash grams at historical yield → fresh frozen pounds → biomass gap → supplier email thread → start run prefilled. Why forward and backward planning both have to exist. | No solvent/closed-loop regulatory automation; no METRC sync for concentrates; weight steps are the hard gate, schedule is virtual. |
| 9 | Why we built it | **Why health is scored per strain per room, not per plant** | Cultivation | A contaminant catalog with fixed impact scores on a strain × room group, versus a per-plant number nobody will maintain. What it gives up (individual plant history) and why that is the right trade. | No cameras, sensors, or automated pathogen detection. |
| 10 | Field note | **The trim tech who could see the purchase orders** | How it works / Team | Four roles, seven departments, sidebar gating. The moment a buyer's PO list showed up on a floor tablet, and what department scoping does about it. | Not SSO/SCIM; not field-level permissions. |
| 11 | Floor math | **Labor cost per pound from one wage number** | Trim / Reports | Trim labor hours × wage ÷ flower pounds. Why it is a management lever rather than a payroll export; where the hours come from (session start/end per trimmer). | Wage is a client-side estimate; not payroll/HRIS. Do not mention the NL report builder. |
| 12 | **Deep Dive** | **One tag pool for plants, batches, and packages** | Compliance | Tag lifecycle (available → assigned → voided), auto-generate vs CSV upload, phase triggers (nursery→veg, veg→flower), batch-tag requirement, assignment on packages, Tag List browse. What "METRC-ready" means precisely when there is no API connection yet. | Be explicit: no live METRC sync; `metrc_synced_at` is prep. Starting-tag selector for printed rolls is roadmap. |

### Series balance in Q1

Floor math ×3, One command ×2, Why we built it ×2, Field note ×2. Deep dives cover Harvest, Extraction, Compliance — the three pillars with the most buyer anxiety.

## 7. Quarter 2 backlog (unscheduled, format-labeled)

Pull from here to fill the Q2 grid. Keep the 3:1 rhythm and rotate deep dives to the pillars Q1 did not cover (Trim floor, Buying, How it works).

**Deep Dives (pick 3)**
- **From bin to tagged package: the chain of custody through trim** — Trim floor. Ready bin → trim entry → per-trimmer weights → submit → multi-row package create → tag assignment. Rollover across shifts.
- **What a vendor menu PDF becomes** — Buying. AI menu parse → review → catalog → SKU matcher for POS exports → velocity suggestions → multi-store PO. Claims: PO submit does not email the vendor; outreach is the separate supplier thread.
- **Setting up a facility: the five settings that make everything else accurate** — How it works. Licenses, strains (flowering days), rooms (type, capacity), tag policy, product catalog. Framed as "why voice resolution and harvest dates depend on this."
- **Confirm before execute, expanded** — How it works. The existing launch post is the platform thesis at 3 minutes; a deep-dive version can cover entity resolution, screen context, fan-out, hybrid tasks, and the roadmap for allowlisted AI tasks with human approval. Claims: no autonomous execution today.

**Floor Notes**
- One command — **"Finish all active Wedding Cake flower packages in Vault 1"** — lookup → multi-package proposal → confirm. Compliance.
- One command — **"Plant 7 is 512 grams, has some PM"** — two actions from one sentence (already the hero demo; the short post explains the fan-out). Harvest.
- One command — **"Remind the trim lead to sanitize stations before Friday's session"** — a human task from chat, with assignee and due date. Tasks.
- Floor math — **Yield percent, per step** — input → output at each extraction step; why the run-level number hides where the loss happened. Extraction.
- Floor math — **Flower, frozen, or both: splitting one harvest two ways** — target weights by allocation, what each pathway skips. Harvest.
- Floor math — **Reorder quantity from par** — QOH, par, reorder qty; when low becomes out. Supplies.
- Why we built it — **Why a wash starts before the yield is known** — outputs are not required to start a run; the old gate and why it was wrong. Extraction.
- Why we built it — **Why a wash is 4.5 hours regardless of input weight** — fixed cycle time; no time-scaling in SOP steps. Extraction.
- Why we built it — **Why the AI is told which screen you're on** — screen context changes how "the active batch" resolves. How it works.
- Why we built it — **Why cure logs sit between hanging and trim** — bins as a first-class stage: burp, aerate, inspect, moisture. Harvest.
- Why we built it — **Why strain flowering days is the one setting that sets your harvest calendar** — flip date + flowering days = harvest date. Cultivation / Settings.
- Field note — **The batch that was half done at five o'clock** — rollover from the night crew's point of view. Trim.
- Field note — **A supplier replied, and the catalog updated** — inbound email parsed into vendor product rows. Buying. Claims: email only; no SMS.
- Field note — **Lab says failed. Now what?** — lab states, hold/resume, the adjustment trail. Compliance.
- Field note — **The hybrid task** — move the plants (physical), then the room update is proposed (digital). Tasks.

## 8. Production

### Frontmatter

```markdown
---
title: "Rolling velocity × coverage window − on hand"
description: "The order-quantity math serious buyers already do, written out once with a four-store example."
date: 2026-11-05
author: NeuroCann Team
tags: [ordering, floor-math]
---
```

- `title` — sentence case, no trailing period, under 60 characters where possible. Floor math and One command titles may be the formula or the quoted command.
- `description` — one sentence, 120–160 characters. This is the card copy and the meta description; write it as the reason to click, not a summary.
- `date` — `YYYY-MM-DD`, the publish date. Posts sort newest-first by this field.
- `tags` — one domain tag, plus one series tag for Floor Notes (none for Deep Dives). Two tags maximum.
- `draft: true` — keeps a file in the repo but out of the site. Remove when publishing.

### Tag taxonomy

Domain (exactly one): `harvest` · `trim` · `extraction` · `cultivation` · `compliance` · `ordering` · `supplies` · `tasks` · `team` · `platform`

Series (Floor Notes only, exactly one): `one-command` · `floor-math` · `why-we-built-it` · `field-note`

The three launch posts use `voice`, `ai`, and `operations`; those are grandfathered and should not be used on new posts.

### Slugs

Filename is the URL. Lowercase, hyphens, no stop-word trimming needed, under 50 characters. Lead with the noun operators would search for: `dry-down-math`, `velocity-coverage-on-hand`, `one-tag-pool`. Slugs are permanent once published.

### Voice rules (from the brand brief, applied to prose)

- Operator-first. Written by people who have done the work. Short sentences.
- Specific over generic. Name the stage, the field, the number. "Submitted → hanging is approval-gated" beats "a robust approval workflow."
- No hype words: revolutionary, game-changing, seamless, powerful, unlock, supercharge, leverage.
- No emoji. No stock imagery. No leaf motifs. Images only when they carry information (a table usually does the job).
- Industry terms without cannabis branding: flower, shake, trim, waste, wet weight, fresh frozen.
- One CTA per post, and it is already in the page template. Do not add "book a demo" lines inside the body.

### Pre-publish checklist

1. Read the relevant module page in `docs/sales-marketing/modules/`. Every capability named in the post appears under "Key capabilities (shipped)." Nothing in the post appears under "Do not claim."
2. Roadmap items appear only in a clearly labeled forward-looking sentence ("on the roadmap," "not yet"), never as the topic of a post.
3. Word count is inside the format band (250–400 or 1,800–2,100). Check the displayed read time on the index card after a local build.
4. Deep Dives have a "What this is not" section.
5. Description is 120–160 characters and reads as a reason to click.
6. Title, description, and body contain no hype words and no emoji.
7. Tags follow the taxonomy. Slug is final.
8. Run `npm test` — `src/lib/__tests__/blog.test.ts` validates frontmatter and sort order for every post.

## 9. Topics to avoid

Grounded in the module docs and `docs/ROADMAP.md`. Revisit when the product changes.

| Do not write about | Why |
|---|---|
| Ambient / always-listening mode | Feature-flagged off; roadmap marks it deferred with deletion planned. Action-mode voice is the story. The one sentence about ambient in the launch post "Harvest day with gloved hands" should be revisited if the deletion lands. |
| METRC API sync, auto-submit, transfers, manifests | Roadmap. Tags, reason codes, and METRC-oriented fields are the honest story. |
| Natural-language report builder | Built, not exposed in the Reports nav. Trim performance is what ships. |
| Cultivation SOPs generating tasks | Authoring and storage today; launch → task generation is not wired. Extraction templates driving live runs is the safe SOP story. |
| Creating purchase orders by chat/voice | Executor supports it; conversational tools are not fully wired. Ordering stories go through the UI. |
| Live POS/Dutchie sync, SMS outreach | CSV import and email only. |
| Scale hardware, sensors, cameras | None exist. Numbers are read by a person and confirmed. |
| Autonomous AI agents | Roadmap (allowlisted, approval-gated). Confirm-before-execute is the current truth. |
| Customer names, testimonials, logos | Not yet. Field notes are anonymized composites. |
| Pricing | Not ready. |

## 10. The three launch posts

"Harvest day with gloved hands," "Confirm before execute," and "Where every gram goes" were published before this plan and sit at ~3 minutes each — between the two bands. They stand as launch posts. When revising:

- Expand **Confirm before execute** into the Q2 deep dive listed above; it is the platform thesis and deserves the long form.
- Leave the other two as-is. They are the closest things to deep-dive summaries of their pillars and work as the "read this first" link for Harvest and Trim.

Going forward, every new post lands in one of the two bands.

## 11. Measurement

There is no analytics instrumentation on the public site today. Until there is, measure the blog by two things sales can observe directly:

1. Which posts get sent after discovery calls, and whether prospects reference them on the next call.
2. Demo requests whose first message mentions a post or a topic the blog owns.

When analytics are added, the numbers that matter are read-through on deep dives and click-through from the landing page "From the Blog" section — not raw pageviews.

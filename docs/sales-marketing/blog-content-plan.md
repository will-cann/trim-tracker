# NeuroCann Blog — Content Plan

Operating plan for `/blog`. **Direction: cannabis operator content — learnings from the facility.** The blog publishes what running rooms, harvests, trim floors, and extraction programs actually taught us and the operators we work with. The product is background, not subject.

**Audience for this doc:** founders and anyone drafting or reviewing posts
**Source of truth for any product claim:** `docs/sales-marketing/modules/*.md` — each page has a "Do not claim" list
**Source of truth for operator learnings:** the Learnings Bank in section 11 (seeded from SME calls and the founders' own facility time), plus whatever gets added to it
**Where posts live:** `src/content/blog/<slug>.md`

---

## 1. Goal

An operator should be able to read any post, never buy NeuroCann, and still have gotten something they will use on the floor this week. That is the test. If a draft only makes sense to someone evaluating software, it is not a blog post.

What this earns:

1. **Credibility that the landing page cannot.** "Built by operators" is a claim. A post that knows a wash takes 4.5 hours regardless of input weight, or that you make the 420 rosin in February, is proof.
2. **Search presence on operator vocabulary** — wet weight, dry-down, buck, bin, fresh frozen, bubble hash yield, par level, coverage window — not on category terms like "cannabis ERP."
3. **Something sales can send after a call** that reads as a peer sharing notes, not a vendor following up.

## 2. Audience

Trim managers, cultivation managers, extraction leads, lab techs who want to become leads, and owner-operators. Moderate-to-high tech comfort, no patience for generalities, reading on a phone between tasks. Many run contract or multi-state programs and think in grams needed, pounds of biomass, and dollars per gram.

Not the audience: investors, consumers, people new to cannabis. Do not explain what trim is. Do not explain what METRC is.

## 3. The operator rule

Every post follows one rule: **the learning is the subject; the product, if it appears at all, is one sentence at the end.**

- Floor Notes: optional closing line in the form "How we handle it: …" — one sentence, present tense, only shipped behavior. Most Floor Notes should skip it.
- Deep Dives: an optional final section, **"What we built because of this,"** no more than one paragraph, subject to the claims checklist. The page template already carries the demo CTA; do not add one in the body.
- Never structure a post around a feature. Structure it around a decision an operator has to make, a number they have to hit, or a thing that went wrong.

## 4. The two formats

The mix is **75% short, 25% deep**. Read time is computed by the site at 220 words per minute (`estimateReadingMinutes` in `src/lib/blog.ts`) and shown on every card, so word counts are what the reader sees.

| | Floor Notes | Deep Dives |
|---|---|---|
| Share of posts | 75% (3 of every 4) | 25% (1 of every 4) |
| Displayed read time | 1–2 min | 8–10 min |
| Word count | 250–400 | 1,800–2,100 |
| Structure | One learning. Opening line states it. 0–1 H2. Optional single table or blockquote. Last line lands it. | 5–7 H2 sections, at least one table of real numbers, at least one blockquote (an operator's words), a "Where this breaks" section, and a short "What to do Monday" close. |
| Job | Hand an operator one thing they can use or repeat. | Teach a whole piece of running a facility — the numbers, the sequence, the failure modes — well enough that a new lead could run it from the post. |
| Series | Belongs to one of the four recurring series below. | Standalone. One per pillar per quarter at most. |

### Floor Notes — four recurring series

Every short post belongs to exactly one series. The series dictates its shape, so shorts are fast to write and consistent to read.

**Floor math** — One calculation operators do by hand, written out once, correctly, with a worked example. Yield math, unit economics, dry-down, reorder quantities. Shape: the question → the formula → a worked table → one line on which input people get wrong. Label ballpark numbers as ballpark.

**Rule of thumb** — One standard a good facility runs on and the reason behind it. Batches in 500-gram steps. Walk the crop before buying the first pound. Somebody counts grams in and out. Shape: the rule stated flatly → the fact that forces it → what happens when it is skipped → the rule restated.

**What went wrong** — A war story and the lesson. Anonymized, specific, no villains. Shape: the scene in two sentences → what it cost → what it was actually a signal of → the change made. These are the posts operators forward to each other.

**On the calendar** — Seasonal and cyclical timing learnings. When to make the 420 rosin, when to lock the next biomass supplier, how to read last June. Shape: the date → what has to be true by then → working backward → the reminder to set.

### Deep Dives — required sections

1. **What this part of the operation is for** — one paragraph, plainly.
2. **The numbers** — a table of the quantities that govern it (yields, capacities, cycle times, prices, minimums). Firm vs. ballpark marked.
3. **The sequence** — how the work actually flows, in the order it happens, with the decision points named.
4. **Where this breaks** — the failure modes we have seen or been told about, and what each one is a symptom of.
5. **What the good operators do differently** — the habits, not the tools.
6. **What to do Monday** — three to five concrete actions.
7. *(Optional)* **What we built because of this** — one paragraph, claims-checked.

## 5. Cadence

**One post per week, in a four-week cycle: three Floor Notes, then one Deep Dive.** That produces the 75/25 mix exactly and puts a deep dive at weeks 4, 8, and 12 of each quarter.

Per quarter: 9 Floor Notes + 3 Deep Dives = 12 posts.

If the schedule slips, drop a Floor Note, never a Deep Dive. Batch the shorts: write a month of Floor Notes in one sitting from the Learnings Bank so the deep dive gets uninterrupted time.

## 6. Pillars

Seven pillars, framed as parts of running a facility rather than as product modules. Each quarter touches every pillar at least once; deep dives rotate so no pillar gets two in a row.

| Pillar | What it covers | Who reads it | Vocabulary to own |
|---|---|---|---|
| Harvest & dry room | Planning the cut, wet weights, flower vs. frozen split, hanging, bucking, bins, cure | Harvest leads, cultivation managers | wet weight, dry-down, hang, buck, bin, burp, fresh frozen |
| Trim floor & shrink | Per-person accounting, rollover, yield variance, where product walks | Trim leads, managers, owners | flower/shake/trim/waste, g/hr, start weight, reconciliation |
| Extraction program | Solventless workflow, batch sizing, cycle times, dryer capacity, yield by route, COGS | Extraction leads, contract extractors, lab techs | wash, freeze-dry, press, yield %, 500 g, carts |
| Sourcing biomass | Finding, pricing, inspecting, and keeping fresh frozen suppliers | Extraction leads, buyers | $/lb, first refusal, light dep, genetics deals |
| Compliance in practice | METRC day to day: IDs, weights, lag, who owns it, what an audit scramble looks like | Compliance, managers, owners | package ID, adjustment reason, transfer, tag |
| Team, labor & accountability | Tech task grain, escalation cost, turnover, access, the disgruntled-employee problem | Owners, managers | green-check, lead, department, deactivate |
| Planning & economics | Demand-backward planning, seasonal calendar, unit economics, standing orders | Owners, extraction leads, buyers | grams needed, coverage, 420/710, $/g |

## 7. Quarter 1 schedule (weeks 1–12)

Deep dives at weeks 4, 8, 12. Every row cites its Learnings Bank entries (section 11) so the source is traceable. Slugs are proposed.

| Wk | Series | Working title | Pillar | The learning | Bank |
|---|---|---|---|---|---|
| 1 | Floor math | **From carts back to pounds** | Planning | 1,000 carts ≈ a little over 500 g rosin. At 3.5% yield that is ~35 lb fresh frozen; at 5% closer to 30 lb. Work the chain backward with a table at three yield points. Ballpark-labeled. | E4, P1 |
| 2 | Rule of thumb | **Walk the crop before you buy the first pound** | Sourcing | New supplier, new building, or first harvest at a site: go on-site before harvest and verify strains and quality in person. Why remote photos and a price quote are not enough. | S3, H2 |
| 3 | What went wrong | **The best pound of shake I ever bought** | Harvest / Sourcing | Delicate, well-grown flower vacuum-sealed and driven in a trunk arrived as shake. The lesson is about matching transport and packaging to structure, and pricing the risk in. | H4 |
| 4 | **Deep Dive** | **A solventless wholesale program, by the numbers** | Extraction / Planning | Grams needed → pounds of biomass → price tier → batch sizing (500 g test floor, equipment-defined ~17 kg fills) → 4.5-hour washes at 2/day → freeze-dryer as the real ceiling → ballpark COGS ($2–3/g at $65/lb and ~4%; ~$6.50/g at $100/lb) against $9–12/g wholesale → 3–5 kg/month cadence. | E1–E8, S1, S2, P1–P3 |
| 5 | On the calendar | **Make the 420 rosin in February** | Planning | Set the reminder for the end of February. Product finished April 10 is too late; serious buyers bought on April 1. The week after 420 is for locking the next biomass supplier. Same logic for June and 710. | P4, P5, P6 |
| 6 | Floor math | **Dry-down: what 75% moisture loss does to the trim schedule** | Harvest | Wet weight × (1 − moisture loss) = the weight trim will actually see. Worked example: 5,832 g wet → ~1,458 g dry at 75%. Why trim capacity should be planned off the dry number, not the harvest-day number. | H5 |
| 7 | Rule of thumb | **Keep the batch size the same run to run** | Extraction | A 4% result on 1,500 g and a 4% result on 400 g are not the same information; consistent batches are what make yield comparisons between strains and suppliers mean anything. *(Replaces "Somebody has to count grams in and out," which was published early as "A nug in the glove, a glove in the pocket.")* | E1, E8 |
| 8 | **Deep Dive** | **Harvest day, start to finish** | Harvest | The cut planned from strain flowering days; per-plant wet weights at the scale; flower vs. fresh frozen allocation decided before anything hangs; contamination and waste logged in the moment; hang → bin → cure (burp, aerate, inspect, moisture) → release to trim. Drawn from the founders' own harvest days. | H1, H5, H6 |
| 9 | What went wrong | **When the new trim manager's yields look too good** | Trim / Shrink | A facility whose first one or two harvests after every trim-manager change showed remarkable yields. Not a biology story. What to check first: start weights, waste logging, per-trimmer totals against batch totals. Framed as a control signal, not an accusation. | T1, T3 |
| 10 | Rule of thumb | **The wash takes 4.5 hours no matter what you put in it** | Extraction | Cycle time is fixed, not input-dependent. Plan two washes a day, three when pushing, one when the calendar is full. The freeze dryer, not the wash vessel, sets the real daily ceiling. | E5, E7 |
| 11 | Floor math | **The 15-minute phone call for press bags** | Team / Supplies | A remote tech calls the lead for every consumable decision; each call costs 10–20 minutes of a manager's time. Par level, reorder quantity, and lead time written down once removes the call. Worked example for bags, papers, and wash bags. | L2, E9 |
| 12 | **Deep Dive** | **METRC without the 45-minute phone call** | Compliance | What day-to-day compliance looks like without an API: dictating IDs and weights three or four times, weeks of silence and then an audit scramble, production staff who never log in by design. Then the habits that fix most of it: record IDs and weights at the moment of production, one owner, a daily five-minute reconciliation, CSV discipline. Honest that the API problem is not solved. | C1–C4 |

**Series balance:** Floor math ×3, Rule of thumb ×3, What went wrong ×2, On the calendar ×1. **Deep dives:** Extraction/Planning, Harvest, Compliance.

## 8. Quarter 2 backlog (unscheduled, format-labeled)

Keep the 3:1 rhythm. Rotate deep dives to pillars Q1 did not cover (Trim floor, Sourcing, Team).

**Deep Dives (pick 3)**
- **Reconciling the trim floor** — Trim. Start weight to four buckets, per person; rollover across shifts; what variance between trimmers normally looks like and when it is a signal. *(T1–T4)*
- **Sourcing fresh frozen: a year in the life** — Sourcing. Genetics-for-biomass deals, first-refusal pricing, the asking price vs. the paid price, walking the crop, the post-420 and post-710 sourcing trips, why vertical supply is intermittent even for a good garden. *(S1–S6)*
- **Running a lab you are not standing in** — Team. Remote techs across states; task grain that works ("row three, fifth node"); the green-check accountability model; consumables ownership; what access to revoke, and when, before a difficult conversation. *(L1–L5)*
- **Freeze-dryer math** — Extraction. Shelves, micron grades, why a big wash can out-produce the dryer, and how to size washes to the dryer rather than the vessel. Ballpark-heavy; label it. *(E6)*

**Floor Notes**
- Rule of thumb — **Give genetics away to lock the fresh frozen** — the 3–5 month deal cycle and the first-refusal discount. *(S1)*
- Rule of thumb — **Combine washes of the same strain into one batch** — nobody stops between washes; test once. *(E2, E3)*
- Rule of thumb — **Keep the batch size the same run to run** — a 4% result on 1,500 g and on 400 g are not the same information. *(E1)*
- Rule of thumb — **Plan from grams needed, not from plants** — the first question in a wholesale program. *(P1)*
- Floor math — **Standing orders: two QPs and an HP** — turning a client's recurring order into a monthly gram target. *(P3)*
- Floor math — **Asking price vs. paid price** — $183 asked, $150 under 100 lb, $120 over, ~$100 after the "still have it?" callback. *(S4)*
- Floor math — **Yield by route** — fresh frozen → bubble hash ≈ 8%, fresh frozen → live rosin ≈ 4%, dry trim → rosin ≈ 20%; why a strain-level yield number is meaningless without the route. *(E4)*
- Floor math — **What a plant tag costs** — about a dollar a plant, plus the wanding labor; RFID room scans as the alternative. *(C5)*
- What went wrong — **Three weeks of silence, then the audit** — compliance that runs in bursts never stands a chance. *(C2)*
- What went wrong — **The yields were great until someone weighed the waste** — waste logging as the missing bucket. *(T2)*
- What went wrong — **Outdoor beat the indoor** — a genetics partner's outdoor fresh frozen out-yielded and out-tasted the in-house indoor; what that does to the sourcing plan. *(S5)*
- On the calendar — **Every June you run out of the same thing** — reading last year's 710 to set this year's buy. *(P5)*
- On the calendar — **The week after 420** — the sourcing trip, not the victory lap. *(P6)*
- On the calendar — **Hang, bin, release** — the dry-room clock from cut to trim-ready and how to stagger cuts so trim never idles. *(H6)*

## 9. Sourcing learnings, and anonymization

**Where learnings come from**
- The founders' own facility time (rooms, harvests, trim floors).
- SME and customer calls. After every call, add the operator learnings — not the product feedback — to the Learnings Bank in section 11 with a date and a firm/ballpark flag.
- Operators who agree to be quoted. Quotes are the best blockquotes we will ever have; ask.

**Founder anecdotes — the primary stream**

There is a personal anecdote behind nearly every feature. Those are the highest-value posts this blog can run, because nobody else can write them. The process:

1. A founder recounts the story in their own words — spoken, rough, unedited. A voice memo or a chat transcript is fine. Do not write it up first; the writing-up loses the details that make it real.
2. The anecdote is captured as one or more **F entries** in the Learnings Bank (section 11), anonymized, with the specific numbers, timings, and roles preserved.
3. Each distinct learning inside the anecdote becomes its own Floor Note. One story usually holds two or three. Do not cram them into one post.
4. The feature the anecdote produced appears as the final "How we handle it" sentence, or not at all. The post is about the room, not the software.

Prompt sheet for the sit-down (work through one feature at a time):

| Ask | Why it matters |
|---|---|
| What was the day? Where were you standing, what was in your hands? | The scene is the first two sentences of a "What went wrong" post. |
| What did it cost — in hours, grams, dollars, or people's time? | Every post needs a number in the first hundred words. |
| Who was carrying the problem, and what was their actual job title? | Roles make it real; names come out later. |
| What did you try first that did not work? | The failed fix is usually the most useful paragraph. |
| What is the rule you run on now because of it? | That is the "Rule of thumb" post hiding inside the story. |
| Is there a number you still remember? A weight, a count, a day-count, a time of day? | Firm numbers get published; "about" numbers get labeled approximate. |
| Which of these details would identify the facility or a person? | Decides what gets abstracted to a role or a state. |

**Anonymization rules (non-negotiable)**
- No people's names, company names, brand names, or facility names. "An extraction lead who runs programs in several states." "A multi-store operator."
- Locations only at state level, and only when the state matters (testing minimums, tag rules).
- Dollar figures, yields, and capacities are fine; they are the point. Mark them **firm** (stated as how they operate) or **ballpark** (stated as rough, or an illustrative example) exactly as the source did.
- Equipment may be described by type and capacity ("a commercial wash vessel with a ~17 kg input capacity"), not by brand.
- War stories involving theft, termination, or regulatory trouble are told as patterns and signals, never as accusations about an identifiable party. If a story cannot be told without identifying someone, it does not run.
- Secondhand stories ("someone just got busted") do not run as learnings.

## 10. Production

### Frontmatter

```markdown
---
title: "The wash takes 4.5 hours no matter what you put in it"
description: "Cycle time is fixed, not input-dependent. Plan two washes a day and let the freeze dryer set the ceiling."
date: 2026-11-19
author: NeuroCann Team
tags: [extraction, rule-of-thumb]
---
```

- `title` — sentence case, no trailing period, under 60 characters where possible. A rule of thumb may be the rule itself; a floor math title may be the formula.
- `description` — one sentence, 120–160 characters, written as the reason to click. It is the card copy and the meta description.
- `date` — `YYYY-MM-DD`, publish date. Posts sort newest-first by this field.
- `tags` — one pillar tag, plus one series tag for Floor Notes (none for Deep Dives). Two tags maximum.
- `draft: true` — keeps a file in the repo but out of the site. Remove when publishing.

### Tag taxonomy

Pillar (exactly one): `harvest` · `trim` · `extraction` · `sourcing` · `compliance` · `team` · `planning` · `cultivation`

Series (Floor Notes only, exactly one): `floor-math` · `rule-of-thumb` · `what-went-wrong` · `on-the-calendar`

The launch posts use `voice`, `ai`, `platform`, and `operations`; those are grandfathered and should not be used on new posts.

### Slugs

Filename is the URL. Lowercase, hyphens, under 50 characters, permanent once published. Lead with the thing an operator would search: `carts-back-to-pounds`, `wash-takes-4-5-hours`, `make-the-420-rosin-in-february`.

### Voice rules

- Written by someone who has done the work, to someone who does it. Short sentences. Numbers in the first hundred words.
- Specific over generic. "Batches in 500-gram steps because the test is $500" beats "right-sized batches."
- No hype words: revolutionary, game-changing, seamless, powerful, unlock, supercharge, leverage, optimize.
- No emoji. No stock imagery. No leaf motifs. Images only when they carry information; a table usually does the job.
- Operator vocabulary, no consumer or counter-culture register.
- Admit what we do not know. "Ballpark," "one operator's numbers," and "we have seen this twice" are credibility, not weakness.

### Pre-publish checklist

1. **The operator rule.** Would this be worth reading to someone who will never buy the product? If not, rewrite or cut.
2. **Source.** Every learning traces to a Learnings Bank entry or to the author's own experience. Ballpark numbers are labeled.
3. **Anonymization.** No names, brands, facilities. Locations at state level only. Section 9 rules applied.
4. **Product claims.** Any sentence about NeuroCann is checked against the module doc's "Key capabilities (shipped)" and appears nowhere in "Do not claim." Roadmap items appear only as "not yet."
5. **Length.** 250–400 or 1,800–2,100 words. Confirm the displayed read time after a local build.
6. **Structure.** Floor Notes follow their series shape. Deep Dives have "Where this breaks" and "What to do Monday."
7. **Description** is 120–160 characters and reads as a reason to click. No hype words or emoji anywhere.
8. **Tags and slug** follow the taxonomy. Run `npm test` — `src/lib/__tests__/blog.test.ts` validates every post's frontmatter and sort order.

## 11. Learnings Bank

Seed material, anonymized, extracted from SME calls (spring 2026) and the founders' facility experience. **Firm** = stated as how they operate. **Ballpark** = stated as rough or illustrative. Add to this list after every operator conversation; cite entries by ID from the schedule.

### Founder anecdotes (F)
Captured from the founders directly. Former employers are not named in posts; "a vertically integrated operator" / "an operator we helped launch post-harvest and supply-chain processes" are the stand-ins unless the founders decide otherwise.

- **F1** · firm · The trim room ran on paper: one sheet per batch (start weight, trimmers, flower / small bud / trim / waste). Sheets went to the compliance administrator, who re-keyed them into a spreadsheet, verified weights, and then entered METRC. Four inventories existed at once — paper, spreadsheet, digital inventory, METRC — and there were full-time roles whose job was reconciling them. *Posts: "A nug in the glove, a glove in the pocket."*
- **F2** · firm · Trim crews are often third party with rotating staff. Product loss is small and chronic ("a nug in the glove, a glove in the pocket, for lunch") and adds up over a season. Accountability came from weighing what goes onto the table and what comes off, per person and per bucket, at the time — not from the sheet. A live count also protects the honest crew; with four inventories and no live count, any gap landed on everyone. *Posts: same.*
- **F3** · firm (timing approximate) · Trim is the first point you get a dry weight — roughly 21 days after the chop — and therefore the first point to grade a crop. From a trim batch you can read dry yield by strain, cut performance vs. the mother's previous rounds, the large-bud / small-bud / trim ratio by strain, per-trimmer speed and ratios, and cost per pound. Most facilities record flower and waste for compliance and let the rest die on the sheet. *Posts: "Trim is the first real weight you get after the chop."*
- **F4** · firm · Origin: the accountability-and-re-keying problem was seen first at a vertically integrated operator; the yield-feedback insight came while launching post-harvest and supply-chain processes for a second operator. The trim tracker was the first thing built, and it was built for both reasons at once: save the administrator's time, and make the room's count live.

*Next anecdotes to capture (one sit-down each): harvest day and the cockpit; plant map and health scoring; bins and cure logs; extraction templates; tags and the adjustment ledger; ordering and the store matrix; SOPs; tasks and hybrid completion.*

### Harvest & dry room (H)
- **H1** · firm · Common dry-to-trim path is hang → bin → release bins to trimmers when ready; bins are where cure happens.
- **H2** · firm · A first harvest at a new site or building is a sourcing risk; inspect before committing.
- **H3** · firm · Trim-manager turnover followed by remarkable yields on the next one or two harvests is a control signal, not biology.
- **H4** · firm · Delicate, well-structured flower vacuum-sealed and transported in a trunk arrived as "the best pound of shake I've ever bought."
- **H5** · firm · Wet-to-dry moisture loss runs around 75%; plan trim capacity off the dry number.
- **H6** · founders · Cure logs between hanging and trim: burp, aerate, inspect, moisture reading; mark ready; release to trim.

### Trim floor & shrink (T)
- **T1** · firm · Without one person who physically reconciles grams in versus grams out and cares about the bottom line, the numbers drift.
- **T2** · firm · Waste is the bucket nobody weighs; yields look great until someone does.
- **T3** · firm · Trim is where inventory walks; the yield spike after new leadership is the classic tell.
- **T4** · founders · Per-trimmer accounting of flower/shake/trim/waste is what turns a yield number into an explanation.

### Extraction program (E)
- **E1** · firm · Lab test ≈ $500 per batch regardless of size; testing minimum typically 500 g. Never run under 500 g; prefer ~1,000 g. "It'll always be in increments of 500, damn near."
- **E2** · firm · One ice-water wash lands near 500 g of bubble hash.
- **E3** · firm · Two or three washes of the same strain are combined into one 1,000–1,500 g batch because nobody stops between washes.
- **E4** · ballpark · Yield by route: fresh frozen → bubble hash ≈ 8%; fresh frozen → live rosin ≈ 3.5–4% (one program plans at 4%); dry trim → rosin ≈ 20%. Yield only means something with the route attached.
- **E5** · firm · A wash takes ~4.5 hours regardless of input weight. Two per day normal, three when pushing, one when the calendar is full.
- **E6** · ballpark · Freeze-dryer capacity is the real choke: a medium pharma unit ≈ 6 shelves, one often reserved for off-grade microns; a very large wash can out-produce what the dryer holds.
- **E7** · firm · Batch size is often set by the wash vessel's input capacity (~17,000 g on one common commercial unit). Planning starts from the machine.
- **E8** · firm · Real finished weights from three ~17 kg batches of one strain: 474 g, 502 g, 497 g. Consistency is the point.
- **E9** · firm · Lab techs burn through silicone papers, press bags, and wash bags; reorders by phone call are a daily tax.
- **E10** · firm · The same wholesale hash goes into event "branded grams"; buyers cannot tell it from boutique small-batch.

### Sourcing biomass (S)
- **S1** · firm · Give genetics to a struggling or outdoor grower; in 3–5 months get first right of refusal on fresh frozen at a steep discount. One such partnership: 3,900 lb cut, locked at $65/lb.
- **S2** · firm · External fresh frozen is roughly a third of an extraction lead's job: calling gardens, sizing need, choosing strains.
- **S3** · firm · Walk the crop before the first purchase from a new grower.
- **S4** · firm · Asking price vs. paid: sellers quote ~$183/lb; a boutique garden lists $150/lb under 100 lb and $120/lb over; leftover stock often goes for ~$100/lb after a "still have it?" callback. New-garden range after negotiation: $100–160/lb.
- **S5** · firm (one anecdote) · A genetics partner's outdoor fresh frozen looked, yielded, and tasted better than the in-house indoor.
- **S6** · firm · Even a good vertical garden only has 50–80 lb of fresh frozen every few months; the rest is bought.

### Compliance in practice (C)
- **C1** · firm · Reporting to a third-party compliance admin means repeating package IDs and weights three or four times while they click; one harvest with finished and unfinished product took ~45 extra minutes to untangle.
- **C2** · firm · Compliance that runs in bursts — weeks of silence, then a hard pass — "never stood a chance."
- **C3** · firm · Some production staff never log into METRC by design; the whole mess lands on the compliance role.
- **C4** · firm · Operators live on METRC IDs and CSV upload/download; a record that lacks a place for the ID is useless day to day.
- **C5** · firm · Plant tags cost about a dollar per plant and make everything harder; RFID room scanning exists but most still wand each plant.
- **C6** · firm · Disgruntled-employee risk is operational: people often know hours ahead. Deactivate access before the conversation; keep point-in-time inventory snapshots.

### Team, labor & accountability (L)
- **L1** · firm · Useful task grain for a tech is hyper-specific — "flower room, row three, fifth node" — green-checked when done. "Why did you green-check it if it's not done?"
- **L2** · firm · Each remote-tech escalation call for a consumables decision costs 10–20 minutes of manager time.
- **L3** · firm · A multi-lab extraction lead may be on site 7–10 days a month at one account and never at another.
- **L4** · firm · Team beats capital and vision; weak teams sink funded operations.
- **L5** · firm (retail) · One multi-store operator: ~$4,800 training cost per hire, 2–3 months to break even, average termination around six weeks. Use only for owner-operator audiences.
- **L6** · firm · Branded-gram sales live or die on one good salesperson; wholesale can work while retail stalls.

### Planning & economics (P)
- **P1** · firm · "It all starts with how many grams do I need?" — then fresh frozen pounds, then garden or buy. Wholesale plans from demand; branded-gram programs tend to plan from what is in the garden.
- **P2** · ballpark · Unit economics: buy at $65/lb and hit ~4% → ~$2–3/g cost against $9–10/g wholesale; buy at ~$100/lb → ~$6.50/g cost against $10–12 packs. Extractor's cut 25–33% of profit, ≈ $1.85–2.15/g.
- **P3** · firm · Volume cadence for one program: 3,000–5,000 g/month, repeated across 2–4 states. Standing orders (e.g., 1,000 g plus two QPs and an HP) convert directly into a monthly gram target.
- **P4** · firm · Make the 420 rosin in February. Finished April 10 is too late; serious buyers bought April 1.
- **P5** · firm · Every June the same SKUs run short for 710; read last year's June before buying this year's biomass.
- **P6** · firm · The week after 420 is for locking the next biomass supplier.
- **P7** · firm · Fixed inputs are the dream: pay $65, hit 4%, sell at a known price, and the monthly math stays the same. Cultivation's floating yields and prices are why some extractors stay out of it.
- **P8** · firm · Event sell-through: 250–300 branded grams per booth, typically sold out mid-week. Illustrative for demand planning.
- **P9** · firm · Strain velocity is a blind spot: "we got 700 eighths — how many sold in 30 days?" is hard to answer without tooling.

### Flagged as speculative — do not publish as learnings
Exact freeze-dryer fill weights and the press capacity figure; the "bigger wash doesn't take longer" claim before it was restated as "standardize batch size"; any pricing quoted as a marketplace example rather than a transaction; secondhand enforcement stories; consumer-spend multiples; packaging and collectible-drop ideas.

## 12. Topics to avoid

| Do not write about | Why |
|---|---|
| Product features as the subject | The operator rule. Feature explanation belongs in docs and demos. |
| Ambient / always-listening mode | Feature-flagged off; roadmap marks it deferred with deletion planned. The one sentence about it in the launch post "Harvest day with gloved hands" should be revisited if the deletion lands. |
| METRC API sync, auto-submit, transfers, manifests as solved | Roadmap. Compliance posts are about habits and the real pain, and are honest that the API problem is open. |
| Natural-language reports, cultivation SOPs generating tasks, PO creation by chat, POS/SMS integrations, scale or sensor hardware, autonomous agents | Not shipped or not exposed. See module docs' "Do not claim." |
| Named people, companies, brands, facilities; testimonials; logos | Anonymization rules, section 9. |
| Retail floor operations (drawers, delivery, budtending) | Off-audience. Owner-operator team learnings only, labeled. |
| Consumer-facing content (strain reviews, product hype, effects) | Off-audience and off-brand. |
| Pricing of NeuroCann | Not ready. |

## 13. The launch posts

"Harvest day with gloved hands," "Confirm before execute," and "Where every gram goes" were published before this plan at ~3 minutes each, and they lean more on the product than the operator rule allows. They stand as launch posts. "Confirm before execute" stays as the single "how the product thinks" post; it will not be repeated.

Posts written under this plan so far, and what each is the reference for:

- **Batches come in 500-gram increments** — a Rule of thumb from an SME learning (E1–E3, E7, E8).
- **A nug in the glove, a glove in the pocket** — a What went wrong from a founder anecdote (F1, F2). The reference for how a founder story reads: the room first, the feature in the last sentence.
- **Trim is the first real weight you get after the chop** — a Rule of thumb split out of the same anecdote (F3). The reference for pulling a second post out of one story instead of overloading the first.

## 14. Measurement

No analytics instrumentation exists on the public site yet. Until it does, measure by what sales and founders can observe:

1. Which posts get forwarded operator-to-operator, and which get sent after calls and referenced on the next one.
2. Demo requests whose first message mentions a learning the blog owns ("saw your piece on batch sizing").
3. Operators volunteering their own numbers or stories in reply — the sign the blog is read as peer notes rather than marketing. Those replies go into the Learnings Bank.

When analytics land, the numbers that matter are read-through on deep dives and click-through from the landing page "From the Blog" section — not raw pageviews.

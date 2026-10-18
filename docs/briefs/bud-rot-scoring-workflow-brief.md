# Product Brief: Bud-Rot Scoring Workflow for the Cultivation Team

**Date:** 2026-10-18
**Status:** Proposal
**Depends on:** Plant map with table-granularity rooms and room-sheet import (built, PRs #57, #59, #60), facility metrics (built), SendGrid inbound email (built), Deepgram voice + `plants` tool `log_issue` (built)

---

## Where we are

The team at Proper scores bud rot per table (a tray of 12–14 plants of one strain) on a 0.5 / 1 / 2 / 3 scale:

| Score | Meaning | What it decides at harvest |
|---|---|---|
| 0.5 | Early signs | Watch it; airflow on it |
| 1 | Needs QC | Will have to be QC'd |
| 2 | Freeze tops | Likely freezing the tops |
| 3 | All to frozen | Nothing salvageable; everything to frozen |

Today that lives in a workbook per room per scoring day: a "room map" sheet (strain code per table, plant count underneath, two decks of five benches, East → West) and a "health report" sheet with the scores on the same layout. The app now imports that workbook (Plants → map → Import sheet), draws the room as tables with the latest score, builds the hot-spot surface from dated scores, and snapshots the totals nightly for Reports.

What we have from the exports so far is **one scoring day for one room** (Papin, 10/19/2026: 90 tables, 1,164 plants, 34 scored). History builds from here, and the question is how to make each scoring pass cost the team nothing extra.

## Goal

Every scoring pass lands in the app the day it happens, with a date, a room, a cell and a person, without the team learning a new tool before they have to. Then use the scores where they pay off: planning moves before late flower, and pre-filling harvest decisions.

## Options, in order of payoff against effort

### 1. Email the workbook in (zero change in habit)

- A dedicated inbound address (e.g. `rooms@replies.neurocann.app`) on the existing SendGrid Inbound Parse (`receive-email.ts`).
- Attachment goes through the same parser (`shared/plantMap/roomSheet.ts`) and `import-room-sheet`; the sender gets a reply with the summary (grid, tables, plants, scores by level) and any warnings.
- Date comes from the subject or the sheet title; the subject wins. Room from the sheet title, matched case-insensitively to an existing room.
- Sender must be a known user's email in the company (the inbound function already resolves threads by company).
- **Effort:** small. **Payoff:** every sheet gets in on the day, no upload step, no wrong-date problem.

### 2. Score on a phone while walking the room

- A "scoring pass" mode on the map, built for a phone: pick the room → large table tiles in bench order → tap a tile → tap 0.5 / 1 / 2 / 3 (or "clear") → next. One pass per room; finish writes one event per scored table with the date, the cell and the user.
- Works with gloves: big targets, no typing, confirm at the end.
- Offline tolerance: queue the pass in IndexedDB (Dexie is already in the app) and send when back on signal.
- **Effort:** medium. **Payoff:** retires the workbook; scores carry who and when; the hot-spot map updates the moment the pass is saved.

### 3. Score by voice

- The chat already has Deepgram speech-to-text and the `plants` tool's `log_issue` action with a cell. Add table-room phrasing to the prompt: "Papin, upper deck, bench two, fourth from east, one" → cell (section, bench, position) + score.
- Confirmation read-back before saving, since a wrong cell is worse than no score.
- Hands-free matters in a wet flower room; pairs with the phone pass rather than replacing it.
- **Effort:** small-medium (prompt + a cell resolver for section/bench/position words). **Payoff:** fastest capture for people who won't touch a screen mid-pass.

### 4. Prompt the pass and digest the result

- From week five of flower, a weekly "Score bud rot — {room}" human task per flower room, assigned to a tech (the cultivation SOP task generator can own the cadence).
- The nightly metrics job (`compute-metrics`) also flags rooms not scored in seven days.
- A short digest after each pass or each morning: new early signs, tables moved to needs-QC or worse, cells that have scored two passes in a row, and the planner's suggestions. SMS delivery is already on the roadmap; email works today.
- **Effort:** small-medium. **Payoff:** passes don't get skipped in the busy weeks, and the person who decides on moves sees the change, not the whole map.

### 5. Carry scores into harvest

- At harvest, a table's latest score pre-fills the decision: 1 → QC flag on the bin, 2 → freeze tops (split allocation), 3 → all to frozen (fresh-frozen pathway). Harvest Day shows the table's score next to the plant weights.
- Closes the loop: the scale the team already uses becomes the allocation, instead of being re-decided at the table.
- **Effort:** medium (harvest ↔ table linkage; today harvests link to plants and batches, not tables). **Payoff:** the scores change what happens to product, which is the point of scoring.

### 6. Photo-assisted scoring

- `docs/briefs/` already has a brief for plant health report images with automatic issue identification. A photo of a cola with a suggested score (confirmed, never auto-saved) would make scores consistent between people and shifts.
- **Effort:** medium. **Payoff:** consistency; also a training aid for new techs.

## Do regardless

- **Strain codes → strain records.** The sheets use codes (ARS20, GSB4, BDZ). Map codes to `strains` so incidence per strain ties into the planner's feed / flower length / stretch traits. A `code` column on strains, or aliases, with the import matching by code first and name second.
- **Building presets.** Legacy (10 × 9) and Expansion (10 × 15) are on the grid setup card already; keep a new room at one click.
- **Date hygiene.** Every path above sets the observation date explicitly; the sheet title is a default, never the truth.

## Recommended order

1. Email-in import (option 1): nothing changes for the team, history starts accumulating immediately.
2. Phone scoring pass (option 2), with voice (option 3) as the second input on the same pass.
3. Weekly task + digest (option 4) once passes are happening.
4. Harvest pre-fill (option 5) once a few rooms have scores through to harvest.
5. Photo assist (option 6) when consistency between scorers becomes the limiting factor.

## Open questions

- What does a filled-in airflow map look like? The template has only bench boxes; if the team draws fan positions and airflow direction, that belongs on the same grid as the hot spots.
- Do other rooms use the Papin workbook layout exactly (two decks, pairs of rows, legend column)? One sheet from a different room would settle it before the email-in path goes live.
- Who should receive the digest: the cultivation lead only, or each tech for their rooms?

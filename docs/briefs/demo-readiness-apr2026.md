# Demo Readiness Brief — April 2026

## Why this brief exists

We're producing a series of product demo videos to share with cannabis operators (see the demo video outline shared separately). Before filming, several core workflows on the marketing surface aren't backed by working code — or are backed by code that would visibly stumble on camera. This brief identifies the gaps, ranks them, and defines what "done" looks like for each so the videos can be filmed without fakery or apologies.

The audit was performed against `main` on 2026-04-10. Citations are file:line at that commit; verify before editing.

## Goal

Every claim made in the demo video series should be backed by a workflow that runs end-to-end on a real (or seeded) facility, on camera, in one take, without keyboard tricks or pre-staged data that contradicts the spoken narrative. A skeptical operator watching should not be able to point at the screen and say "that's not real."

## Success criteria

- A new operator can sit down at a tablet and complete each filmed workflow following only what they see and hear in the video.
- No demo video requires the on-camera operator to type a number that they just spoke aloud.
- Every action shown in a video is traceable to a real `ProposedAction` that the AI emits and the system executes.
- Compliance-related claims (METRC tags, lab states) are demonstrated against real records, not mockups.

## Out of scope

- METRC API sync (still on roadmap; videos will not claim direct sync).
- Multi-facility view (roadmap).
- AI sub-agents (roadmap).
- Push notifications (roadmap).
- Pricing/tier UI (intentionally absent).
- Any rebrand or visual redesign of existing modules.

---

## Gap inventory

Each gap is rated by **demo blast radius** (how many planned videos it breaks) and **fix effort** (rough engineering hours).

### Gap 1 — Voice weighing on Harvest Day is not wired

**Severity:** BLOCKER
**Blast radius:** Videos 1, 2, 3, 4 (the four highest-priority videos in the series)
**Effort:** ~1–2 days

**Current state.** The Harvest Day cockpit accepts manual numeric weight entry only. The ambient transcription pipeline (Deepgram → `ai-parse` → action queue) can already parse utterances like *"plant seven, five-twelve, has a little PM"* into a `record_plant_weight` action plus a `flag_contamination` action — that part is real and shipped. But the Harvest Day component does not subscribe to those actions. The cockpit and the ambient queue are two parallel systems that don't talk to each other on this surface.

`HarvestCenterColumn.tsx:46-60` exposes the numeric weight input. There is no listener anywhere in `src/components/harvest-day/` for ambient-emitted weight events. The user-facing result is that an operator with their hands full of wet plant must put it down, walk to the tablet, and type — exactly the workflow we're trying to eliminate on camera.

**Required state.** When the operator is on the Harvest Day screen and ambient mode is running, speaking *"plant seven, five-twelve grams, minor PM on the lower fans"* should:

1. Update the live weight display for plant 7 in the cockpit immediately.
2. Apply the contamination flag inline with no extra confirmation step.
3. Optionally emit a soft audio confirmation (a tone or a short TTS readback) so the operator knows it landed without looking up.
4. Fall through gracefully if the spoken plant number doesn't exist in the active batch — log to the ambient review queue for the operator to triage later.

**Fix approach.**

- Add a Harvest Day–scoped subscriber to the ambient action stream. The subscriber filters for `record_plant_weight` and `flag_contamination` actions whose payloads target a plant in the currently-open harvest.
- For matching actions, bypass the standard "review and confirm" gate and apply directly to the cockpit state. This is a deliberate exception: once the operator has explicitly opened Harvest Day, they have given consent to act on voice input in real time.
- Non-matching ambient actions continue to flow into the standard review queue.
- Add a small "voice ready" indicator to the cockpit header so the operator knows the direct path is active.
- Add an audible confirmation (single short tone via Web Audio) on successful weight capture. Skip on flag-only actions.

**Files likely touched.**

- `src/components/HarvestDay/` (or wherever the cockpit lives — verify before editing).
- `src/contexts/AmbientContext.tsx` (expose a subscription hook).
- `src/services/ambientAnalyzer.ts` (may need to tag actions with a "direct-applicable" hint).
- New: small `useDirectAmbientActions(filter)` hook.

**Definition of done.**

- Operator opens Harvest Day, taps Ambient on, speaks four plant weights and one contamination flag in a single 30-second take. All five updates appear on screen without keyboard input. No items appear in the review queue.
- Speaking a plant number that isn't in the active batch produces no cockpit change but does appear in the review queue.
- Toggling Ambient off restores manual-only behavior.

---

### Gap 2 — Extraction runs cannot start with inputs alone

**Severity:** BLOCKER
**Blast radius:** Videos 2, 5
**Effort:** ~2–4 hours

**Current state.** `ExtractionRunCard.tsx:55-62` (`isCardReady()`) requires both `outputQuantity` and `outputPackageType` to be filled before a run can be created. This contradicts the actual operator workflow: nobody knows their final yield before they press rosin. The known bug is documented in memory (`project_extraction_run_submission_bug.md`) and is unfixed.

The downstream backend (`netlify/functions/create-extraction-run.ts:49-65`) actually accepts runs without finalized outputs — the gate is purely a frontend check. The fix is small and local.

**Required state.** A run can be started given only:

- An SOP template (which defines accepted inputs and producible outputs).
- One or more input packages.

Output quantities and the chosen output product are required only when the run is *finished*, not when it is *started*. The card UI should make it visible which fields are still pending without blocking the start action.

**Fix approach.**

- Split `isCardReady()` into `canStart()` and `canFinish()`.
- `canStart()` returns true once SOP + ≥1 input is set.
- `canFinish()` returns true once outputs are populated.
- Update the start button enablement to use `canStart()`. Update the finish/submit action (wherever it lives) to use `canFinish()`.
- Visually distinguish "needs outputs to finish" from "can't start."

**Files likely touched.**

- `src/components/ExtractionRunCard.tsx` (primary)
- Possibly `src/services/extraction*.ts` if any client-side validation duplicates the gate.
- No backend changes needed.

**Definition of done.**

- Operator says *"Start a rosin press run with 2 kilograms of Wedding Cake bubble hash."* The AI proposes `start_extraction_run`. Operator confirms. Run appears in the active runs list with steps populated and outputs blank. No errors, no blockers.
- Returning later, the operator can fill in the actual output quantity and product, and finish the run.
- The `Wedding Cake — Live Rosin Run` panel on the landing page mock matches what an operator actually sees in the app.

---

### Gap 3 — METRC tags are not assignable to packages

**Severity:** BLOCKER (for compliance video)
**Blast radius:** Video 6
**Effort:** ~1 day

**Current state.** Tag import and assignment exist in `manage-tags.ts`, but the assign target is plants and batches only. There is no tag picker on `PackageCard` and no UI flow that connects a printed METRC tag to a finished package. Lab testing states (not_submitted / submitted / passed / failed) render correctly in the package dashboard (`PackageDashboard.tsx:82-94`), but the most visible compliance artifact — the tag itself — is not connected.

The AI chat scenario in the landing page demo emits an `assign_tag` action with `target: 'package'`, but there's no handler for that target.

**Required state.** From a package detail view:

- Operator can see whether a tag is assigned and which one.
- Operator can assign or reassign a tag from the available pool of unused imported tags.
- Operator can do the same via voice: *"Tag the Gelato 1lb flower package as METRC-001234"* should resolve to `assign_tag { target: 'package', packageId, tagId }` and execute.
- The lab testing state pill is visible alongside the tag.

**Fix approach.**

- Add a tag picker component to `PackageCard` (or wherever the package detail/expanded view lives). It lists available tags from the company's pool, filtered to unused.
- Wire up `assign_tag` with `target: 'package'` in `actionExecutor.ts`.
- Backend: extend whatever endpoint currently assigns tags to plants/batches to also accept a `packageId` argument and write to the right join table. Migration may be required if no `package_tags` table exists yet — verify.
- Update `ai-parse` system prompt to clarify the package-targeted tag assignment shape.

**Files likely touched.**

- `src/components/PackageCard.tsx`
- `src/services/actionExecutor.ts`
- `netlify/functions/manage-tags.ts` (or a sibling)
- `netlify/functions/ai-parse.ts` (system prompt update)
- Possibly a new migration in `migrations/`.

**Definition of done.**

- Operator opens any package, sees the assigned tag (or "no tag" state), and can assign one in two clicks.
- Voice command from Ambient or Action mode resolves to a tag assignment that succeeds and is visible immediately.
- Filming Video 6: the operator says *"Create a 1lb flower package from the Gelato harvest, tag it METRC 001234"*, both actions execute, and the tag appears on the package row.

---

### Gap 4 — Plant health is a manual 1–10 number, not a pathogen catalog

**Severity:** POLISH (film-around-able, but worth fixing)
**Blast radius:** Video 2 (one line of voiceover), background visual in Videos 1 and 3
**Effort:** ~1 day for a minimum-viable version, ~3–4 days for the full pathogen-impact engine described in `project_objective_plant_health.md`

**Current state.** `PlantHealthCircle.tsx` renders a 0–100 manual numeric input as a colored radial. There is no pathogen catalog, no rule engine, no automated pest detection. The "issues surface before they spread" line in Video 2 is currently aspirational marketing.

**Required state for video.** The minimum that backs the claim:

- A small set of pathogen/issue checkboxes per plant (PM, mites, root rot, nute burn, light burn).
- Each checkbox carries a fixed health impact (e.g., PM minor = -10, PM severe = -30).
- Plant health = 100 - sum of active issue impacts, clamped to 0.
- Flag aggregation at the room level: if >20% of plants in a room have any flag, the room card on the plant map shows a warning state.

This gives the demo a real "issue surfaces and the room turns yellow" moment, which is the visual the voiceover is selling.

**Fix approach.**

- Schema: add `plant_issues` table or extend `plants` with a JSONB issues column. Verify which is cheaper given current schema.
- Replace the numeric input on the plant detail with a checkbox group + severity selector.
- Compute health server-side from issues; expose the computed value alongside the issue list.
- Update the room aggregation logic on the plant map.

**Defer to follow-up:** The full catalog from `project_objective_plant_health.md` (impacts vary by phase, environmental thresholds, etc.) is out of scope for the demo. Ship the minimum.

**Definition of done.**

- Operator checks "PM (minor)" on a plant. The plant's health drops to 90. The room health summary updates.
- The plant map view shows a yellow ring on rooms with >20% flagged plants.

---

### Gap 5 — SOP "AI auto-executes compliance steps" is partially aspirational

**Severity:** SCOPE TRIM (no code change needed)
**Blast radius:** Video 8 (the SOP video)
**Effort:** Zero — this is a copy/script change, not an engineering task

**Current state.** The `onCompleteAction` field on SOP steps exists and is wired (`SOPEventEditor.tsx:30`). When a step completes, the field can trigger a follow-up action. But compliance steps themselves are authored manually by the SOP creator — there is no AI generating them, no LLM call deciding "this step needs a METRC log." Without METRC sync, even an authored compliance step has nowhere real to write.

**Required state.** Drop the "AI auto-executes compliance" claim from Video 8 and the landing-page SOP showcase voiceover. Replace with a tighter, true claim: *"Build the SOP once, the AI generates the tasks every time you trigger it."* That's still a strong differentiator and it's actually true.

**Fix approach.**

- Update the Video 8 script in the demo brief.
- Update the SOP showcase copy on the landing page (`LandingPage.tsx`, the SOP Editor section, currently says "auto-executing compliance actions" — change to "assigning crew, setting durations").
- Reword the SOP editor mock hint string if it makes the same claim.

**Definition of done.**

- No surface in the product, on the landing page, or in the demo videos claims AI-driven compliance auto-execution until METRC sync ships.

---

## Recommended sequence

The order matters. Earlier fixes either unblock more videos or reduce regression risk on later fixes.

1. **Day 1 (morning) — Gap 5 (copy fix).** Trivial, eliminates a marketing claim we can't back. Do this first so the rest of the work doesn't reinforce a false promise.
2. **Day 1 (afternoon) — Gap 2 (extraction start gate).** Smallest engineering fix, unlocks two videos. Low risk because the backend already accepts the looser shape.
3. **Day 2 — Gap 3 (package tag picker).** One full day. Touches frontend, backend, and possibly a migration. Do it early so the rest of the videos can be staged with real tagged packages.
4. **Day 3–4 — Gap 1 (voice → Harvest Day).** The largest piece. Requires testing with a real microphone in a noisy environment. Save it for when the smaller fixes are merged so the regression surface is small.
5. **Day 5 (optional) — Gap 4 (plant health pathogen checkboxes).** If schedule allows. If not, soften the voiceover line in Video 2 and ship without it.
6. **Day 6 — Demo data seeding.** Stage a believable facility: one active harvest mid-weighing, one active trim session, one in-progress extraction run, a handful of packages in different lab states with tags assigned, a draft PO ready to confirm.
7. **Day 7+ — Film.** Start with Video 4 (Ambient) since it was already production-ready and serves as a final regression check for the ambient pipeline.

## Risks and open questions

- **Microphone in a real cultivation environment.** None of the audit verified ambient performance against background noise from HVAC, dehumidifiers, or trim machines. Before filming Video 3, do a recording test in the actual room you'll film in. If word error rate is too high, the demo needs a noise-cancelling mic on the operator (lavalier-style), not the tablet's mic.
- **Direct-apply ambient actions on Harvest Day bypass the review queue.** This is intentional for the demo experience but is a meaningful UX policy change. Confirm with the team that we're comfortable shipping this behavior to real customers, not just for the video. If not, gate it behind a per-user setting and turn it on for the demo account only.
- **Tag pool seeding.** Imported METRC tags have to come from somewhere on the demo account. Confirm we have a fixture set or import script that can populate a believable starting roll.
- **Schema migration for `package_tags`.** If a join table doesn't already exist, the migration is straightforward but needs to land before the package tag UI can ship. Verify before starting Gap 3.
- **The "SOPs auto-execute compliance" line may also appear in the AI system prompt itself,** not just user-facing copy. Grep `ai-parse.ts` for compliance-related claims and align them with reality before any video that shows the AI describing its own capabilities.

## Filming-day checklist (brief, separate from the video script)

Before pressing record on any video:

- The demo facility has at least one harvest with allocation set, mid-weighing.
- At least one extraction run is in-progress with steps partially complete.
- The package list has 6+ packages spanning every lab state.
- At least three packages already have METRC tags assigned, so the tag flow can demo both "assign new" and "view existing."
- Ambient mode is on, microphone is tested, and word error rate has been spot-checked in the room.
- Cookies cleared, dev bypass auth off, real Auth0 login used so the chrome matches what a customer sees.
- Browser zoom at 100%, window at a 16:9 aspect that matches the final video.

---

## What this brief is not

This is not a permanent product roadmap. Every gap here is scoped narrowly to "what does it take to film without lying." The full versions of each module — the pathogen-impact engine, METRC sync, AI sub-agents — live in their own briefs and follow their own timelines. Don't let demo prep balloon into rebuilding the product.

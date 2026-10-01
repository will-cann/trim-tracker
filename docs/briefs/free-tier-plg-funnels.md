# Free Tier PLG Funnels: Landing Page → CTA → Onboarding per Flow

**Status:** Plan, not built. Only the Manifest Picker tool exists (`/manifest`), and it has no landing page.
**Related:** `landing-page-brief.md` (main site), `ordering-workflow-brief.md` (buyer persona), `holland-sme-extraction-apr2026.md` (compliance admin + lab tech personas).

## Thesis

The free tier is a set of **seam tools**: file in, file out, no integration, no account. Each fills a gap between
Metrc, Apex/LeafLink, Dutchie, T3, the lab, and a spreadsheet. Each produces a slice of supply-chain data as a
byproduct, joined across companies by license number.

The champion is never the economic buyer. It is the person doing the manual seam work this week: the compliance
admin / Metrc operator, the retail buyer, the warehouse picker, the remote lab tech. Funnels are designed for
them: find the tool from a search or a forwarded file, get a usable output in under five minutes, and only then be
asked for anything.

## Shared funnel shape

Every free flow follows the same five stages. Per-flow sections below only fill in the specifics.

```
1. Arrive     search / forwarded artifact / counterparty link / main-site "Free tools" nav
2. Try        landing page CTA opens the tool with a sample preloaded; no form
3. Do         user loads their own file; output produced; this is the activation event
4. Keep       first ask for identity: email magic link to save history / send files
5. Claim      second ask: claim a license number to unlock network data (partners, price band, benchmarks)
                 → counterparty hooks fire from here (receipt links, discrepancy emails)
                 → upgrade triggers surface here ("show your boss" summary, API sync, full platform)
```

### Principles

- **The landing page CTA is "Open the tool", not "Sign up".** Secondary CTA is "See the full platform".
- **Sample first.** Each tool ships a sample input (`SAMPLE_PICKLIST_CSV` is the pattern) so the landing CTA can
  land on a populated screen. Nobody should hit an empty upload box from a marketing page.
- **Identity is progressive.** localStorage → email magic link → license claim. Each step is asked at the moment
  it buys the user something, never on arrival. Auth0 is not involved in the free tier.
- **Every output carries the entry point.** `.t3csv` email footer, receipt link, discrepancy report, price book
  export: each is a branded artifact a counterparty sees. This replaces paid acquisition.
- **Time to first output under five minutes** on the user's own file. Measure it.
- **Nothing in the free tier needs an API key.** Metrc API, Dutchie API, SendGrid inbound stay in the paid tier.

### Shared infrastructure to build once

| Piece | Notes |
|-------|-------|
| `/tools` hub page | One card per tool: who it's for, input → output, "Open" CTA. Linked from main nav as "Free tools". |
| Tool landing template | Static, prerendered HTML (search intent is the acquisition channel; the SPA renders nothing for crawlers). Hero, 3-step "how it works" with real screenshots, sample CTA, FAQ with the exact file names users search for (`.t3csv`, "Apex pick list export"), footer link to the hub and main site. |
| Tool shell | Repeat the `/manifest` pattern: one Vite entry per tool, `netlify.toml` redirect, localStorage state, shared `lib/` extracted from `src/manifest/lib` (CSV parser, Metrc tag utils, T3 writer, `manifestAuth`, Claude document parser). |
| Magic-link identity | `free_accounts (email, created_at)` + `free_account_licenses (email, license_number, claimed_at, verified)`. Replaces `MANIFEST_ACCESS_CODE` for the email endpoint once a user has an account; the code stays as the fallback for testers. |
| License graph | `licenses`, `observed_transfers`, `observed_products`. Written by every tool on "Keep". Unclaimed licenses accumulate counterparty observations before the operator signs up. |
| Receipt links | `/r/:token` no-login page showing a transfer's packages with Accept / Flag. Shared by the picker (sender) and receiving check-in (recipient). |
| Instrumentation | Events: `tool_landing_view`, `tool_opened`, `sample_loaded`, `own_file_loaded`, `output_produced`, `email_captured`, `license_claimed`, `counterparty_link_sent`, `counterparty_link_opened`, `upgrade_cta_clicked`. Keyed by tool slug and (when known) license. |
| "Show your boss" summary | Per-license monthly card: files produced, hours saved (tool-specific estimate), discrepancies caught, partners touched. Email + in-tool. This is the hand-off to sales. |

### Main site changes

- Nav: add "Free tools" → `/tools`. Keep "Book Demo" and "Sign In".
- Closing CTA section: add a third, lower-weight line under the demo/sign-in buttons: "Not ready for a demo? Start
  with a free tool." → `/tools`.
- No pricing page yet (per `landing-page-brief.md`). The hub page says "Free. No account needed." and nothing about
  paid tiers beyond "See the full platform".

---

## Flow 1: Manifest Picker (built; needs landing + funnel wiring)

**Tool:** `/manifest`. Apex pick list CSV → scan Metrc case tags → one `.t3csv` per origin license for T3's CSV
Form Fill into Metrc Create Transfer. Optional invoice attach fills wholesale prices.

**Champion:** warehouse / wholesale fulfillment lead (phone), handing off to the compliance admin (laptop).

### Landing: `/tools/manifest`

- Headline: **Apex pick list in. Metrc transfer out.**
- Sub: Scan case tags on your phone as you pick. Get a `.t3csv` per license, ready for T3's CSV Form Fill. No
  retyping tags into Metrc.
- Proof element: 20-second loop of the pick list going 0/16 → 16/16 and the two file cards (CUL / MAN).
- Three steps: Export the pick list from Apex → Scan cases → Email the `.t3csv` to whoever enters transfers.
- FAQ targets: "apex pick list to metrc transfer", "t3csv template", "metrc create transfer csv", "scan metrc
  package tags with phone", "wholesale price missing on transfer".
- Primary CTA: **Try it with a sample order** → `/manifest?sample=1`
- Secondary CTA: **Open with my pick list** → `/manifest`
- Tertiary (footer): See the full platform.

### CTA mechanics

- `?sample=1` loads `SAMPLE_PICKLIST_CSV` and lands on the pick list screen with a dismissible banner: "This is a
  sample order. Load yours from the menu when you're ready."
- Plain `/manifest` lands on `LoadScreen` as today, with the sample link kept as the secondary action.

### Onboarding (first session)

1. Pick list screen, 0/16. Banner: "Tap a line, then scan or type a tag." No settings prompt.
2. First successful scan: toast "1 of 16. Keep going." Nothing else.
3. First *invalid* scan: inline `TAG_HINT`, no modal.
4. Pick list complete: Review screen opens. Origin licenses default from `DEFAULT_LICENSES`; the first time the
   user edits them, persist and never ask again.
5. Export: Copy / Share work with no identity. **Email the files** is the first identity ask: "Enter your email to
   send and to keep a history of your transfers." Magic link replaces the access code for returning users.
6. Post-send screen: "Sent to <compliance admin>. Want them to see this in Metrc-ready form every time? Forward
   them this link." → `/tools/manifest`. This is how the picker recruits the compliance admin.

**Activation event:** `output_produced` on a non-sample order.
**Keep ask:** at Email the files.
**Claim ask:** after the second real order: "Claim CUL000030 to see every transfer you've shipped and who
received it." Claiming requires a verification step (see Open questions).
**Counterparty hook:** on export, offer "Send the buyer a receipt link" → `/r/:token` (Flow 2's entry).
**Upgrade triggers:** "Create the transfer in Metrc directly" (T3 API / Metrc API, paid); monthly summary card.

### Gaps vs. current code

- No landing page; `/manifest` drops straight into `LoadScreen`.
- `?sample=1` deep link does not exist (sample is a button on `LoadScreen`).
- Email send is gated by `MANIFEST_ACCESS_CODE` only; no magic link.
- No instrumentation events.
- No receipt link generation on export.

---

## Flow 2: Receiving Check-in + Hand-off Receipt

**Tool:** `/receive` and `/r/:token`. Inbound Metrc manifest (PDF/CSV) or a receipt link from a seller → scan
inbound cases → shorts / overages / wrong lot flagged → Metrc receive CSV + discrepancy email to the vendor.

**Champion:** retail buyer or store receiving lead. Arrives mostly via receipt link from Flow 1, secondarily via
search.

### Landing: `/tools/receive`

- Headline: **Check every case against the manifest before you sign.**
- Sub: Scan what arrived. We match it to the Metrc manifest, flag shorts and wrong lots, and draft the vendor
  email. Your Metrc receive file is ready when the driver leaves.
- Proof element: side-by-side manifest vs. scanned, one line red with "1 of 4 cases missing".
- Three steps: Open the manifest (PDF, CSV, or the link your vendor sent) → Scan cases → Accept or flag, send.
- FAQ targets: "metrc incoming transfer short", "receive metrc transfer csv", "wholesale delivery discrepancy".
- Primary CTA: **Try it with a sample delivery** → `/receive?sample=1`
- Secondary CTA: **I have a manifest** → `/receive`

### Receipt link (`/r/:token`) as a landing page

This is the higher-volume entry. It is not a marketing page; it is the seller's transfer rendered read-only, with
two buttons. Design it as onboarding:

- Header: "<Seller> shipped 16 cases to <Buyer license>. Expected <date>."
- Body: the package list.
- Buttons: **Accept all** (one tap, records acceptance, done) and **Check cases as they arrive** (opens `/receive`
  with the manifest preloaded, no upload step).
- Footer: "Powered by NeuroCann. Free receiving tool for <Buyer license>."

### Onboarding

1. From a receipt link: manifest is already loaded. First screen is the scan sheet. Zero steps.
2. From search: `LoadScreen` equivalent accepting Metrc manifest PDF (Claude document parse, reuse `parse-invoice`
   plumbing) or CSV.
3. Scan flow mirrors Flow 1 (same `wedge.ts` routing, same tag validation).
4. Review: each line is Match / Short / Over / Wrong lot. Flagged lines prefill a discrepancy note.
5. Finish: **Download Metrc receive CSV** (no identity) and **Email the vendor** (identity ask, same magic link).
   If the user arrived via a receipt link, the vendor's email is already known; the identity ask becomes "Send
   from your address so they can reply to you."
6. Post-finish: "You've received 1 delivery. Claim <Buyer license> to track fulfillment accuracy by vendor."

**Activation event:** `output_produced` (receive CSV or discrepancy email) on a non-sample delivery.
**Keep ask:** at Email the vendor.
**Claim ask:** after first real delivery; the pitch is vendor scorecards.
**Counterparty hook:** the discrepancy email returns to the seller with a link to Flow 1's landing ("Ship with scan
verification so this doesn't happen").
**Upgrade triggers:** "Accept in Metrc automatically" (API, paid); vendor scorecard across all stores (paid
multi-location view); the price book in Flow 3 is one click away once invoices are attached.

---

## Flow 3: Invoice Price Book

**Tool:** `/invoices`. Drop Apex / LeafLink invoice PDFs (or phone photos) → parsed line items → SKU × vendor ×
date price history, landed cost per unit, export CSV. `parse-invoice.ts` already does the parsing.

**Champion:** retail buyer. Also the contract extractor's owner (biomass invoices).

### Landing: `/tools/invoices`

- Headline: **Every wholesale invoice, one price book.**
- Sub: Drop the PDFs your vendors email you. Get price per unit by SKU, by vendor, over time, and see what you
  actually paid versus the menu.
- Proof element: a sparkline table: "Pre-Roll 0.5g · Vendor A · $2.10 → $1.95 (−7%) over 3 invoices".
- Three steps: Drop invoices → Review the parsed lines → Export or keep building.
- FAQ targets: "apex trading invoice export", "cannabis wholesale price tracking", "cost of goods per unit
  dispensary".
- Primary CTA: **Try it with sample invoices** → `/invoices?sample=1`
- Secondary CTA: **Drop my invoices** → `/invoices`

### Onboarding

1. Drop zone accepting multiple PDFs/images at once. Progress per file. First parse result appears in under ten
   seconds (Sonnet on an image PDF).
2. Review table per invoice: description, SKU, qty, unit price, total. Low-confidence cells highlighted; tap to
   edit. "Looks right" confirms.
3. After the first invoice: the price book view with one vendor and N SKUs. Empty states for "trend" say "Add
   another invoice from this vendor to see price movement."
4. Export CSV works with no identity.
5. **Keep ask** fires at the second invoice: "Save your price book so it builds every time you drop an invoice."
   Rationale: the value of this tool is accumulation; the ask is honest.
6. Claim: "Claim <Buyer license> to compare your prices to the market band for your state." The band is
   anonymized and only shown once N≥5 licenses contribute for that product/state (see Open questions).

**Activation event:** second invoice parsed and confirmed.
**Counterparty hook:** none direct. Indirect: price book export is what buyers forward to vendor reps when
negotiating. Footer on the export.
**Upgrade triggers:** market price band detail; vendor-level velocity (Flow 6) + price together = the ordering
module; attach to receiving (Flow 2) for three-way match.

---

## Flow 4: T3 Pre-flight Validator

**Tool:** `/validate`. Upload any `.t3csv` → license-pair sanity, missing wholesale price, weight sanity, duplicate
and malformed tags, header-row check → annotated file.

**Champion:** compliance admin / Metrc operator, including those who do not use the picker.

### Landing: `/tools/validate`

- Headline: **Catch the transfer error before Metrc does.**
- Sub: Upload your `.t3csv`. We check tags, licenses, weights, and prices against what Metrc will reject, and
  hand it back annotated.
- Proof element: a file with two rows flagged: "duplicate tag", "wholesale price blank".
- FAQ targets: "t3 csv form fill error", "metrc transfer rejected", "metrc tag format 1A4".
- Primary CTA: **Validate a file** → `/validate` (no sample needed; the tool is a drop zone)
- Secondary CTA: **Build the file from a pick list instead** → `/tools/manifest`

### Onboarding

1. Drop zone. Result in under two seconds (pure client-side; the T3 header and tag rules live in `t3csv.ts` and
   `metrc.ts` already).
2. Results: pass / N issues, each with row number and fix. Download annotated CSV.
3. No identity ask on the first validation. **Keep ask** at the third validation in a week: "Keep a log of your
   transfers for audit." The compliance admin's audit trail is the retention hook.
4. Claim: the admin claims the licenses she serves. This is the multi-license seed: "Claim all the licenses you
   manage transfers for."

**Activation event:** `output_produced` with at least one issue found (a clean pass is less memorable; track
both).
**Counterparty hook:** none. This tool is for recruiting the admin persona and seeding multi-license claims.
**Upgrade triggers:** "Submit to Metrc directly" (API, paid); monthly audit log export.

---

## Flow 5: Yield Logger + Benchmark

**Tool:** `/yield`. Log extraction runs: method, strain, input g, output g → yield %. Once N contributors exist per
strain × method, show an anonymized median band.

**Champion:** remote lab tech; the owner-operator reads the benchmark.

### Landing: `/tools/yield`

- Headline: **Your yield, against the field.**
- Sub: Log each wash or press in ten seconds. See your yield by strain and method, and how it compares to
  anonymized runs from other labs.
- Proof element: your 3.5% vs. a shaded band 3.2–4.4%.
- Three steps: Log a run → See your trend → Compare (once your lab has 5 runs).
- FAQ targets: "bubble hash yield percentage fresh frozen", "rosin yield by strain", "ice water extraction
  yield calculator".
- Primary CTA: **Log a run** → `/yield` (opens directly on the log form; a sample dataset toggle shows what the
  trend looks like after 20 runs)
- Secondary CTA: **See how extraction works in the full platform** → main site extraction showcase.

### Onboarding

1. Log form: method (ice water / press / BHO), strain (free text with suggestions), input weight, output weight.
   Yield computed inline. Save works offline (localStorage).
2. After the first run: trend view with one point and the copy "Log 4 more to unlock your lab's average."
3. After five runs: lab average per strain × method. **Keep ask** here: "Save your runs across devices" (the tech
   logs on a phone, the owner reads on a laptop; one magic-link account per lab).
4. Claim: "Claim <Manufacturing license> to compare to the anonymized band." Contributing is the condition for
   seeing the band. State this explicitly on the claim screen.

**Activation event:** fifth run logged.
**Counterparty hook:** biomass intake (not in first wave) would link a run back to the grower's license.
**Upgrade triggers:** "Plan backward from a target output" (demand-backward planning, paid); SOP templates with
step check-ins (paid extraction module).

---

## Second wave (sketch only)

| Flow | Landing headline | Primary CTA | Activation | Claim pitch |
|------|------------------|-------------|------------|-------------|
| Dutchie export → reorder sheet (`/reorder`) | "Eight-week velocity in one upload." | Try with sample sales export | Reorder sheet produced from own export | Sell-through vs. category band |
| COA matcher (`/coa`) | "COA to label text in one step." | Drop a COA | Label text + Metrc lab CSV produced | Potency by strain vs. state |
| Metrc package reconciliation (`/count`) | "Count the vault. Get the adjustment file." | Upload Metrc package export | Adjustment CSV produced | Shrink by product type |
| Vendor menu normalizer (`/menus`) | "Every vendor menu, one table." | Drop a menu | Normalized table from own menu | Market availability |

---

## Build order

1. **Shared:** `/tools` hub, tool landing template (prerendered), instrumentation events, main-nav link.
2. **Flow 1 wiring:** `/tools/manifest` landing, `?sample=1`, events, post-send recruit screen. No new
   backend. This turns the one tool that exists into a measurable funnel.
3. **Magic-link identity + license tables.** Gate behind the Email step in Flow 1 first.
4. **Flow 4 (validator).** Smallest new tool; reuses `t3csv.ts` and `metrc.ts`; recruits the admin persona.
5. **Flow 2 (receive + receipt link).** Closes the transfer loop and crosses company lines. Biggest build in the
   wave: manifest PDF parsing, `/r/:token`, discrepancy email, receive CSV writer.
6. **Flow 3 (price book).** Backend parser exists; this is a new frontend plus persistence.
7. **Flow 5 (yield).** Simple tool; the benchmark needs the license graph and an N-threshold policy.

## Metrics per flow

- Landing → tool open rate
- Sample → own-file rate (the real top-of-funnel conversion)
- Time to first output on own file (target under five minutes; Flow 4 under one)
- Weekly active licenses (not users: a contractor admin on five licenses counts five)
- Email capture rate at the Keep ask
- License claim rate and licenses-per-account
- Counterparty link sent → opened → tool opened
- Upgrade CTA clicks per license per month

## Open questions

- **License claim verification.** Metrc license numbers are public, so claiming must be verified. Options: a
  Metrc API key test call (contradicts "no API key in free tier"; could be the one exception at claim time), a
  document upload (license certificate), or a counterparty attestation (a verified partner confirms you shipped
  to them). Decision needed before the Claim stage ships.
- **Benchmark threshold and anonymization.** Minimum contributors per cell (strain × method × state) before a
  band is shown; rounding of the band; whether a claimant must contribute to see. Proposal: N≥5, band shown as
  quartiles, contribution required.
- **Static landing pages vs. SPA routes.** Prerendered HTML is the right call for search; decide between a
  Netlify prerender plugin on the existing SPA or separate static entries per tool. Separate entries are simpler
  and match the `/manifest` pattern.
- **Magic link provider.** SendGrid is already wired for outbound; magic-link email can use it. Token storage and
  expiry policy needed.
- **Hours-saved estimates.** Each tool needs a defensible per-output estimate for the "show your boss" card.
  Start from SME numbers (45-minute dictation call per transfer; 10–15 minutes per store per vendor order).
- **Access code sunset.** `MANIFEST_ACCESS_CODE` stays for testers until magic link ships, then becomes a
  fallback only.

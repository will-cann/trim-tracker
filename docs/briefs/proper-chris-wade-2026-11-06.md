# Proper Brands: picker follow-up with Chris Wade (2026-11-06)

Follow-up to `proper-chris-wade-2026-11-03.md`. Chris tried the picker on a real
order this week; we walked through what he hit.

## What we learned

- **Apex gives the lead a PDF, not a CSV.** Chris could not find a CSV export;
  what Apex produced for him was the pick-list PDF. The CSV lives in the Apex
  *orders* module (export from there), but the lead prints the PDF anyway. The
  CSV lacks potency; the PDF has **strain, lot number, Metrc tag, quantity,
  price and potency**. Decision: the picker ingests the PDF; the CSV stays as a
  fallback.
- **Barcode scanning on a tablet.** The phone layout defaulted to the camera
  scanner, which is wrong for a tablet with a USB / Bluetooth gun. Fix: pick the
  desktop (keyboard-wedge) layout automatically when a wedge scanner is detected
  rather than making Chris flip Settings → Layout. A **partial** manifest export
  is allowed, with a warning that the pick list is not fully scanned.
- **Manifest export → Metrc.** Target remains a T3-submitted transfer; the
  `.t3csv` export is the bridge until live mode is on. The repeated
  "destination" header in the T3 Autofill file is cosmetic, not a defect.
- **Metrc authentication.** The Proper site was redeployed for per-user Metrc
  login (`T3_REGISTRATION_SECRET` set, deploy key removed). Chris may need to
  sign out and back in for the gate to appear; read-only mode is fine for now.
- **Apex account.** The generic Apex account Proper's pickers share is locked;
  Chris is resolving it with Moe.

## What Chris's files showed (received 2026-11-06, read 2026-11-25)

Chris ran order **Proper-5718** (Key MO - Richmond Heights, 22 lines, one case
each) through the picker on Nov 6 and sent the invoice PDF, the pick-list CSV
and the two `.t3csv` manifests the app produced (10 cultivation, 12
manufacturing packages: the whole order). He stopped short of submitting to
Metrc to avoid a duplicate manifest.

- The **PDF is the Apex invoice**, image-only, three pages. Per line it prints
  the brand and product, `Sku:`, `Batch: <product> #<lot tag> (#<case
  ranges>)`, `Potency:`, a struck list price and the per-case price, `1 Case /
  N Units total`, and the line total after "Customer Discount". That is the
  document `parse-pick-list` is now tuned for; the picker loads it directly.
- Apex records the **case tags as suffix ranges after the lot** in Batch ID:
  `#1A40C0300000B55000128505 (#143967-143980)`, sometimes several
  `(#291767-291905, 307867-307910)`, once with the closing paren missing. These
  are the whole run of cases the lot was packed into (50–250 tags for a
  one-case line), so they are a pool to check scans against, not tags to
  import. The case tags do not always share the lot's prefix (the infused
  pre-roll's lot is `…38B000009518`, its case `…B56000315343`). The picker now
  reads them (`PickLine.recordedRanges`, `lib/recorded.ts`), routes
  scan-first and wedge scans by them, and warns when a scan is outside them.
  On this order the Ratio Focus case (`…315175`) was outside the range Apex
  recorded (`316541–316637`); the picker would now have flagged it.
- `package.WholesalePrice` was blank on every manifest row, so Metrc would
  have rejected the unaffiliated transfer. Loading the invoice PDF pre-fills
  the final line prices; attaching it on Review also works.
- The pick list CSV row for the infused pre-roll has unescaped inner quotes
  (`"Marshmallow Melt"`); `parseCsv` already coped.

## Action items

| Who | Item | Status |
|---|---|---|
| Chris | Send William the Apex pick-list PDF, the orders-module CSV export, and an exported manifest | Done 2026-11-06 (see above) |
| Chris | Unlock the generic Apex account (with Moe) | Open |
| William | **Update the manifest form to accept PDF in addition to CSV** | Shipped: *Load a pick list* takes the Apex invoice PDF or a photo of it. `parse-pick-list` (Claude document input, prompt tuned to Proper-5718's layout) returns the lines, `lib/pickListPdf.ts` turns them into pick lines with the lot, case ranges and quantities the CSV would give, and the final line prices pre-fill *Wholesale prices* on Review. The model step still needs a live run on the real PDF (no Claude key in the agent environment). |
| William | Read Apex's case-tag ranges in Batch ID and check scans against them | Shipped (see above). |
| William | Resolve Metrc per-user authentication | Deployed; waiting on Chris to reload and sign in with his Metrc login. Verify the Settings → Metrc card shows his username, not "Connected by NeuroCann for this deploy". |
| William | Tablet: auto-detect a wedge scanner and use the desktop layout; allow partial export with a warning | Open |

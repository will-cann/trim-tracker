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

## Action items

| Who | Item | Status |
|---|---|---|
| Chris | Send William the Apex pick-list PDF, the orders-module CSV export, and an exported manifest | Open |
| Chris | Unlock the generic Apex account (with Moe) | Open |
| William | **Update the manifest form to accept PDF in addition to CSV** | Shipped: *Load a pick list* takes the Apex PDF or a photo of the printed sheet. `parse-pick-list` (Claude document input) returns the lines, `lib/pickListPdf.ts` turns them into pick lines, and the PDF's prices pre-fill *Wholesale prices* on Review. Tuning against Chris's real PDF once it arrives. |
| William | Resolve Metrc per-user authentication | Deployed; waiting on Chris to reload and sign in with his Metrc login. Verify the Settings → Metrc card shows his username, not "Connected by NeuroCann for this deploy". |
| William | Tablet: auto-detect a wedge scanner and use the desktop layout; allow partial export with a warning | Open |

# Proper Brands: manifest picker demo with Chris Wade (2026-11-03)

Chris Wade is Director of Continuous Improvement at Proper Brands (ex Frito-Lay
supply chain, Swisslog / Bastian warehouse automation PM). Brian joined for the
first half. Demo of `proper.neurocann.app/manifest` plus a tour of the plant
map, Metrc sync and SOPs. Chris will run a real ~12-package order through the
picker this week alongside their paper process. Follow-up call: Friday Nov 7,
noon Central (1 pm Eastern).

## How Proper picks today

- Apex is where fulfilment enters inventory and sales pull menus; the pick list
  they walk with is a printed PO. Apex does not sync with Metrc ("they were told
  it would").
- Pickers find a case by the **lot number** (the source batch, e.g. `…108430`),
  not by the product name or the case's own Metrc tag. The eye goes to the last
  digits: six always disambiguates today; we agreed on **seven**.
- When a PO is entered in Apex they also type the **range of Metrc case tags**
  that were packed for it (e.g. `…146121` to `…146131`).
- Every item has a fixed Metrc **approval number / SKU** per product (half-gram
  Black Maple 22s are always the same number). Not in Apex exports today.
- The vault is laid out from a kaizen event so a PO is picked in one pass:
  Goodnight / manufacturing items first, then flower by brand and size, partials
  and end-of-runs at the end of an aisle. Leads build the manifest in the same
  order the PO was picked so QC reads the cart left-to-right. They use
  **tablets** (camera + scanner), not phones or laptops.
- Route plans are printed separately per route; the default planned-route text
  in the picker is fine as is.

## Changes Chris asked for, and where they stand

| Ask | Status |
|---|---|
| Make the lot number the biggest thing on a pick line; show the last 7 digits | Shipped: `LotDigits` on every line (phone and laptop), leading zeros muted; scanned tags bold their last 7 (`TAG_SUFFIX_LEN`). |
| Scan-first: open the scanner and scan what is in front of you | Shipped: **Scan any case** on the pick list. Apex-recorded tags route offline; everything else is looked up in Metrc and matched on the parent lot (item name as fallback). Ambiguous or unknown cases ask the picker. |
| Check scans against the tag range entered in Apex | Shipped: ranges in the Metrc Package ID / Note columns expand to recorded tags; a scan outside what Apex recorded for the line is flagged (amber, not blocked). |
| Sort the pick list to match the vault, editable when the room changes | Shipped: Settings → **Vault walk order** (drag or arrows, saved per device, re-sorts the loaded list). Default is still Jacob's walk; Chris to confirm the real order once he maps it. |
| Check the Metrc approval number / SKU per package | Not yet. Needs the SKU on the pick list (Apex "Product SKU" is usually blank) and confirmation that T3 exposes the item's approval number. Revisit when Chris can share an export with SKUs. |
| Pull pricing from the invoice instead of a separate upload | Already possible (Review → attach invoice). Chris suggested the pick list could be generated from the invoice; parked until we see whether Apex invoice exports carry lots. |
| Export button hard to find | It is the footer button on Review. Left as is; revisit after Chris's first run. |
| Connect the picker to Proper's own Metrc, not Brian's | Shipped the gate: a company without its own T3 connection sees a connect screen where a director **signs in with their Metrc username and password**; T3 registers that login under NeuroCann's T3+ organisation and mints the key (`T3_REGISTRATION_SECRET`). Pasting a T3 key remains the fallback. Env flip below. |

## Action items

1. **Invite Chris** (`cwade@properbrands.com`) to the Proper company as a
   **director** (connecting Metrc needs director/admin). Sign in to
   `proper.neurocann.app` as a Proper director → Team → add a member with that
   email and role → Send invite. The invite email introduces `/manifest` on
   deploys that set `VITE_MANIFEST_DEPLOY_NAME`.
2. **Gate the Proper site behind Chris's T3 login.** Today the Proper site uses
   a deploy-wide `T3_API_KEY` (Brian's Metrc login) plus `MANIFEST_COMPANY_IDS`,
   which satisfies the gate. To route Chris through T3:
   - make sure `METRC_CONNECTION_KEY` is set on the Proper site (self-serve
     needs it) and migration `070_metrc_connections.sql` has run on prod;
   - set `T3_REGISTRATION_SECRET` there to our T3 organisation's registration
     secret (dash.trackandtrace.tools → organisation settings), so Chris sees
     "Sign in with Metrc" rather than instructions to go make a T3 key. Each
     login registered this way takes one seat on our T3+ subscription; check
     there is a free one;
   - `netlify env:unset T3_API_KEY --filter proper-neurocann` (and `T3_MODE`,
     `MANIFEST_COMPANY_IDS`), then redeploy. The picker then shows the connect
     screen until a Proper director signs in with their Metrc login. The
     15-minute Metrc sync for Proper follows the same credentials, so it
     pauses until that happens.
   - Either order works; unsetting first forces the gate on Chris's first
     visit, which is what we want.
   The cloud-agent `NETLIFY_AUTH_TOKEN` had expired at the time of writing, so
   this was not done from here.
3. Send Chris the recap email (URL, login steps, "Phone" layout under Settings
   for tablets, Friday invite).
4. Ask Chris for: a pick-list or PO export that includes the SKU / approval
   number, a photo or sketch of the vault layout in walk order, and the Apex
   tag-range format they actually type.
5. Open items from the tour, not picker-related: packages were not showing in
   the Metrc sync view during the demo ("need another migration"); route-plan
   generation is a possible later automation.

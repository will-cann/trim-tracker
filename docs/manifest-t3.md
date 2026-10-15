# Manifest picker ↔ Metrc via T3

The manifest picker (`/manifest`) can talk to metrc.com through the
[T3 API](https://api.trackandtrace.tools/v2/docs) from Track & Trace Tools. T3 is
not the Metrc third-party API: it drives the same metrc.com pages a logged-in user
sees, with a plain Metrc login and a T3+ subscription. That's what lets the picker
read live package contents and create a licensed transfer, neither of which the
Metrc API exposes to a cultivator.

## What it does

On the Review screen, the **Metrc check** card:

1. **Checks each scanned case against Metrc, Apex and the invoice.** For every tag
   it asks Metrc what the package is (item, quantity, unit, parent lot, lab state)
   and whether it is eligible for a transfer from the chosen origin licence, then
   compares:
   - *Lot* — Metrc's `sourcePackageLabels` must contain the lot tag from Apex's
     Batch ID column.
   - *Qty* — Metrc quantity must equal units-per-case from Apex's Quantity column
     (`2 Cases (100 Units)` → 50), or, for weight-based items, units × the unit
     weight parsed from the product name.
   - *Product* — size (`.5g` vs `1g`) must agree and the Metrc item name must
     overlap the Apex product name (strain match helps).
   - *Lab* — TestPassed / NotRequired pass; failures are flagged.
   - *Status* — eligible, on hold / in transit, on a different licence (with a
     one-tap "use that licence" fix), or not found.
   - *Per line* — case count vs expected, summed Metrc units vs the pick list
     total, and the invoice's billed units (from the attached invoice) vs both.
2. **Validates and creates the transfer.** "Validate in Metrc" resolves the
   recipient, transporter, transfer type and package ids, builds the Metrc payload
   and has T3 dry-run it with dynamic validation (T3 loads the real New Transfer
   form and checks ids exist) without saving anything. "Submit" sends the same
   payload for real and reports the manifest number. One transfer per origin
   licence, same as the `.t3csv` export.

Settings shows the connection: which Metrc login the key is bound to, the T3+
subscription, the licences it can see and whether Metrc grants
`packages:new_transfer` on each.

## Setup

1. Sign in to T3 (dash.trackandtrace.tools) with the Metrc login that owns the
   facility licences and make sure it has an active T3+ subscription.
2. Generate a secret key at <https://api.trackandtrace.tools/v2/pages/secret-key>
   (or `POST /v2/auth/secretkey`). The key is bound to that Metrc username and
   password; rotating the password invalidates it.
3. In Netlify env vars set `T3_API_KEY` to the key and `T3_MODE` (below).
   `MANIFEST_ACCESS_CODE` must also be set — the t3-\* functions are gated by the
   same access code as email export.
4. Open `/manifest` → Settings → *Metrc via T3* → **Check connection**.

The key never reaches the browser. All T3 calls go through
`netlify/functions/t3-status.ts`, `t3-verify-packages.ts` and
`t3-create-transfer.ts`, which share the client in `utils/t3.ts`.

## Read-only, sandbox and live (`T3_MODE`)

A T3 secret key has **no permission scoping of its own**: it does whatever the
Metrc login behind it can do. Limiting what the picker does with it is therefore a
deploy-level decision:

| `T3_MODE`   | Reads real inventory | Transfer "Validate" | Transfer "Submit" |
|-------------|----------------------|---------------------|-------------------|
| `read-only` (default) | yes | dry run with dynamic validation | refused (403 `READ_ONLY`) |
| `sandbox`   | no — sandbox data    | dry run against the sandbox | writes to the sandbox |
| `live`      | yes                  | dry run             | real Metrc transfer, after confirm |

**Read-only for a customer facility (e.g. Proper).** Point `T3_API_KEY` at a key
made from their Metrc login (the director of ops' account linked to your T3
organisation works) and leave `T3_MODE=read-only`. The picker gets live package
facts and real Metrc validation of the manifest; nothing can be submitted from
this deploy, regardless of what that login may do in Metrc. For defence in depth,
ask their Metrc admin to create a dedicated employee login with view-only
permissions (Packages / Transfers views, no `new_transfer`) and generate the key
under that login instead — then the key itself can't write, and Settings will show
the licences as "view only".

**Sandbox.** `POST /v2/auth/sandbox` exchanges the key's session for a token on
the matching sandbox host (`mo.metrc.com` → `sandbox-mo.metrc.com`). Metrc has to
have provisioned sandbox access for that login; if it hasn't, T3 answers 400 and
the picker reports `SANDBOX_UNAVAILABLE`. Sandbox licences and packages are not
the real facility's, so scanned production tags won't be found there — it is for
rehearsing the create-transfer flow end to end, not for checking real inventory.

## Operational notes

- Package lookups OR up to 40 `label__eq` filters per request, so an order costs
  a handful of Metrc page loads per licence rather than one per case. Misses are
  re-checked on the active list (hold / in transit) and then on the other licences
  the login can see, which is how "right package, wrong origin licence" is caught.
- The transfer payload follows the transfer type's flags from
  `/v2/transfers/create/inputs`: weights are only sent when the type requires them
  or the picker has them, wholesale price is required when
  `transactionType == "Wholesale"`. Dates are the delivery day, 00:01 → 23:59, in
  the licence's local time.
- The create response carries no transfer id, so after a submit the function
  diffs `/v2/transfers/outgoing/active` before and after to find the manifest
  number (retrying briefly). If Metrc is slow to list it, the picker still records
  the submission and tells the user where to look.
- Submission is blocked in the UI for the bundled sample order and whenever new
  scans have been added since the last Metrc check.

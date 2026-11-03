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

## Who can use it

The picker signs in with the same Auth0 application as the main app
(`src/manifest/auth.tsx`; callbacks return to `/manifest`). Every manifest
function (`t3-*`, `parse-invoice`, `send-manifest-email`) requires that Bearer
token **and** one of:

- the caller's company has its own Metrc connection (a T3 key a director pasted
  into **Settings → Metrc**; stored encrypted in `metrc_connections`, see
  `docs/metrc-sync.md`), or
- the caller's company is listed in `MANIFEST_COMPANY_IDS` (comma-separated
  company UUIDs) on a deploy that carries `T3_API_KEY`.

The allowlist is what protects a *deploy-wide* key: `resolveContext()`
auto-provisions a company for any new Auth0 signup, so a token alone would let
anyone who can register read the facility's inventory through the site's key. A
company's own key only ever reaches that company's Metrc, so a stored connection
is enough on its own. With neither, every manifest function answers 403 and the
message points at Settings → Metrc.

The picker enforces this up front: `ConnectMetrcGate` (`src/manifest/components/`)
asks `metrc-connection` for the company's status on load and, when there is
neither a stored connection nor a deploy key, shows a **Connect your Metrc first**
screen instead of the pick list. A director or admin connects right there (same
handler and encryption as Settings → Metrc), by **signing in with their Metrc
login** when the server can mint keys (below) or by pasting a T3 secret key;
anyone else is told to ask a director. If the status call itself fails the gate
opens and the per-function 403s take over, so an outage never locks people out
of a list they already loaded.

Within an allowlisted company any role can scan, read invoices, check packages
and dry-run a transfer; **submitting** a transfer to Metrc additionally needs the
`director` or `admin` role (403 `ROLE` otherwise).

Auth0 → Applications → *(the SPA app)* must list the picker URL in **Allowed
Callback URLs** and **Allowed Logout URLs** (`https://<host>/manifest`,
`http://localhost:5173/manifest`) and the origin in **Allowed Web Origins**.
Tokens are cached in localStorage so a phone reload mid-pick stays signed in.

To find a company id: sign in once and open Settings → *Metrc via T3*; the 403
message quotes your company id, which is what goes in `MANIFEST_COMPANY_IDS`.

## Setup

### Self-serve with a Metrc login (preferred)

Set `T3_REGISTRATION_SECRET` on the site to NeuroCann's T3 organisation
registration secret (dash.trackandtrace.tools → organisation; rotatable). The
connect form in Settings → Metrc and on the picker's gate then leads with
**Sign in with Metrc**: state host, username, password (Colorado adds the login
email, Michigan the authenticator seed) and the mode. `metrc-connection` POSTs
`{ metrcLogin, mode }` and `mintKeyFromMetrcLogin()` (`utils/metrcConnections.ts`)
turns it into a key with T3's own auth endpoints (`utils/t3.ts`):

1. `POST /v2/auth/credentials` — a free login check, so a wrong password costs
   one failed Metrc login and is reported as exactly that (skipped for Michigan,
   which wants a live OTP rather than the seed).
2. `POST /v2/auth/register` with the registration secret — T3 validates the
   login against Metrc, registers it under our T3+ organisation (one seat) and
   returns a secret key. 409 means it is already in the organisation, so
3. `POST /v2/auth/secretkey` mints a plain key for the known login.

The key is then verified and stored exactly as a pasted one. The password
transits the Netlify function and is never stored or logged; T3 keeps the
credentials encrypted behind the key, the same as a key made on their dash.
Error codes: `METRC_LOGIN_REJECTED` (400), `REGISTRATION_SECRET` (503, our
secret is stale), `T3_SEATS` (503, organisation full; the message offers the
key path). The form's "Paste it instead" link falls back to the key flow.
Without `T3_REGISTRATION_SECRET` the status reports `metrcLoginAvailable:
false` and only the key form shows.

### Self-serve with a T3 secret key

1. Sign in to T3 (dash.trackandtrace.tools) with a Metrc login for the facility
   (a view-only employee if possible) and add an active T3+ subscription.
2. Generate a secret key at <https://api.trackandtrace.tools/v2/pages/secret-key>
   (or `POST /v2/auth/secretkey`). The key is bound to that Metrc username and
   password; rotating the password invalidates it.
3. In NeuroCann, a director opens **Settings → Metrc**, pastes the key, picks
   read-only (default) or transfers allowed, and connects. The server checks the
   key with T3 before saving it and stores it encrypted. The mode can be changed
   there later; it plays the role `T3_MODE` plays below.
4. Open `/manifest`, sign in, then Settings → *Metrc via T3* → **Check connection**.

### Deploy key (one site per customer)

1–2 as above, then in that site's Netlify env vars set `T3_API_KEY` to the key,
`T3_MODE` (below) and `MANIFEST_COMPANY_IDS` (above). This is how Proper was set
up before self-serve existed and still works.

The key never reaches the browser either way. All T3 calls go through
`netlify/functions/t3-status.ts`, `t3-verify-packages.ts` and
`t3-create-transfer.ts`, which share the client in `utils/t3.ts`; each handler
gets the company's credentials from `authorizeManifestRequest` (`auth.t3`) and
wraps its calls in `withT3(...)`.

## A dedicated deploy per customer (Proper)

Before self-serve connections this was the only way to scope a key: a T3 key is a
customer's Metrc login, so rather than put it in the shared site's env, give the
customer its own Netlify site from the same repo and branch, with the key, the
mode and the allowlist scoped to that deploy. It remains an option for a customer
who wants their users on a separate hostname.

For Proper:

1. Netlify → **Add new site → Import an existing project**, same repo, production
   branch `main`, build `npm run build`, publish `dist`, functions
   `netlify/functions` (all read from `netlify.toml`). Name it e.g. `neurocann-proper`
   and give it a domain such as `proper.neurocann.app`.
2. Env vars on that site only:
   - `DATABASE_URL` — the production Neon branch (Proper is a tenant there;
     `MANIFEST_COMPANY_IDS` is what keeps other tenants out). Use a separate Neon
     branch only if you want their users fully isolated from the main app.
   - `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`,
     `VITE_AUTH0_AUDIENCE` — same values as production (one Auth0 tenant and SPA
     app; add `https://proper.neurocann.app/manifest` to its callback/logout URLs
     and the origin to Allowed Web Origins).
   - `T3_API_KEY` — the key generated from Proper's Metrc login.
   - `T3_MODE=read-only` until the reconciliation has been checked on real orders;
     flip to `live` on this site only when Proper wants transfers created here.
   - `MANIFEST_COMPANY_IDS` — Proper's company id.
   - `VITE_MANIFEST_DEPLOY_NAME="Proper Cannabis"` — shown on the sign-in screen and
     Settings so nobody confuses deploys.
   - `ANTHROPIC_API_KEY` (invoice reading) and `SENDGRID_API_KEY` (email export)
     as needed.
3. Deploy, open `https://proper.neurocann.app/manifest`, sign in, Settings →
   *Metrc via T3* → **Check connection**.

The main production site keeps `T3_API_KEY` unset (Metrc card shows "Not set
up"). Code changes still ship to both sites from `main`; only env differs.

## Read-only, sandbox and live (`T3_MODE` / connection mode)

A T3 secret key has **no permission scoping of its own**: it does whatever the
Metrc login behind it can do. Limiting what the picker does with it is therefore
NeuroCann's decision — the connection's mode in Settings → Metrc for a self-serve
key, `T3_MODE` for a deploy key:

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

## Picking: lot digits, scan-first, Apex tag ranges, vault walk

Proper's pickers find a case by its **lot** (the source batch in Apex's Batch ID
column), not by product name or the case's own tag, and they read the last
digits. So:

- Every pick line leads with the lot's last **7** digits (`TAG_SUFFIX_LEN` in
  `src/manifest/lib/metrc.ts`; `LotDigits` / `TagText` in
  `components/TagDigits.tsx`), leading zeros muted, product name beneath.
  Scanned tags show in full with the last 7 bold.
- **Scan any case** (`ScanAnySheet.tsx`, phone/tablet layout) opens the scanner
  without choosing a line first. A tag Apex recorded for a line routes to it
  offline (`matchRecorded`); anything else is looked up in Metrc
  (`t3-verify-packages`, primary licence plus the order's other origin
  licences) and matched on the parent lot, falling back to the item name
  (`matchByFacts`, `lib/scanFirst.ts`). The facts are kept
  (`mergeFacts`) so the Review check doesn't re-fetch them. Ambiguous or
  unknown cases ask the picker which line it belongs to, or to skip it.
- When Proper enters a PO in Apex they type the **range of case tags** packed for
  it. `expandTagRanges` (`lib/pickList.ts`) turns `1A4…146121-1A4…146131` or the
  shorthand `1A4…146121 to 131` in the Metrc Package ID / Note columns into
  recorded tags (same prefix, forward only, capped at 500). A scan that isn't
  among a line's recorded tags is flagged in amber (`addScan` warnings), not
  blocked, since Apex's record can be stale.
- Pick lists are sorted to the **vault walk** (`lib/vaultOrder.ts`): stops are
  matched from brand / category / name, and Settings → *Vault walk order*
  (`VaultWalkCard.tsx`) lets the lead drag the stops into the order the room is
  actually laid out. The walk is saved per device
  (`manifest-picker:vault-walk:v1`) and re-sorts the loaded list; lines that
  match no stop go last.

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
- Proper's cases carry two labels: the blue Metrc tag (Code 128, the one the
  picker needs) on the side and a white Lucid Green "Enhanced CaseID" QR on the
  front, which is the one a picker sees first. Scanning the QR
  (`https://qr.lcdg.io/c/<id>`, or a unit's LucidID `https://qr.lcdg.io/<id>`)
  is recognised by `src/manifest/lib/lucidGreen.ts` and answered with "that's
  the CaseID label, scan the blue Metrc barcode" instead of the generic
  "not a Metrc tag". Lucid Green's API could resolve a CaseID to its Metrc tag
  if Proper has access; not wired.

# Handoff: Proper Cannabis manifest picker + Metrc via T3

Status as of 2026-10-15. Read with `docs/manifest-t3.md` (design, setup, modes).

## Done

- **PR #45 merged to `main`** (`4e2c667`): T3 integration for `/manifest`.
  - `netlify/functions/t3-status.ts`, `t3-verify-packages.ts`, `t3-create-transfer.ts`;
    client `netlify/functions/utils/t3.ts`; pure logic `utils/t3Transfer.ts`;
    wire types `shared/manifest/t3.ts`.
  - Reconciliation of scanned case tags vs Metrc vs Apex pick list vs invoice:
    `src/manifest/lib/reconcile.ts`, UI `src/manifest/components/MetrcCard.tsx`
    (Review screen) and `T3StatusCard.tsx` (Settings).
  - `T3_MODE`: `read-only` (default, submit refused with 403), `sandbox`, `live`.
  - Auth: picker has its own Auth0 provider (`src/manifest/auth.tsx`); every manifest
    function needs a Bearer token from a company in `MANIFEST_COMPANY_IDS`
    (`netlify/functions/utils/manifestAuth.ts`). Transfer submit also needs director/admin.
    `MANIFEST_ACCESS_CODE` is gone.
- **Dedicated Netlify site `proper-neurocann`** at https://proper.neurocann.app
  (same repo, branch `main`). Auth0 callback/logout/web-origin URLs added. Env vars set.
  Deploy `6ad13b3a…` is live and the bundle has the right Auth0 config.
  - Gotcha: Netlify's secret scanner fails the build (exit code 2) if a value marked
    "secret" shows up in the repo or build output. `VITE_AUTH0_*`, `VITE_MANIFEST_DEPLOY_NAME`,
    `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `APP_PUBLIC_URL`, `T3_MODE` were recreated as
    **non-secret**. Real secrets (`T3_API_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`,
    `SENDGRID_*`, `MANIFEST_COMPANY_IDS`) stay secret.
- Cloud agent env: Netlify CLI installed (`/usr/local/bin/netlify`); `NETLIFY_AUTH_TOKEN`
  and `NETLIFY_SITE_ID` (= `trimtracker`) are injected. Target the Proper site with
  `--filter proper-neurocann` or `NETLIFY_SITE_ID=<proper site id>`.

## In flight (branch `cursor/manifest-auth-company-id-hint-f837`)

- The "MANIFEST_COMPANY_IDS unset" 403 now quotes the caller's company id, so you can
  find it from the picker's Settings screen. Needs a PR + merge to `main` to reach the site.

## Next steps

1. Get Proper's company id: merge the branch above and redeploy, then sign in at
   `https://proper.neurocann.app/manifest` → Settings → *Metrc via T3*; or query
   `SELECT company_id FROM users WHERE email = '<your email>'` on prod Neon.
2. Set it on the Proper site (comma-separate if more than one), then redeploy:
   `netlify env:set MANIFEST_COMPANY_IDS <uuid> --filter proper-neurocann`
   (functions read env at runtime, but redeploy to be safe).
3. Settings → *Metrc via T3* → **Check connection**: expect the Metrc username,
   `mo.metrc.com`, T3+ active, Proper's licences ("can create transfers"/"view only").
4. Load a real Apex pick list, scan, Review → **Check N packages in Metrc**. Sanity-check
   lot / qty / product / lab verdicts against what's physically in the cases. Tune
   `reconcile.ts` thresholds if verdicts are noisy (name-overlap 0.6/0.35, 2% weight tolerance).
5. Remove `T3_API_KEY` and `T3_MODE` from the **main `trimtracker` site**
   (`netlify env:unset T3_API_KEY` with `NETLIFY_SITE_ID` = trimtracker). Also remove the
   now-unused `MANIFEST_ACCESS_CODE` there if present.
6. Only when Proper wants transfers created from here: `T3_MODE=live` on the Proper site.
   Prefer a view-only Metrc employee login for the T3 key until then.

## Not yet verified

- No end-to-end run against the real T3+ account yet (lookups, dry run, submit). The
  request shapes were checked against the live T3 host with a dummy key only.
- The T3 key carries the director of ops' full Metrc permissions; read-only mode is the
  only thing stopping writes.

## Commands

```bash
npm run build && npm test && npx tsc -b
netlify status
netlify logs --source deploy --deploy-id <id>          # failed-build logs (with NETLIFY_SITE_ID set to the site)
netlify api createSiteBuild --data '{"site_id":"<id>","body":{"clear_cache":true}}'
```

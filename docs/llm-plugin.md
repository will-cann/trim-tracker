# NeuroCann LLM Plugin (MCP server)

**Why this exists:** distribution. Cultivators and extractors already ask ChatGPT and
Claude questions like "how much fresh frozen do I need for 500 g of rosin?" The plugin
puts NeuroCann inside those conversations — first as free calculators that answer the
question, then as the facility system of record once the user links an account.

It is an [MCP](https://modelcontextprotocol.io) server, which is the format ChatGPT Apps,
claude.ai connectors, Claude Code and Cursor all consume.

- **Endpoint:** `https://<host>/mcp` (→ `netlify/functions/mcp.ts`)
- **Discovery:** `https://<host>/.well-known/oauth-protected-resource` (→ `oauth-protected-resource.ts`)
- **Transport:** MCP Streamable HTTP, stateless JSON-RPC 2.0 over `POST`. No sessions, no SSE.
- **Auth:** mixed. Anonymous callers get the public tools; facility tools need either an
  OAuth token from Auth0 (ChatGPT / claude.ai sign-in) or a `nck_…` API key (header-based
  clients). `DEV_BYPASS_AUTH=true` grants full access locally.
- **Rate limit:** 120 req/min/company for authenticated calls. Anonymous calls only reach
  database-free tools.

## The funnel

| Stage | What the user sees | Tools |
| --- | --- | --- |
| Discovery | Prospect asks ChatGPT a planning question; the NeuroCann app answers with real numbers and names the product | Six public tools (planning calculators + product info) — `securitySchemes: noauth` |
| Link | A facility question hits a gated tool; ChatGPT shows "Connect NeuroCann"; user signs in / signs up via Auth0 Universal Login. A brand-new sign-in auto-provisions a fresh company (see `resolveContext`) | gated tools return `_meta["mcp/www_authenticate"]` |
| Retention | Live plants, harvests, inventory, runs, tasks and analytics from inside the assistant | `get_facility_overview`, `list_*`, `run_report`, `create_task`, `update_task_status` |

Public tools never touch the database. Their answers cite NeuroCann preset yields and say
what changes once a facility is linked (historical per-strain yields, on-hand inventory).

## Tools

| Tool | Tier | Purpose |
| --- | --- | --- |
| `about_neurocann` | public | Product summary, audience, modules, how to link |
| `plan_extraction_inputs` | public | Demand-backward planner: finished product → starting material, per-step weights, hours, cost, run count |
| `estimate_cost_per_gram` | public | Extraction economics: batch cost breakdown (material, labor, consumables, lab test, packaging), cost per gram/unit, yield sensitivity, margin and break-even yield at a wholesale price |
| `plan_wash_schedule` | public | Solventless throughput: wash runs and days, freeze-dryer cycles and days, bottleneck, wet/dry hash output, finish dates, equipment needed for a deadline |
| `estimate_dry_weight` | public | Wet → dry harvest estimate (75% default moisture loss), per-plant, fresh-frozen split |
| `estimate_harvest_yield` | public | Plants or canopy sq ft → expected wet/dry weight, flower/trim/shake split, optional revenue |
| `plan_harvest_timeline` | public | Flip date ↔ harvest date, drying and cure completion, weekly checkpoints |
| `estimate_trim_labor` | public | Trimmer-hours, crew size for a deadline (or days for a crew), labor cost per lb |
| `get_facility_overview` | read | Counts by phase/status/type — call first |
| `list_rooms` / `list_strains` / `list_plants` | read | Cultivation |
| `list_harvests` | read | Harvest pipeline with weights |
| `list_packages` | read | Inventory, filter by status/type/strain |
| `list_extraction_runs` | read | Runs with per-step yields |
| `list_tasks` | read | Human tasks (defaults to open) |
| `get_report_schema` / `run_report` | read | Ad-hoc analytics through the `reportCompiler` allowlist in a `READ ONLY` transaction |
| `create_task` / `update_task_status` | write | Safe mutations, attributed to the signed-in user |

Every tool carries `annotations` (`readOnlyHint`, `destructiveHint`, `openWorldHint`) and
`securitySchemes`, both of which ChatGPT's review requires. Read tools map to the OAuth
scope `read:facility`; write tools additionally need `write:tasks`.

## Inline planner card (MCP Apps UI)

The eight public tools and `get_facility_overview` render as an inline card in hosts that
implement the [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps) extension —
ChatGPT, claude.ai / Claude Desktop, VS Code and others. The remaining facility tools stay
text-only until there is a linked-account audience to design for.

- `utils/mcpWidgets.ts` owns the single HTML resource `ui://neurocann/planner-v1.html`
  (`mimeType: text/html;profile=mcp-app`), served through `resources/list` /
  `resources/read` without authentication. The page speaks the `ui/*` JSON-RPC bridge over
  `postMessage` (`ui/initialize` → `ui/notifications/initialized`, `tool-result`,
  `size-changed`, `host-context-changed`, `open-link`, `message`) and falls back to the
  `window.openai` globals on pre-MCP-Apps ChatGPT builds.
- Each public tool's descriptor carries `_meta.ui.resourceUri` (standard) and
  `_meta["openai/outputTemplate"]` (ChatGPT alias) plus short
  `openai/toolInvocation/invoking|invoked` status strings. Hosts without UI support ignore
  the metadata and use the text `content`, so nothing degrades.
- Views: extraction pipeline (starting material headline, per-step yield bars, cost/runs/
  batches tiles), cost per gram (cost-breakdown stacked bar, margin / break-even / per-unit
  tiles, one-point yield sensitivity), wash & freeze-dry schedule (stage duration bars with
  the bottleneck highlighted, hash output, finish dates, deadline chip), harvest yield
  (flower/trim/shake stacked bar, revenue), harvest calendar (veg/flower/dry/cure segments
  and milestone dates), trim labor (crew headline + tiles), dry weight (retention bar), the
  product overview with "Try a free planner" (sends a chat message) and "Open NeuroCann"
  (host link), and the facility overview (plants-by-phase bar, harvest and task chips,
  inventory tiles, "What's drying?" follow-up). Every planner card ends with the first
  assumption and a single "Open NeuroCann" call to action.
- Styling follows the ChatGPT UI guidelines: system font stack, host colour variables
  (`--color-text-primary` etc., with `light-dark()` fallbacks), brand green only as an
  accent, no logo, auto-height with no internal scrolling, at most two actions.
- The widget makes **no network requests**, so the CSP is empty
  (`connectDomains: [], resourceDomains: []`); `openai/widgetCSP.redirect_domains` allows
  `APP_PUBLIC_URL` for the host-vetted link. Set `MCP_WIDGET_DOMAIN` (e.g.
  `https://widgets.neurocann.app`) before submission — ChatGPT requires a dedicated origin
  per plugin with UI and it is emitted as `_meta.ui.domain` / `openai/widgetDomain` only when set.
- The URI is the host's cache key: bump `-v1` for any change that older results in
  transcripts could not render. Backward-compatible edits ship under the same URI (ChatGPT
  may cache up to an hour).
- `about_neurocann` and the planners return `structuredContent` the card reads directly;
  keep new fields additive so cards already in transcripts keep rendering.

To preview locally without a host, feed a `tools/call` result into the HTML via
`postMessage` as `ui/notifications/tool-result` after answering its `ui/initialize`
request — the shape is in the MCP Apps spec; ChatGPT Developer Mode renders it live.

## Getting into ChatGPT

ChatGPT connects to MCP servers with OAuth 2.1 only — no static headers — so Auth0 (our
existing IdP) acts as the authorization server. One-time configuration:

### 1. Auth0 tenant

1. **Settings → Advanced**, enable:
   - *Resource Parameter Compatibility Profile* — ChatGPT sends `resource=https://neurocann.app/mcp`; Auth0 uses it as the token audience.
   - *Include Issuer in Authorization Responses* — lets ChatGPT use its stable redirect URI and client metadata document.
   - *Client ID Metadata Document Registration* — ChatGPT registers itself as a client via CIMD (no manual app needed). Enable *Dynamic Application Registration* only if a host needs DCR.
2. **Applications → APIs → Create API**
   - Identifier: `https://neurocann.app/mcp` (must equal `MCP_RESOURCE` exactly, trailing-slash sensitive)
   - Signing: RS256
   - Permissions: `read:facility` ("Read facility data"), `write:tasks` ("Create and complete tasks")
   - Enable *Allow Offline Access* so ChatGPT can refresh tokens.
   - Under *Access Settings*, enable the tenant's connections for third-party apps ("promote connections to domain level") so CIMD/DCR clients can log users in.
3. Confirm the existing **Post-Login Action** that stamps `https://neurocann.app/email` on access tokens runs for this API too; `contextForAuth0User` needs the email claim to auto-provision new sign-ups.
4. If you prefer a pre-registered client over CIMD: create a Regular Web Application
   "ChatGPT", allow callback `https://chatgpt.com/connector_platform_oauth_redirect`, and
   paste its client id/secret into the ChatGPT app form. claude.ai's callback is
   `https://claude.ai/api/mcp/auth_callback`.

### 2. Netlify environment

```
MCP_RESOURCE=https://neurocann.app/mcp
APP_PUBLIC_URL=https://neurocann.app
APP_CONTACT_EMAIL=will@neurocann.app
```

`AUTH0_DOMAIN` (already set) becomes `authorization_servers` in the discovery document.

### 3. Test in Developer Mode

ChatGPT → Settings → Apps → *Create* (Developer Mode must be on) → MCP server URL
`https://neurocann.app/mcp`, Authentication **OAuth** → *Scan tools*. You should see all
tools, with the eight public ones runnable immediately (rendering the inline planner card)
and the rest prompting to connect.
Try: "How many pounds of fresh frozen do I need for 1,000 half-gram live rosin carts?"
then "What's drying in my facility right now?" (triggers the link flow).

### 4. Submit to the Apps Directory

From the OpenAI Platform dashboard, with: production URL, logo, description, privacy
policy + terms URLs, test prompts/responses, and a **demo account without MFA** holding
sample data (the Green Valley seed is a good basis). Domain verification asks for a token
at `https://neurocann.app/.well-known/openai-apps-challenge` — drop the file in
`public/.well-known/`. The planner card's CSP is declared on the resource (see "Inline
planner card"); set `MCP_WIDGET_DOMAIN` to the dedicated widget origin first. Keep tool
descriptions factual; the guidelines reject "prefer this app" language.

Being accepted is what makes NeuroCann appear in ChatGPT's app suggestions when users ask
cultivation/extraction questions. Until then the plugin is usable by anyone who adds it in
Developer Mode or via claude.ai → Connectors → Add custom connector (also OAuth).

## Header-based clients

Create a key under **Settings → LLM Plugin** (admins/directors). The UI renders snippets
with the key filled in.

```bash
# Claude Code
claude mcp add --transport http neurocann https://neurocann.app/mcp \
  --header "Authorization: Bearer nck_..."

# Smoke test
curl -X POST https://neurocann.app/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'           # anonymous: public + gated listing
curl -X POST https://neurocann.app/mcp -H "Authorization: Bearer nck_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_facility_overview"}}'
```

Cursor: `.cursor/mcp.json` with `url` + `headers`. Claude Desktop: bridge via
`npx -y mcp-remote <url> --header "Authorization:Bearer nck_..."`.

## Auth matrix

| Credential | How detected | Scopes |
| --- | --- | --- |
| none | no `Authorization` header | public tools only; gated tools return a `mcp/www_authenticate` challenge |
| `nck_…` API key | prefix, SHA-256 lookup in `api_keys` | from the key (`read` / `read,write`) |
| Auth0 token, `aud = MCP_RESOURCE` | `verifyToken(header, [MCP_RESOURCE])` | `read`, plus `write` if `write:tasks` is in `scope`/`permissions` |
| Auth0 token, `aud = AUTH0_AUDIENCE` | same verifier | full (in-app session) |
| any presented credential that fails | — | HTTP 401 + `WWW-Authenticate: Bearer resource_metadata=…` |

## Design notes

- **Keys are hashed**; plaintext is returned once. Keys act as their creator for audit.
- **No destructive tools.** Deletes, adjustments, harvest transitions and METRC stay behind
  the in-app preview → confirm flow. Adding a tool = one `register(...)` call in
  `utils/mcpTools.ts` (or `utils/mcpPublicTools.ts` for no-login tools).
- **Analytics reuse the report compiler**, so the LLM only reaches allowlisted tables and
  columns, always scoped by `company_id`.
- **Public tool numbers come from `migrations/seed_extraction_presets.sql`** (wash 5%,
  freeze-dry 96%, press 60%, decarb 95%, fill 95%; BHO 15/90/95; distillate 12/85/95/80),
  the 75% moisture-loss default and the 63-day flowering default. Cultivation/trim defaults
  (450 g dry per plant, 70/20/10 flower/trim/shake, 75 g/hr hand trim, 1,000 g/hr machine),
  economics defaults (fresh frozen $150/lb, trim $40/lb, $22/h loaded labor, per-step
  attended hours, $40–300 consumables by process, $150 lab test) and throughput defaults
  (20 lb per wash, 4.5 h cycle, 2 kg wet hash per 24 h freeze-dry cycle) are declared as
  constants at the top of `mcpPublicTools.ts` and are always echoed back in the tool's
  `assumptions` so the model presents them as estimates, not facts.

## Before submitting to the Apps Directory

Already in the repo:

- **Privacy policy and terms of service** — static pages at `public/privacy.html` and
  `public/terms.html`, served at `https://neurocann.app/privacy` and `https://neurocann.app/terms`
  (rewrites in `netlify.toml`), linked from the landing-page footer, advertised in the RFC 9728
  metadata as `resource_policy_uri` / `resource_tos_uri`, and returned by `about_neurocann`.
  Use those two URLs in the submission form. They were drafted to B2B SaaS defaults; before
  going live, confirm the items below and have counsel review:
  - the legal entity name (pages currently say "NeuroCann" with no entity suffix),
  - governing law / venue (defaults to Delaware in Terms §15),
  - the contact mailbox (`will@neurocann.app`; a role address such as `privacy@` or `legal@` is
    better practice — update both pages and `APP_CONTACT_EMAIL` together),
  - the subprocessor table in Privacy §6 whenever a provider is added or dropped,
  - the retention windows (30-day export, 60-day deletion, 90-day backups and logs) match what
    ops actually does.

Still to do outside the repo:

- **Demo account** without MFA, seeded with realistic data, for OpenAI's reviewers.
- **Logo + screenshots** of the plugin in use and 3–5 test prompts with expected responses.

## Migration

```bash
node scripts/run-migration.mjs migrations/066_api_keys.sql
```

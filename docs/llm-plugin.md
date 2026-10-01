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
| Discovery | Prospect asks ChatGPT a planning question; the NeuroCann app answers with real numbers and names the product | `about_neurocann`, `plan_extraction_inputs`, `estimate_dry_weight` — `securitySchemes: noauth` |
| Link | A facility question hits a gated tool; ChatGPT shows "Connect NeuroCann"; user signs in / signs up via Auth0 Universal Login. A brand-new sign-in auto-provisions a fresh company (see `resolveContext`) | gated tools return `_meta["mcp/www_authenticate"]` |
| Retention | Live plants, harvests, inventory, runs, tasks and analytics from inside the assistant | `get_facility_overview`, `list_*`, `run_report`, `create_task`, `update_task_status` |

Public tools never touch the database. Their answers cite NeuroCann preset yields and say
what changes once a facility is linked (historical per-strain yields, on-hand inventory).

## Tools

| Tool | Tier | Purpose |
| --- | --- | --- |
| `about_neurocann` | public | Product summary, audience, modules, how to link |
| `plan_extraction_inputs` | public | Demand-backward planner: finished product → starting material, per-step weights, hours, cost, run count |
| `estimate_dry_weight` | public | Wet → dry harvest estimate (75% default moisture loss), per-plant, fresh-frozen split |
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
tools, with the three public ones runnable immediately and the rest prompting to connect.
Try: "How many pounds of fresh frozen do I need for 1,000 half-gram live rosin carts?"
then "What's drying in my facility right now?" (triggers the link flow).

### 4. Submit to the Apps Directory

From the OpenAI Platform dashboard, with: production URL, logo, description, privacy
policy + terms URLs, test prompts/responses, and a **demo account without MFA** holding
sample data (the Green Valley seed is a good basis). Domain verification asks for a token
at `https://neurocann.app/.well-known/openai-apps-challenge` — drop the file in
`public/.well-known/`. No CSP is needed until we ship a UI widget. Keep tool descriptions
factual; the guidelines reject "prefer this app" language.

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
  freeze-dry 96%, press 60%, decarb 95%, fill 95%; BHO 15/90/95; distillate 12/85/95/80) and
  the 75% moisture-loss default. Keep them in sync if the presets change.

## Migration

```bash
node scripts/run-migration.mjs migrations/066_api_keys.sql
```

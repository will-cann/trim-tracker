# NeuroCann LLM Plugin (MCP server)

NeuroCann ships an [MCP](https://modelcontextprotocol.io) server so external assistants —
Claude Desktop, Claude Code, Cursor, or anything else that speaks MCP — can work with a
facility's data directly. It is the outward-facing counterpart to the in-app AI chat:
the in-app chat brings Claude into NeuroCann, the plugin brings NeuroCann into whatever
LLM the operator already uses.

- **Endpoint:** `https://<host>/mcp` (redirect to `netlify/functions/mcp.ts`)
- **Transport:** MCP Streamable HTTP, stateless. JSON-RPC 2.0 over `POST`; no sessions,
  no server-initiated SSE. `GET` returns 405.
- **Auth:** `Authorization: Bearer nck_...` API key, created under **Settings → LLM Plugin**
  (admins and directors only). Regular Auth0 access tokens are also accepted, which is what
  makes `DEV_BYPASS_AUTH=true` work locally without a key.
- **Rate limit:** 120 requests / minute / company (shared `rate_limits` table).

## Connecting a client

Snippets with your key pre-filled are shown in the settings UI after creating a key.

**Claude Code**

```bash
claude mcp add --transport http neurocann https://<host>/mcp \
  --header "Authorization: Bearer nck_..."
```

**Cursor** (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "neurocann": {
      "url": "https://<host>/mcp",
      "headers": { "Authorization": "Bearer nck_..." }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`) — Desktop's config file only launches
stdio servers, so bridge through `mcp-remote`:

```json
{
  "mcpServers": {
    "neurocann": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<host>/mcp", "--header", "Authorization:Bearer nck_..."]
    }
  }
}
```

**Smoke test**

```bash
curl -X POST https://<host>/mcp \
  -H "Authorization: Bearer nck_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Clients whose remote-connector UI only supports OAuth (claude.ai web, ChatGPT connectors)
cannot send a static header today; an OAuth 2.1 authorization server in front of `/mcp`
is the follow-up that unlocks those.

## Tools

| Tool | Scope | Purpose |
| --- | --- | --- |
| `get_facility_overview` | read | Counts by phase/status/type — call first to orient |
| `list_rooms` | read | Rooms with type, capacity, occupancy |
| `list_strains` | read | Strain catalog |
| `list_plants` | read | Tracked plants + nursery batches; filter by phase/room/strain |
| `list_harvests` | read | Harvests with weights and status |
| `list_packages` | read | Inventory packages; filter by status/type/strain |
| `list_extraction_runs` | read | Runs with per-step input/output/yield |
| `list_tasks` | read | Human tasks (defaults to open) |
| `get_report_schema` | read | Tables/columns/joins available to `run_report` |
| `run_report` | read | Ad-hoc analytics via the allowlisted `ReportSpec` compiler, executed in a `READ ONLY` transaction |
| `create_task` | write | Create a human task (attributed to the key's owner) |
| `update_task_status` | write | pending / in_progress / completed |

Read-only keys never see the write tools in `tools/list`, and a direct `tools/call` against
one returns an `isError` result without touching the database.

## Design notes

- **Keys are hashed.** `api_keys.key_hash` is SHA-256 of the plaintext; only the 12-char
  prefix is stored in clear. The plaintext is returned exactly once from `manage-api-keys`.
- **Keys act as their creator.** `user_id` on the key is used for `created_by_user_id` /
  `completed_by_user_id`, so the audit trail points at a real person, and the key's
  company scope is whatever that user belongs to.
- **Scopes are coarse on purpose** (`read`, `write`). Finer-grained allowlists can follow the
  Assign-to-AI brief's model if needed.
- **No destructive tools.** Deletes, package adjustments, METRC actions and harvest state
  transitions stay in the app where the preview → confirm → execute flow applies. Adding a
  tool means registering it in `netlify/functions/utils/mcpTools.ts` with a scope and
  `annotations`; the handler takes care of dispatch, scope checks and error framing.
- **Analytics reuse the report compiler.** `run_report` goes through the same
  `compileReportSpec` allowlist as the in-app Reports view, so the LLM can only reach the
  tables and columns already deemed safe, always scoped by `company_id`.

## Migration

```bash
node scripts/run-migration.mjs migrations/066_api_keys.sql
```

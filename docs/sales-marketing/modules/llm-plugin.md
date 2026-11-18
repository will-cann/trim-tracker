# LLM Plugin (ChatGPT, Claude, Claude Code, Cursor)

**Elevator pitch:** NeuroCann answers inside the assistants your team already uses — free planners with no account, your live facility after a one-time link, and task creation with consent.

## Who it's for

- Owner-operators and extraction leads who already ask ChatGPT or Claude planning questions
- Managers who want "what's drying / what's in stock" from a phone without opening another app
- Technical founders wiring NeuroCann into Claude Code or Cursor

**Nav:** Settings → LLM Plugin (API keys, snippets). The plugin itself lives in the host: ChatGPT (Developer Mode now; Apps Directory after acceptance), claude.ai / Claude Desktop (custom connector), Claude Code and Cursor (MCP with an API key).

## Problem

Cannabis software is another login and another screen. Operators already ask an assistant how much fresh frozen a cart order needs or what a gram of rosin costs, and the assistant guesses. Meanwhile the real numbers sit in the facility record nobody opens from the floor.

## Value

This is what makes NeuroCann **headless**: the engine answers wherever the question is asked. Planners give real, assumption-labelled numbers to anyone; linking a facility swaps presets for the operator's own strains, rooms, inventory and history; every result renders as an inline card; and nothing changes in the facility without consent.

## Key capabilities (shipped)

- MCP server at `https://neurocann.app/mcp` (Streamable HTTP), 20 tools
- **8 public tools, no account:** product info, fresh-frozen-to-product planner, cost per gram, wash and freeze-dry schedule, dry weight, harvest yield, harvest timeline, trim labor
- **10 read tools after linking:** facility overview, rooms, strains, plants, harvests, packages, extraction runs, tasks, report schema, run report
- **2 write tools behind `write:tasks` consent:** create task, update task status
- Account linking via Auth0 OAuth (ChatGPT, claude.ai); scoped `nck_` API keys for Claude Code and Cursor, hashed at rest, revocable
- Inline cards (MCP Apps) for every public tool and the facility overview: extraction pipeline, cost breakdown, schedule bars, yield split, calendar, labor, dry weight, product overview, facility snapshot
- Every planner answer states its assumptions and what changes once a facility is linked

## Demo script

1. In ChatGPT (or Claude), no account: "How many pounds of fresh frozen do I need for 1,000 half-gram live rosin carts?" Show the extraction card; point at the assumptions line.
2. "What does a gram of live rosin cost me to make at $14 a gram?" Show the cost card: material share, margin, break-even yield.
3. "What's drying in my facility right now?" Show the connect prompt → sign in → facility overview card.
4. "Create a task to flip Flower Room 3 to 12/12 tomorrow, high priority." Show the consent, then the task in the NeuroCann app.
5. Close: "Same record whether the crew used voice, the app, or their phone in ChatGPT."

## Talking points

- "You don't have to open NeuroCann to use NeuroCann."
- "The planner tells you its yield assumptions. Link your facility and it uses yours."
- "Read by default. Tasks only with consent. Revoke in one click."

## Differentiators

- Open standard (MCP), so one integration covers ChatGPT, Claude, Claude Code, Cursor and VS Code
- Public planners as the top of the funnel; no other cannabis platform is discoverable from inside an assistant
- Cards, not JSON: results are readable on a phone
- Scoped, hashed, revocable keys; no host ever gets database access

## Do not claim

- "In the ChatGPT Apps Directory" before acceptance (say Developer Mode / custom connector)
- "Works with any AI" (say: hosts that support MCP, and name them)
- Writes beyond tasks from an assistant (moves, weights, packages, runs are app and voice today)
- Planner numbers as industry benchmarks (they are NeuroCann process-template presets until linked)
- METRC sync, ambient GA, or any certification

## Objections

| Objection | Answer |
| --- | --- |
| Data in ChatGPT | Per-user link, scoped, revocable; assistants receive tool results only when a user asks; no training on customer data; hosts never touch the database |
| "Can it move plants from ChatGPT?" | Not yet; it will offer a task. Richer writes come behind the same consent model |
| "Why not just use ChatGPT?" | ChatGPT alone guesses yields and doesn't know what's in Flower Room 2 |

## Related modules

AI & Voice (same propose → confirm loop), Tasks (what the write tools create), Reports (`run_report` reuses the report allowlist), Settings (API keys). Technical doc: `docs/llm-plugin.md`. Positioning: `docs/briefs/headless-positioning-brief.md`.

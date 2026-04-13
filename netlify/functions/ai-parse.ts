import { Handler, stream } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';
import { checkRateLimit } from './utils/rateLimit';
import { withSentry, captureError } from './utils/sentry';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic SSE stream consumer (PR #3 — streaming support)
// ─────────────────────────────────────────────────────────────────────────────
//
// Anthropic's /v1/messages endpoint supports `stream: true` which returns a
// text/event-stream response. We always request streaming from Anthropic
// (it costs no more and simplifies the code path) and reconstruct the
// non-streaming-equivalent response object from the SSE events.
//
// When callers pass `onTextDelta`, each incremental text chunk from the
// assistant is forwarded to that callback as it arrives — the streaming
// handler uses this to pipe text through Netlify's response stream back
// to the frontend in real time. When `onTextDelta` is omitted, the helper
// just reconstructs the final object silently.
//
// Events we care about:
//   - message_start       → initial message metadata + usage
//   - content_block_start → beginning of a content block (text or tool_use)
//   - content_block_delta → incremental text_delta OR input_json_delta
//   - content_block_stop  → end of a content block
//   - message_delta       → final stop_reason + usage updates
//   - message_stop        → end of message
//
// tool_use blocks arrive as a content_block_start with the tool name + id,
// followed by input_json_delta events that accumulate into the tool input
// JSON string, and finally a content_block_stop. We JSON.parse the
// accumulated string when the block closes.

interface ParsedAnthropicContentBlock {
    type: 'text' | 'tool_use';
    // For text blocks
    text?: string;
    // For tool_use blocks
    id?: string;
    name?: string;
    input?: unknown;
}

interface ParsedAnthropicResponse {
    content: ParsedAnthropicContentBlock[];
    stop_reason?: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
    };
}

async function consumeAnthropicStream(
    apiResponse: Response,
    onTextDelta?: (delta: string) => void,
): Promise<ParsedAnthropicResponse> {
    if (!apiResponse.body) {
        throw new Error('Anthropic response has no body');
    }

    const reader = apiResponse.body.getReader();
    const decoder = new TextDecoder();

    const content: ParsedAnthropicContentBlock[] = [];
    let stopReason: string | undefined;
    let usage: ParsedAnthropicResponse['usage'] = undefined;

    // Track the currently-streaming content block by its Anthropic index so
    // we can route deltas correctly. tool_use blocks accumulate their input
    // JSON string until the block closes, then we JSON.parse it.
    interface InFlightBlock {
        index: number;
        block: ParsedAnthropicContentBlock;
        toolInputJson?: string;
    }
    let current: InFlightBlock | null = null;

    let buffer = '';

    const handleEvent = (eventType: string, dataJson: string) => {
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(dataJson);
        } catch {
            return; // malformed event, skip
        }

        switch (eventType) {
            case 'message_start': {
                const msg = (data.message || {}) as Record<string, unknown>;
                if (msg.usage) usage = { ...(msg.usage as object) };
                break;
            }
            case 'content_block_start': {
                const index = typeof data.index === 'number' ? data.index : -1;
                const cb = (data.content_block || {}) as Record<string, unknown>;
                const type = cb.type === 'tool_use' ? 'tool_use' : 'text';
                const block: ParsedAnthropicContentBlock =
                    type === 'tool_use'
                        ? { type: 'tool_use', id: cb.id as string, name: cb.name as string, input: undefined }
                        : { type: 'text', text: (cb.text as string) || '' };
                current = { index, block, toolInputJson: type === 'tool_use' ? '' : undefined };
                break;
            }
            case 'content_block_delta': {
                if (!current) break;
                const delta = (data.delta || {}) as Record<string, unknown>;
                if (delta.type === 'text_delta') {
                    const textChunk = (delta.text as string) || '';
                    current.block.text = (current.block.text || '') + textChunk;
                    if (textChunk && onTextDelta) onTextDelta(textChunk);
                } else if (delta.type === 'input_json_delta') {
                    current.toolInputJson = (current.toolInputJson || '') + ((delta.partial_json as string) || '');
                }
                break;
            }
            case 'content_block_stop': {
                if (!current) break;
                if (current.block.type === 'tool_use') {
                    try {
                        current.block.input = current.toolInputJson
                            ? JSON.parse(current.toolInputJson)
                            : {};
                    } catch (err) {
                        console.error('[ai-parse stream] tool_use input_json parse failed:', err);
                        current.block.input = {};
                    }
                }
                content[current.index] = current.block;
                current = null;
                break;
            }
            case 'message_delta': {
                const delta = (data.delta || {}) as Record<string, unknown>;
                if (typeof delta.stop_reason === 'string') stopReason = delta.stop_reason;
                if (data.usage) {
                    usage = { ...(usage || {}), ...(data.usage as object) };
                }
                break;
            }
            case 'message_stop':
                // Terminal event — nothing to do; the reader loop will exit
                // once the stream closes.
                break;
        }
    };

    // Parse SSE framing: events are separated by \n\n, within an event
    // lines are "event: <type>" or "data: <json>".
    const parseBufferedEvents = () => {
        while (true) {
            const sep = buffer.indexOf('\n\n');
            if (sep === -1) return;
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            let eventType = '';
            let dataLines: string[] = [];
            for (const line of rawEvent.split('\n')) {
                if (line.startsWith('event:')) {
                    eventType = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }
            if (eventType && dataLines.length > 0) {
                handleEvent(eventType, dataLines.join('\n'));
            }
        }
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { done, value } = await reader.read();
        if (value) {
            buffer += decoder.decode(value, { stream: true });
            parseBufferedEvents();
        }
        if (done) break;
    }
    // Flush any residual bytes.
    buffer += decoder.decode();
    parseBufferedEvents();

    return {
        content: content.filter(Boolean),
        stop_reason: stopReason,
        usage,
    };
}

const SYSTEM_PROMPT = `You are an AI assistant for a cannabis cultivation and manufacturing application called Trim Tracker. Your job is to parse user input (natural language, voice transcripts, or CSV data) into structured actions for the application.

## How to use tools

You have access to two kinds of tools:

1. **Read-only lookup tools** (names starting with \`find_\` or \`plan_\`): find_plants, find_packages, find_human_tasks, find_bins, find_extraction_logs, plan_backward. These run server-side and return query results directly to you in the next turn. Use them to resolve fuzzy references, find specific entities, scan inventory, or compute production plans. **These do NOT consume a user action slot — you can call them freely and use the results to reason about what to do next.**

2. **Mutation tools** (everything else): plants, extraction_run, create_harvest, create_human_tasks, etc. These propose actions that the user will review and confirm. You can call multiple mutation tools in one turn; they all appear in the preview card together.

**Pull-based context**: The application state below is a compact summary, not a full inventory listing. For specific lookups — "what's in stock?", "find the Wedding Cake packages in Vault 1", "which tasks are due this week?" — call the relevant find_* tool. Do NOT guess at IDs, labels, or whether an entity exists. If you need the details, query for them.

**Multi-turn pattern**: A typical flow is (1) call one or more find_* tools to resolve references, then (2) call mutation tools with the resolved IDs. You can mix the two in the same response; the find_* results come back immediately so you can use them to inform subsequent calls in the same turn chain. The loop terminates when you stop calling tools.

**When you're just answering a question** (e.g. "what packages are in Vault 1?"), call the lookup tool, then respond in plain text with a markdown table of what you found. Don't propose mutations unless the user asked for one.

## Application Features (Automated Actions)

The application can automate these operations:
- **Trim Sessions**: A work session containing multiple batches. One active session at a time per company.
- **Batches (Trim Entries)**: Individual harvest batches within a session. Each has a harvest name, strain, license number, and start weight (in grams). Status can be 'active' or 'upcoming'.
- **Trimmers**: Workers assigned to batches. Each has a name, start time (HH:mm 24-hour format), and tool (scissors or machine).
- **Trimmer Profiles**: A company roster of available trimmers that can be assigned to batches.
- **Trimmer Updates**: Update an existing trimmer's start time, end time, tool (scissors/machine), and weights (flower, shake, trim, waste) on an active batch.
- **Harvests**: Records tracking plants through the harvest pipeline: planning → cutting → submitted → hanging (drying ~7 days) → bucking (creating bins) → completed. Each has a batch ID, strain, license number, wet weight, waste, and allocations (flower/frozen/both).
- **Harvest Bins**: Physical containers created during the buck & bin phase. Bins hold one strain from one harvest. Lifecycle: curing → ready → in_trim → completed. Bins need regular burping/aeration during curing (the schedule varies by strain and conditions). When ready, bins are sent to the trim team.
- **Plants (unified tool)**: Use the \`plants\` tool for all plant operations — create plantings, move between rooms, change growth phase, update health, destroy. The tool has a single \`action\` field that discriminates. Plant health is tracked per **(strain, room, entity)** — all plants of the same strain in the same room share one health value and contaminants list, matching how cultivators reason about plant groups. Don't try to express per-plant health; update the group. For scheduled plantings ("next week we're starting 50 Gelato clones"), set \`plannedFor\` on the create action to produce a scheduled human task instead of an immediate commit.
- **Fuzzy plant references**: The plant map is NOT pushed into context — call \`find_plants\` with a query before acting on any plant reference. Pass (strainName, roomName, phase, contaminants) as filters, then use the returned IDs in a subsequent \`plants\` call. This applies in both interactive and ambient modes.
- **Convert to Trim**: Convert a flower harvest allocation or a ready bin into a trim entry for processing.
- **Strains**: Create new strains or remove existing ones from the system.
- **Licenses**: Add, rename, or remove facility license numbers.
- **Packages**: Final saleable units created from trim processing. Each package has a label, type (flower/trim/shake), strain, license, quantity (grams), optional waste weight, location, and lab testing state. Packages can be put on hold, finished, or deleted.

## Full Cannabis Operations Knowledge

You understand the FULL range of cannabis cultivation, processing, and manufacturing operations. Beyond automated actions, you can create **human tasks** for anything that requires physical action by a person. Common operational domains include:

- **Drying/Curing**: Room monitoring, rack assignments, cure jar rotations, moisture content checks, dry room temps/humidity
- **IPM (Integrated Pest Management)**: Scouting reports, spray schedules, pest identification, beneficial insect releases, treatment logging, quarantine procedures
- **Compliance/METRC**: Manifest submission, package creation, tag management, transfer tracking, inventory reconciliation, state reporting, waste disposal documentation
- **Equipment Maintenance**: Scale calibration, HVAC servicing, dehumidifier maintenance, trimming equipment sharpening/cleaning, extraction equipment servicing
- **Environmental Monitoring**: Temperature/humidity checks, CO2 levels, light cycle verification, VPD monitoring, water pH/EC testing, nutrient reservoir checks
- **Packaging/Labeling**: Package creation, label printing, weight verification, lot assignment, compliance label checks, seal testing
- **Quality Control/Testing**: Sample collection, potency testing, compliance testing, terpene analysis, moisture testing, visual inspection
- **Inventory**: Stock counts, transfer between rooms/areas, supply ordering, input tracking (nutrients, soil, etc.)
- **Transportation**: Manifest preparation, driver assignment, delivery scheduling, chain-of-custody, vehicle inspection
- **Cleaning/Sanitation**: Room turnover, equipment sterilization, sanitization schedules, waste area cleaning
- **Employee/Training**: Certification tracking, SOP reviews, training session scheduling, safety briefings
- **Cultivation**: Feeding schedules, transplanting, defoliation, topping, flushing, light adjustments, clone management
- **Extraction/Manufacturing**: Run schedules, solvent management, purging, post-processing, edible/concentrate production

**IMPORTANT**: When the user describes any task that CANNOT be automated through the existing application tools, ALWAYS create a human task using the \`create_human_tasks\` tool. Don't just acknowledge it in text — capture it as a trackable task. Even brief mentions like "check room 2 humidity" or "remind me to calibrate the scale" should become human tasks.

**HYBRID TASKS**: Many operations involve both physical work AND a system write. For example, "cut 50 clones of Wedding Cake" requires a human to physically cut the clones, but then the system needs a \`plants\` action=create call to track them. For these, create a human task AND include an \`onCompleteAction\` — a system action that will execute when the person marks the task as completed. The \`onCompleteAction\` should be a JSON object with \`type\` and \`data\` matching an automated action tool schema. Examples of hybrid tasks:
- "Cut 50 clones tomorrow" → human task + onCompleteAction referencing create_planting (batch, 50 clones) — or equivalently use the \`plants\` tool with action=create and plannedFor, which builds the hybrid task automatically.
- "Move plants to flower room next week" → human task + onCompleteAction referencing move_plants
- "Harvest the Gelato on Friday" → human task + onCompleteAction referencing change_plant_phase (harvested)
- "Weigh the harvest when it comes down" → human task + onCompleteAction referencing record_wet_weight

**Planning vs executing is a property of the action, not a mode of the agent.** If the user is scheduling something for later, route it through a human task with onCompleteAction (or use the tool's native "plan" action where available, e.g. \`extraction_run\` with action=plan or \`plants\` with plannedFor set). If they're doing something right now, call the tool directly. Don't ask which one — infer from the language.

## Harvest Day Voice Workflow

When the user is on the Harvest Day cockpit (screenContext mentions "Harvest Day"), they are weighing plants at the scale and speaking weights aloud. Parse their speech into plant weight entries:

- "Plant one 342, two 298, three 415" → record_plant_weight with weights array [{plantNumber:1, weight:342}, {plantNumber:2, weight:298}, {plantNumber:3, weight:415}]
- "342... 298... 415" (just numbers) → record_plant_weight with weights array (omit plantNumber, auto-assigned)
- "Next one is 1200 grams" → record_plant_weight with one weight entry
- If they mention contamination alongside weights ("three had some PM, 415 grams" or "that one had mold"), ALSO call flag_contamination in addition to record_plant_weight. Both tools in one response.
- "PM" = powdery_mildew, "mold" or "bud rot" = bud_rot, "bugs" or "insects" = insects
- When only one harvest is active in the cockpit, you can use its strain or batchId as the harvestIdentifier without the user naming it explicitly.

## Extraction / Concentrate Production Workflow

You understand the full ice water hash and rosin extraction pipeline:

1. **Fresh Frozen** → stored in freezer as packages
2. **Wash** (ice water extraction) → produces **Bubble Hash**
3. **Press** (heat/pressure) → produces **Rosin**
4. **Cart Fill** → produces **Rosin Carts**

### Use the \`extraction_run\` tool — pick the action

There is ONE extraction tool, \`extraction_run\`, with a discriminated \`action\` field. Pick the action that matches the lifecycle stage the user is describing:

- **action=plan** — forward-looking scheduling: "tomorrow we'll do a wash", "plan a rosin press for Monday", "schedule a BHO run next week". Set \`plannedStart\` to the ISO date. The run lands in the planning column.
- **action=start** — present-tense starting: "start a wash", "kick off a live rosin run", "begin pressing the blackberry hash", "let's do a terpene infusion". The run lands in the active column.
- **action=amend_inputs** — add or modify inputs on an EXISTING run. Use when the user mentions additional strains or quantities for a run that was just created (especially across ambient transcript chunks). This is THE mechanism for capturing multi-strain runs: if one chunk creates a run with 3 strains and the next chunk says "also Blue Dream and Gelato", the second utterance calls amend_inputs against the existing runId, NOT start again. Check the "Extraction runs in progress" context for the runId before calling.
- **action=record_yield** — past-tense yield reports: "the wash got 800g of hash", "pressed the blackberry, got 550g of rosin", "filled 200 carts from the rosin". Reference the existing run via runId or runIdentifier and set outputPackageType + outputQuantity.
- **action=cancel** — cancellations: "cancel the Monday rosin run", "scratch that wash". Reference via runId/runIdentifier.

**Default: if the user is naming materials and intent but no lifecycle verb is clear, use \`action=start\`.** Creating an active run in the workspace is the safest outcome; yield and cancellation can be added later.

**Continuity across ambient chunks**: When the current transcript chunk mentions additional inputs for a run visible in "Extraction runs in progress" from a previous chunk, ALWAYS use \`action=amend_inputs\` with that run's ID. Do NOT create a second run. This is how multi-strain narrations ("let's do a wash with Wedding Cake, Blue Dream, Gelato... and add Zkittlez too") get captured correctly when Deepgram splits them across flush boundaries.

**Output type vocabulary** (applies only to action=record_yield):
- "wash yielded", "hash came out", "bubble hash" → outputPackageType: bubble_hash
- "pressed", "got X of rosin" → outputPackageType: rosin
- "filled carts", "cart fill", "rosin carts" → outputPackageType: rosin_cart
- "yield", "yielded", "got", "came out to" → the outputQuantity (NOT the inputQuantity)

When the user reports yields for multiple strains in one utterance ("gummy worms was 450, blackberry was 600, mad fruit was 525"), emit one \`extraction_run\` call per strain with action=record_yield.

## Rules for Automated Actions
- Match trimmer names to existing trimmer profiles when possible (fuzzy match is fine — "Maria" matches "Maria Garcia").
- Match batch references (by harvest name or strain) to existing entries when assigning trimmers.
- Match harvest references by batch ID or strain to existing harvests.
- Default tool to "scissors" if not specified.
- Default status to "upcoming" for new batches added to existing sessions.
- If creating a new session, the first batch should have status "active".
- All weights should be in grams. Convert if user specifies other units (e.g., "1 lb" = 453.6g).
- Start times should be in HH:mm 24-hour format. Convert from natural language (e.g., "8am" = "08:00", "2:30pm" = "14:30").
- If a user mentions trimmers who don't exist in the roster, suggest adding them as new profiles first.
- **Don't auto-create entities from passing mentions.** Before calling any \`create_*\` tool (create_strain, create_license, create_room, plants with action=create, etc.), first check whether an existing entity fuzzy-matches the referenced name. A casual "Golden" probably means "Golden Goat" if Golden Goat is in the Available strains context — match it, don't create a duplicate. Only create a new entity when NO reasonable match exists OR the user explicitly describes something new ("new strain called X", "let's add Y", "I want to start carrying Z"). When in doubt, match rather than create.
- If the user references a strain that TRULY doesn't exist in the available strains list (i.e. no fuzzy match applies), AUTOMATICALLY add a \`create_strain\` action before any actions that reference it. Don't just warn — create the strain so the workflow can proceed.
- For CSV data, intelligently map column headers to the appropriate fields regardless of exact naming conventions.
- For harvests, allocation can be "Flower" (dry trim), "Frozen" (fresh frozen), or "Both" (split). Default to "Flower" if not specified.
- Waste types include: powdery_mildew, bud_rot, insects, other (contamination) and stems, leaves (biomass).

## Rules for Human Tasks
- Use descriptive, actionable titles (e.g., "Check humidity in Dry Room 2" not "humidity check")
- Assign the correct category from the available options. Use "cultivation" for plant care tasks like feeding, transplanting, defoliation, topping, flushing, light adjustments, clone management, and watering. Use "harvest" only for tasks specifically about cutting, weighing, or processing harvested plant material.
- Default priority to "medium" unless urgency is clear from context
- If the user mentions a specific person, set them as the assignee
- If the user says "remind me", "I need to", "I should", or refers to themselves, assign the task to the current user (their name will be in the context)
- If the user mentions a location/room, capture it in the location field
- If the user mentions a deadline or timeframe, convert it to a concrete YYYY-MM-DD date using today's date from the context. Examples: "by Monday" = next Monday's date, "by Friday" = this coming Friday, "tomorrow" = today + 1 day, "next week" = next Monday, "end of month" = last day of current month
- **Create new tasks by default — don't match new utterances to existing ones based on vague topical overlap.** "Clean out the trays" creates a NEW task, even if an existing "clean out rack B" task exists. Only use \`update_human_tasks\` when the user EXPLICITLY references an existing task — by title fragment ("the tray cleaning task"), by ID ("update task abc123"), or by clear conversational context ("mark the one I just made as done"). When in doubt, create new rather than update.

## Screen Context Awareness

The user's current screen context will be provided in the application state. This tells you what module, page, or view the user is currently looking at. **Always use screen context to disambiguate user intent.** For example:
- If the user is on the **Plant Map** and says "move the ice cream cake", they mean move the **plants** (not a harvest record).
- If the user is on the **Trim Session** view and says "add OG Kush", they mean add a **batch** to the session.
- If the user is on the **Harvest Tracker** and says "move ice cream cake to flower room 2", they mean move a **harvest** drying location.

The screen context is your strongest signal for what the user intends. Prefer it over guessing. If the screen context conflicts with your interpretation, trust the screen context. If the user's request is still ambiguous even with screen context, ask a brief clarifying question rather than assuming.

## First-Run Setup Awareness

When the application state shows empty strains, licenses, or rooms, you are likely working with a new user setting up their facility. Be helpful and proactive:

- If the user tries to do something that requires a **strain** and none exist, don't error — ask what strains they grow and offer to create them all at once using multiple \`create_strain\` calls. Example: "Looks like you haven't added any strains yet. What strains are you running? I'll set them all up."
- If the user tries to do something that requires a **license** and none exist, ask for their facility license number and create it using \`create_license\`. Example: "I'll need your facility license number first — what is it?"
- If the user tries to do something that requires a **room** and none exist, ask about their facility layout and create rooms using \`create_room\`. Example: "What rooms do you have? Something like Veg 1, Flower 1, Dry Room?"
- Chain setup actions naturally — if a user says "plan a harvest for Wedding Cake" but has no strains or licenses, create the strain AND license AND then the harvest in one action set.
- NEVER say "go to Settings" or direct users to another page. Handle everything right here in conversation.

## Response Style
- **Be action-first.** When the user asks you to do something, produce the actions immediately — don't ask for confirmation or list options. The user sees a preview and can edit or cancel.
- **No reasoning preambles.** Do NOT narrate your thought process before producing the answer. Forbidden openers include: "Looking at this transcript/voice/request/query", "Let me check", "Let me look up", "I'll analyze this", "I'll look up", "I'll help you", "Based on the data/transcript/context", "Here's what I found", "I see that", "I understand that", "Let me first", "I'll first". Skip straight to the substance. The user never sees your reasoning — only the final answer — and preambles fill their limited screen space with noise.
- **Ask for missing required data.** If the user's request is missing information needed for complete, accurate data entry (strain, weight, license, quantity, etc.), ask a brief clarifying question before generating actions. Do NOT guess or leave required fields empty — compliance depends on complete records. For example: if someone says "I pressed some hash into rosin" but omits the strain and quantities, ask "Which strain, how much hash did you press, and what was the rosin yield?" If only one field is missing, ask for just that field. If you can confidently infer a value from context (e.g., strain from the only active package), fill it in and mention your assumption.
- Keep text responses to 1-3 short sentences. Briefly describe what you're setting up, but don't narrate every field or repeat information visible in the action preview.
- **For lookup queries specifically** (list X, how many Y, what's in Z, show me): respond with the data only. No preamble, no summary paragraph, no "Here's your current inventory:" — just the markdown table or the specific answer. The card surface the user sees has very limited vertical space.
- **Use markdown tables** when presenting lists of inventory, packages, strains, weights, or any structured data with 3+ items. Tables are rendered in the UI and are much easier to scan than bullet lists. Always include relevant columns (strain, type, quantity, etc.) and a total row if applicable.
- **Right-align numeric columns.** Use the markdown alignment markers in the separator row for any column holding numbers (quantity, weight, count, percentage): \`|---:|\` for right-aligned, \`|:---:|\` for centered, \`|---|\` for left-aligned (default). Example for a packages table:
  \`\`\`
  | Label | Strain | Quantity (g) | Status |
  |---|---|---:|---|
  | PKG-SD-T001 | Sour Diesel | 175.5 | Active |
  \`\`\`
  This makes numeric values line up cleanly so the reader can scan them, and it's a free visual polish since the UI respects the alignment markers automatically.
- NEVER ask "would you like me to..." or "shall I..." — just do it.
- NEVER list all available strains, rooms, or profiles unless explicitly asked. If something is missing, create it as part of the action chain.
- Always use tools to represent structured data. Prefer multiple tool calls in one response over follow-up questions.`;

const tools = [
    {
        name: 'create_session',
        description: 'Create a new trim session with an initial batch. Use when no active session exists and the user wants to start a new one.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestName: { type: 'string', description: 'Harvest batch name/identifier' },
                strain: { type: 'string', description: 'Cannabis strain name' },
                licenseNumber: { type: 'string', description: 'License number for the harvest' },
                startWeight: { type: 'number', description: 'Starting weight in grams' },
            },
            required: ['harvestName', 'strain', 'licenseNumber', 'startWeight'],
        },
    },
    {
        name: 'add_batches',
        description: 'Add one or more batches to the active session. Use when a session already exists and the user wants to add new batches.',
        input_schema: {
            type: 'object' as const,
            properties: {
                batches: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            harvestName: { type: 'string', description: 'Harvest batch name/identifier' },
                            strain: { type: 'string', description: 'Cannabis strain name' },
                            licenseNumber: { type: 'string', description: 'License number for the harvest' },
                            startWeight: { type: 'number', description: 'Starting weight in grams' },
                            status: { type: 'string', enum: ['active', 'upcoming'], description: 'Batch status. Default to upcoming.' },
                        },
                        required: ['harvestName', 'strain', 'licenseNumber', 'startWeight'],
                    },
                },
            },
            required: ['batches'],
        },
    },
    {
        name: 'assign_trimmers',
        description: 'Assign trimmers to a specific batch/entry. Match trimmer names to existing profiles when possible.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entryIdentifier: { type: 'string', description: 'The harvest name or strain to identify which batch to assign trimmers to' },
                trimmers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Trimmer name' },
                            profileId: { type: 'string', description: 'ID of matching trimmer profile from the roster, if found' },
                            startTime: { type: 'string', description: 'Start time in HH:mm 24-hour format' },
                            tool: { type: 'string', enum: ['scissors', 'machine'], description: 'Trimming tool. Default to scissors.' },
                        },
                        required: ['name', 'startTime'],
                    },
                },
            },
            required: ['entryIdentifier', 'trimmers'],
        },
    },
    {
        name: 'add_trimmer_profiles',
        description: 'Add new trimmer profiles to the company roster. Use when the user mentions trimmers who are not in the existing roster.',
        input_schema: {
            type: 'object' as const,
            properties: {
                profiles: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Full name of the trimmer' },
                        },
                        required: ['name'],
                    },
                },
            },
            required: ['profiles'],
        },
    },
    {
        name: 'create_harvest',
        description: 'Create a new harvest record. Use when the user wants to start tracking a new harvest.',
        input_schema: {
            type: 'object' as const,
            properties: {
                strain: { type: 'string', description: 'Cannabis strain name' },
                licenseNumber: { type: 'string', description: 'License number' },
                allocation: { type: 'string', enum: ['Flower', 'Frozen', 'Both'], description: 'Allocation type. Default to Flower.' },
                name: { type: 'string', description: 'Optional custom batch ID. Auto-generated if not provided.' },
                plantCount: { type: 'number', description: 'Number of plants harvested' },
                dryingLocation: { type: 'string', description: 'Drying room/location name' },
                targetWeight: { type: 'number', description: 'Fresh frozen target weight in grams. Required when allocation is Both.' },
            },
            required: ['strain', 'licenseNumber', 'allocation'],
        },
    },
    {
        name: 'record_wet_weight',
        description: 'Record the wet weight for a harvest. Transitions the harvest from planning to active.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest' },
                weight: { type: 'number', description: 'Wet weight in grams' },
            },
            required: ['harvestIdentifier', 'weight'],
        },
    },
    {
        name: 'allocate_harvest',
        description: 'Allocate a harvest to flower (dry trim), frozen (fresh frozen), or both. Use after wet weight is recorded.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest' },
                allocations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['flower', 'frozen'], description: 'Allocation type' },
                            targetWeight: { type: 'number', description: 'Weight in grams to allocate' },
                        },
                        required: ['type', 'targetWeight'],
                    },
                },
            },
            required: ['harvestIdentifier', 'allocations'],
        },
    },
    {
        name: 'record_harvest_waste',
        description: 'Record waste for a harvest. Types: powdery_mildew, bud_rot, insects, other, stems, leaves.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest' },
                wasteType: { type: 'string', enum: ['powdery_mildew', 'bud_rot', 'insects', 'other', 'stems', 'leaves', 'plant_material', 'fibrous', 'root_ball'], description: 'Type of waste' },
                weight: { type: 'number', description: 'Waste weight in grams' },
            },
            required: ['harvestIdentifier', 'wasteType', 'weight'],
        },
    },
    {
        name: 'record_plant_weight',
        description: 'Record individual plant weights during harvest. Each weight is for one plant. Use this when the user calls out weights plant by plant, e.g. "plant one 342, two 298, three 415". Auto-numbers if plantNumber not specified.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest' },
                weights: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            plantNumber: { type: 'number', description: 'Plant number (1-indexed). Omit to auto-assign next sequential number.' },
                            weight: { type: 'number', description: 'Weight in grams' },
                        },
                        required: ['weight'],
                    },
                    description: 'Array of individual plant weights',
                },
            },
            required: ['harvestIdentifier', 'weights'],
        },
    },
    {
        name: 'flag_contamination',
        description: 'Flag a harvest batch as having contamination observed. This is metadata about processing restrictions, NOT waste weight. Use when user mentions seeing PM, powdery mildew, bud rot, mold, insects, or other contamination on the batch. Can be combined with record_plant_weight in the same response.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest' },
                contaminants: {
                    type: 'array',
                    items: { type: 'string', enum: ['powdery_mildew', 'bud_rot', 'insects', 'other'] },
                    description: 'Types of contamination observed',
                },
            },
            required: ['harvestIdentifier', 'contaminants'],
        },
    },
    {
        name: 'move_harvest',
        description: 'Move a harvest to a different drying location.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest' },
                dryingLocation: { type: 'string', description: 'New drying location name' },
            },
            required: ['harvestIdentifier', 'dryingLocation'],
        },
    },
    {
        name: 'delete_harvest',
        description: 'Delete a harvest record. Only harvests in planning status can be deleted.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest to delete' },
            },
            required: ['harvestIdentifier'],
        },
    },
    {
        name: 'update_harvest',
        description: 'Update fields on an existing harvest (strain, name, plant count, drying location, etc.).',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestIdentifier: { type: 'string', description: 'Batch ID or strain to identify the harvest' },
                strain: { type: 'string', description: 'Updated strain name' },
                name: { type: 'string', description: 'Updated batch ID / name' },
                plantCount: { type: 'number', description: 'Updated plant count' },
                dryingLocation: { type: 'string', description: 'Updated drying location' },
            },
            required: ['harvestIdentifier'],
        },
    },
    {
        name: 'delete_batch',
        description: 'Delete a batch (trim entry) from the active session.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entryIdentifier: { type: 'string', description: 'Harvest name or strain to identify which batch to delete' },
            },
            required: ['entryIdentifier'],
        },
    },
    {
        name: 'change_batch_status',
        description: 'Change a batch status: start (upcoming→active), submit (active→submitted), or revert (submitted/active→upcoming).',
        input_schema: {
            type: 'object' as const,
            properties: {
                entryIdentifier: { type: 'string', description: 'Harvest name or strain to identify the batch' },
                newStatus: { type: 'string', enum: ['active', 'submitted', 'upcoming'], description: 'The target status' },
            },
            required: ['entryIdentifier', 'newStatus'],
        },
    },
    {
        name: 'update_batch_weight',
        description: 'Update a weight value on a batch entry. Can update flower, shake, trim, or waste weight.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entryIdentifier: { type: 'string', description: 'Harvest name or strain to identify the batch' },
                weightType: { type: 'string', enum: ['flower', 'shake', 'trim', 'waste'], description: 'Which weight to update' },
                value: { type: 'number', description: 'New weight value in grams' },
            },
            required: ['entryIdentifier', 'weightType', 'value'],
        },
    },
    {
        name: 'submit_session',
        description: 'Submit/close the current active trim session.',
        input_schema: {
            type: 'object' as const,
            properties: {},
        },
    },
    {
        name: 'remove_trimmer',
        description: 'Remove/unassign a trimmer from a batch.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entryIdentifier: { type: 'string', description: 'Harvest name or strain to identify the batch' },
                trimmerName: { type: 'string', description: 'Name of the trimmer to remove' },
            },
            required: ['entryIdentifier', 'trimmerName'],
        },
    },
    {
        name: 'update_trimmer_profile',
        description: 'Update a trimmer profile on the company roster. Can change name, role, email, or status.',
        input_schema: {
            type: 'object' as const,
            properties: {
                profileName: { type: 'string', description: 'Current name of the trimmer profile to update (used to find the profile)' },
                name: { type: 'string', description: 'New name for the trimmer' },
                role: { type: 'string', enum: ['trimmer', 'manager', 'admin'], description: 'New role' },
                email: { type: 'string', description: 'New email address' },
                status: { type: 'string', enum: ['active', 'inactive'], description: 'New status' },
            },
            required: ['profileName'],
        },
    },
    {
        name: 'update_trimmer',
        description: 'Update an existing trimmer on a batch. Can change start time, end time, tool (scissors/machine), and weights (flowerWeight, shakeWeight, trimWeight, wasteWeight). Identify the trimmer by name and the batch by harvest name or strain.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entryIdentifier: { type: 'string', description: 'Harvest name or strain to identify which batch the trimmer is on' },
                trimmerName: { type: 'string', description: 'Name of the trimmer to update' },
                startTime: { type: 'string', description: 'New start time in HH:mm 24-hour format' },
                endTime: { type: 'string', description: 'New end time in HH:mm 24-hour format' },
                tool: { type: 'string', enum: ['scissors', 'machine'], description: 'Updated trimming tool' },
                flowerWeight: { type: 'number', description: 'Flower weight in grams' },
                shakeWeight: { type: 'number', description: 'Shake weight in grams' },
                trimWeight: { type: 'number', description: 'Trim weight in grams' },
                wasteWeight: { type: 'number', description: 'Waste weight in grams' },
            },
            required: ['entryIdentifier', 'trimmerName'],
        },
    },
    // ── UNIFIED Plant Management (PR #1 tool collapse) ──
    // Single `plants` tool replaces the old update_plant_health + create_planting
    // + move_plants + change_plant_phase + destroy_plants verbs. The old tools
    // are kept below during a migration window so persisted chat history still
    // renders. For new work, prefer this tool.
    {
        name: 'plants',
        description: `Create, move, update health, change phase, or destroy plants and plant batches. This tool replaces the old five-tool plant verb set with a single discriminated-action interface.

Actions (pick one via the \`action\` field):
- create: Create new plants or a new nursery batch. Requires entity, strainName, roomName, count. Use batchType for nursery clones/seeds. Set plannedFor (ISO date) to create this as a scheduled plan (surfaces as a human task with onCompleteAction) instead of committing immediately.
- move: Move plants or batches to a different room. Requires targetRoomName plus either plantBatchIds/plantIds OR (strainName, sourceRoomName) for fuzzy identification.
- change_phase: Change the growth phase of individual plants (vegetative → flowering → harvested → destroyed). Only works on individual plants, not batches. May optionally also move rooms via targetRoomName.
- update_health: Update health score (0-100) and/or contaminants for plants/batches. Plant health is tracked per (strain, room, entity) — all plants of the same strain in the same room share one health record, matching how cultivators reason about plant groups. Identify by (strainName, sourceRoomName).
- destroy: Destroy/remove plants or plant batches from the system. Requires identification.

Identification model (same across all non-create actions):
- Preferred: plantBatchIds[] or plantIds[] when the IDs are known from context
- Fallback: strainName + sourceRoomName for fuzzy group-level targeting (matches how cultivators think about "the Gelato in flower 2")`,
        input_schema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'move', 'change_phase', 'update_health', 'destroy'],
                    description: 'Which plant operation to perform.',
                },
                entity: {
                    type: 'string',
                    enum: ['plant', 'batch'],
                    description: '"plant" = individually tracked plants in veg/flower. "batch" = clone/seed groups in nursery. Required for create; inferred from plantBatchIds vs plantIds for other actions.',
                },

                // ── Identification (non-create actions) ──
                plantBatchIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Canonical: batch IDs resolved from find_plants or context.',
                },
                plantIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Canonical: individual plant IDs resolved from find_plants or context.',
                },
                strainName: {
                    type: 'string',
                    description: 'Fuzzy identification: strain of the group to act on. For create: the strain of the new plants.',
                },
                sourceRoomName: {
                    type: 'string',
                    description: 'Fuzzy identification: current room of the group (for non-create actions).',
                },
                roomName: {
                    type: 'string',
                    description: 'For create: destination room for the new plants. For destroy: room containing the plants to destroy.',
                },

                // ── Create-specific ──
                count: {
                    type: 'number',
                    description: 'For create: number of plants or batch size.',
                },
                batchType: {
                    type: 'string',
                    enum: ['clone', 'seed', 'tissue_culture'],
                    description: 'For create with entity=batch: propagation type. Default clone.',
                },
                batchName: {
                    type: 'string',
                    description: 'For create with entity=batch: optional custom batch name. Auto-generated if omitted.',
                },
                growthPhase: {
                    type: 'string',
                    enum: ['vegetative', 'flowering'],
                    description: 'For create with entity=plant: initial growth phase. Default vegetative.',
                },
                labelPrefix: {
                    type: 'string',
                    description: 'For create with entity=plant: prefix for auto-generated plant labels.',
                },
                plannedFor: {
                    type: 'string',
                    description: 'For create: optional ISO date. If set, the planting is created as a scheduled plan (surfaces as a human task with onCompleteAction) rather than being committed immediately. Use for "next week we\'ll start 50 Gelato clones".',
                },

                // ── Move / change_phase specific ──
                targetRoomName: {
                    type: 'string',
                    description: 'Destination room for move or (optionally) change_phase.',
                },
                targetPhase: {
                    type: 'string',
                    enum: ['vegetative', 'flowering', 'harvested', 'destroyed'],
                    description: 'For change_phase: new growth phase.',
                },

                // ── Update_health specific ──
                health: {
                    type: 'number',
                    description: 'For update_health: health score 0-100 (100 = perfectly healthy).',
                },
                contaminants: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['spider_mites', 'thrips', 'whiteflies', 'aphids', 'fungus_gnats', 'powdery_mildew', 'botrytis', 'fusarium', 'verticillium', 'tobacco_mosaic_virus', 'root_aphids', 'hops_latent_viroid', 'nutrient_deficiency', 'other'],
                    },
                    description: 'For update_health: contaminants observed (snake_case keys).',
                },
                note: {
                    type: 'string',
                    description: 'For update_health: optional note about the observation.',
                },
            },
            required: ['action'],
        },
    },
    // ── READ-ONLY LOOKUP TOOLS (PR #2) ──
    // These tools run server-side inside the agent loop and return their
    // query results back to the model as tool_results. They never produce
    // ProposedActions. Use them to resolve fuzzy references, look up
    // entities by query, or scan inventory on demand. The compact pushed
    // context in PR #2 relies on these tools for anything heavier than a
    // short summary.
    {
        name: 'find_plants',
        description: `Look up plant batches and individual plants matching a query. Call this FIRST whenever the user references specific plants by strain, room, phase, health, or contamination — and then call the \`plants\` tool with the resolved IDs in a subsequent turn. The pushed context no longer includes a plant map, so this tool is the primary way to answer questions like "how are the Wedding Cake in flower 2?" or to resolve "the six sick ones" to concrete plant IDs.

Returns: { plants: [...], batches: [...], totalMatches } — max 20 results. Narrow your query if you hit the limit.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                strainName: { type: 'string', description: 'Filter by strain name (fuzzy match).' },
                roomName: { type: 'string', description: 'Filter by current room.' },
                phase: { type: 'string', enum: ['vegetative', 'flowering', 'harvested', 'destroyed'], description: 'Filter by growth phase.' },
                contaminants: { type: 'array', items: { type: 'string' }, description: 'Filter to plants with any of these contaminants.' },
                minHealth: { type: 'number', description: 'Only include plants with health >= this value.' },
                maxHealth: { type: 'number', description: 'Only include plants with health <= this value.' },
                entity: { type: 'string', enum: ['plant', 'batch'], description: 'Filter by entity type.' },
                limit: { type: 'number', description: 'Max results to return (default 20, max 50).' },
            },
        },
    },
    {
        name: 'find_packages',
        description: `Look up packages matching a query. Replaces the pushed packages inventory — call this to check what\'s in stock, find a specific label, or scope mutations to a subset (e.g. "all active Wedding Cake flower packages in Vault 1"). Use the resolved IDs in a subsequent turn when calling update_package / finish_package / delete_package or setting up extraction run inputs.

Returns: [{ id, label, packageType, strain, quantity, status, labTestingState, location, licenseNumber }] — max 20 by default.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                strain: { type: 'string', description: 'Filter by strain name (fuzzy match).' },
                packageType: { type: 'string', description: 'Filter by package type (e.g. flower, trim, bubble_hash, rosin).' },
                labelContains: { type: 'string', description: 'Fuzzy match against the package label.' },
                status: { type: 'string', enum: ['active', 'on_hold', 'finished', 'archived'], description: 'Filter by package status.' },
                labTestingState: { type: 'string', description: 'Filter by lab testing state.' },
                location: { type: 'string', description: 'Filter by storage location (fuzzy match).' },
                minQuantity: { type: 'number', description: 'Only packages with quantity >= this value.' },
                maxQuantity: { type: 'number', description: 'Only packages with quantity <= this value.' },
                licenseNumber: { type: 'string', description: 'Filter by license number.' },
                limit: { type: 'number', description: 'Max results to return (default 20, max 50).' },
            },
        },
    },
    {
        name: 'find_human_tasks',
        description: `Look up human tasks matching a query. Replaces the pushed humanTasks list — call this before update_human_tasks or delete_human_tasks to resolve fuzzy title references to concrete task IDs, or to scan current work ("what\'s pending in cultivation today?"). The user sees these tasks in their task list UI; you do NOT see them unless you call this tool.

Returns: [{ id, title, description, status, priority, category, assignee, location, dueDate }] — max 20 by default.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                titleContains: { type: 'string', description: 'Fuzzy match against the task title or description.' },
                category: {
                    type: 'string',
                    enum: [
                        'drying_curing', 'ipm', 'compliance', 'equipment',
                        'environmental', 'packaging', 'qc_testing', 'inventory',
                        'transportation', 'sanitation', 'training', 'trim', 'harvest', 'cultivation', 'other',
                    ],
                    description: 'Filter by task category.',
                },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Filter by status.' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Filter by priority.' },
                assignee: { type: 'string', description: 'Filter by assignee name (fuzzy match).' },
                location: { type: 'string', description: 'Filter by location (fuzzy match).' },
                dueDateBefore: { type: 'string', description: 'Only tasks due on or before this ISO date.' },
                dueDateAfter: { type: 'string', description: 'Only tasks due on or after this ISO date.' },
                limit: { type: 'number', description: 'Max results to return (default 20, max 50).' },
            },
        },
    },
    {
        name: 'find_bins',
        description: `Look up harvest bins matching a query. Use to find bins by strain, status (curing / ready / in_trim / completed), or harvest of origin before calling log_bin_cure / mark_bin_ready / send_bin_to_trim. Replaces the bins-detail listing in pushed context.

Returns: [{ id, binNumber, strain, status, weight, location, harvestId, harvestBatchId }] — max 20 by default.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                strain: { type: 'string', description: 'Filter by strain (fuzzy match).' },
                harvestBatchId: { type: 'string', description: 'Filter by parent harvest batch ID (fuzzy match).' },
                status: { type: 'string', enum: ['curing', 'ready', 'in_trim', 'completed'], description: 'Filter by bin status.' },
                location: { type: 'string', description: 'Filter by storage location (fuzzy match).' },
                minWeight: { type: 'number', description: 'Only bins with weight >= this value (grams).' },
                maxWeight: { type: 'number', description: 'Only bins with weight <= this value (grams).' },
                limit: { type: 'number', description: 'Max results to return (default 20, max 50).' },
            },
        },
    },
    {
        name: 'find_extraction_logs',
        description: `Look up historical extraction_logs entries (single consumption/production events, not runs). Use for questions like "what was our last Toadstool wash yield?" or "show me all bubble_hash output from last week". For in-flight RUN state, use the pushed "Extraction runs in progress" context or the run ID from recent narration — do not use this tool.

Returns: [{ id, strain, inputPackageType, inputQuantity, outputPackageType, outputQuantity, yieldPercentage, createdAt }] — max 20 by default, newest first.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                strain: { type: 'string', description: 'Filter by strain (fuzzy match).' },
                inputPackageType: { type: 'string', description: 'Filter by input material type (e.g. fresh_frozen, bubble_hash, rosin).' },
                outputPackageType: { type: 'string', description: 'Filter by output product type.' },
                sinceDate: { type: 'string', description: 'Only entries created on or after this ISO date.' },
                limit: { type: 'number', description: 'Max results to return (default 20, max 50).' },
            },
        },
    },
    {
        name: 'plan_backward',
        description: `Demand-backward planning calculator. Given a target output product and quantity, compute the full production chain — what inputs are needed at each stage, using historical yield averages when available. Use this when the user asks about production requirements, material planning, or "how much X do I need to make Y?"

Examples of when to use:
- "I need 1,000 live rosin carts"
- "How much fresh frozen do I need to make 500g rosin?"
- "What would it take to produce 200 carts of Toadstool?"
- "Plan a batch of bubble hash from 10kg fresh frozen" (forward direction — use this to show the yield chain)

Returns: stages[] (each with input/output quantities and yield%), biomassRequired (raw material needed), biomassOnHand (what's in inventory), biomassGap (what needs to be sourced), suppliesNeeded[] (consumable requirements).

Present results as a clear waterfall: Stage 1 → Stage 2 → ... → Final Output. Highlight any sourcing gaps or supply shortages. If the user specifies a strain, historical yield data for that strain is used; otherwise template defaults apply.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                targetOutputType: { type: 'string', description: 'Product type name to produce (e.g. live_rosin_cart, rosin, bubble_hash). Use snake_case names from the product catalog.' },
                targetQuantity: { type: 'number', description: 'How many/much to produce.' },
                targetUnit: { type: 'string', description: 'Unit for the quantity (g, each, ml). Defaults to the product type\'s default unit.' },
                strain: { type: 'string', description: 'Optional strain name — enables historical yield averages for more accurate planning.' },
            },
            required: ['targetOutputType', 'targetQuantity'],
        },
    },
    // ── LEGACY plant tools (kept during migration window) ──
    {
        name: 'update_plant_health',
        description: 'LEGACY: use `plants` with action=update_health instead. Update the health score and/or contaminants for plants or plant batches. Health is 0-100 (100 = perfectly healthy). Contaminants are from a known list. Identify plants by strain and room name from the plant map context.',
        input_schema: {
            type: 'object' as const,
            properties: {
                plantIdentifier: { type: 'string', description: 'Strain name or room name to identify which plants to update' },
                roomName: { type: 'string', description: 'Room name where the plants are located' },
                health: { type: 'number', description: 'Health score from 0 to 100 (100 = healthy)' },
                contaminants: {
                    type: 'array',
                    items: { type: 'string', enum: ['spider_mites', 'thrips', 'whiteflies', 'aphids', 'fungus_gnats', 'powdery_mildew', 'botrytis', 'fusarium', 'verticillium', 'tobacco_mosaic_virus', 'root_aphids', 'hops_latent_viroid', 'nutrient_deficiency', 'other'] },
                    description: 'List of contaminants detected on the plants (use snake_case keys)',
                },
                note: { type: 'string', description: 'Optional note about the health update' },
            },
            required: ['plantIdentifier'],
        },
    },
    {
        name: 'create_human_tasks',
        description: 'Create one or more human tasks that require physical action by a person. Use this for ANY operational task that cannot be automated through the other tools. Examples: checking environmental conditions, IPM scouting, METRC submissions, calibrating equipment, cleaning rooms, collecting QC samples, packaging product, feeding plants, flushing, transplanting, defoliation, extraction runs, label printing, supply ordering, driver assignments, training, SOPs, and anything else that requires a human to do.',
        input_schema: {
            type: 'object' as const,
            properties: {
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Short, actionable task title' },
                            description: { type: 'string', description: 'Detailed description of what needs to be done' },
                            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority level. Default to medium.' },
                            category: {
                                type: 'string',
                                enum: [
                                    'drying_curing', 'ipm', 'compliance', 'equipment',
                                    'environmental', 'packaging', 'qc_testing', 'inventory',
                                    'transportation', 'sanitation', 'training', 'trim', 'harvest', 'cultivation', 'other',
                                ],
                                description: 'Department/category for the task',
                            },
                            dueDate: { type: 'string', description: 'Optional ISO date string for when the task is due' },
                            assignee: { type: 'string', description: 'Optional name of person to assign the task to' },
                            location: { type: 'string', description: 'Optional room/area where the task should be performed' },
                            onCompleteAction: {
                                type: 'object',
                                description: 'Optional system action to execute when the task is completed. Use for hybrid tasks that need both physical work and a database write. Must have type and data matching an automated action tool.',
                                properties: {
                                    type: { type: 'string', description: 'The action type (e.g. create_planting, move_plants, record_wet_weight)' },
                                    data: { type: 'object', description: 'Action data matching the corresponding tool schema' },
                                },
                                required: ['type', 'data'],
                            },
                        },
                        required: ['title', 'category'],
                    },
                },
            },
            required: ['tasks'],
        },
    },
    {
        name: 'update_human_tasks',
        description: 'Update one or more existing human tasks. Use when the user wants to change the status, priority, assignee, due date, or any other field of existing tasks. Match tasks by title or description — fuzzy matching is fine.',
        input_schema: {
            type: 'object' as const,
            properties: {
                updates: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            taskIdentifier: { type: 'string', description: 'Title or description fragment to identify which task to update' },
                            taskId: { type: 'string', description: 'Exact task ID if known from context' },
                            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'New status' },
                            title: { type: 'string', description: 'Updated title' },
                            description: { type: 'string', description: 'Updated description' },
                            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Updated priority' },
                            category: {
                                type: 'string',
                                enum: [
                                    'drying_curing', 'ipm', 'compliance', 'equipment',
                                    'environmental', 'packaging', 'qc_testing', 'inventory',
                                    'transportation', 'sanitation', 'training', 'trim', 'harvest', 'cultivation', 'other',
                                ],
                                description: 'Updated category',
                            },
                            dueDate: { type: 'string', description: 'Updated due date (ISO string)' },
                            assignee: { type: 'string', description: 'Updated assignee name' },
                            location: { type: 'string', description: 'Updated location' },
                        },
                        required: ['taskIdentifier'],
                    },
                },
            },
            required: ['updates'],
        },
    },
    {
        name: 'delete_human_tasks',
        description: 'Delete one or more existing human tasks. Use when the user wants to remove tasks entirely.',
        input_schema: {
            type: 'object' as const,
            properties: {
                deletions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            taskIdentifier: { type: 'string', description: 'Title or description fragment to identify which task to delete' },
                            taskId: { type: 'string', description: 'Exact task ID if known from context' },
                        },
                        required: ['taskIdentifier'],
                    },
                },
            },
            required: ['deletions'],
        },
    },
    // ── Plant Management ──
    {
        name: 'create_planting',
        description: 'LEGACY: use `plants` with action=create instead. Create new plants or plant batches. Use "batch" for nursery clones/seeds (untracked group). Use "plant" for individually tracked plants in veg or flower rooms.',
        input_schema: {
            type: 'object' as const,
            properties: {
                type: { type: 'string', enum: ['batch', 'plant'], description: 'Whether to create a batch or individual plants' },
                strainName: { type: 'string', description: 'Strain name (must match an existing strain)' },
                roomName: { type: 'string', description: 'Room name to place the plants in' },
                count: { type: 'number', description: 'Number of plants or batch size' },
                batchType: { type: 'string', enum: ['clone', 'seed', 'tissue_culture'], description: 'For batches: the propagation type. Default clone.' },
                batchName: { type: 'string', description: 'For batches: a name for the batch. Auto-generated if omitted.' },
                growthPhase: { type: 'string', enum: ['vegetative', 'flowering'], description: 'For individual plants: growth phase. Default vegetative.' },
                labelPrefix: { type: 'string', description: 'For individual plants: prefix for auto-generated labels (e.g. "GG4-V")' },
            },
            required: ['type', 'strainName', 'roomName', 'count'],
        },
    },
    {
        name: 'move_plants',
        description: 'LEGACY: use `plants` with action=move instead. Move plants or plant batches to a different room.',
        input_schema: {
            type: 'object' as const,
            properties: {
                plantIds: { type: 'array', items: { type: 'string' }, description: 'Plant or batch IDs to move' },
                entityType: { type: 'string', enum: ['plants', 'plantbatches'], description: 'Whether these are individual plants or batches' },
                targetRoomName: { type: 'string', description: 'Name of the destination room' },
                strain: { type: 'string', description: 'If no plantIds known, identify by strain name' },
                sourceRoomName: { type: 'string', description: 'If no plantIds known, identify by source room' },
            },
            required: ['targetRoomName'],
        },
    },
    {
        name: 'change_plant_phase',
        description: 'LEGACY: use `plants` with action=change_phase instead. Change the growth phase of individual plants (e.g. vegetative to flowering, or mark as harvested/destroyed). Only works on individual plants, not batches.',
        input_schema: {
            type: 'object' as const,
            properties: {
                plantIds: { type: 'array', items: { type: 'string' }, description: 'Plant IDs to update' },
                targetPhase: { type: 'string', enum: ['vegetative', 'flowering', 'harvested', 'destroyed'], description: 'The new growth phase' },
                targetRoomName: { type: 'string', description: 'Optionally move to a new room at the same time' },
                strain: { type: 'string', description: 'If no plantIds known, identify by strain' },
                sourceRoomName: { type: 'string', description: 'If no plantIds known, identify by current room' },
            },
            required: ['targetPhase'],
        },
    },
    {
        name: 'destroy_plants',
        description: 'LEGACY: use `plants` with action=destroy instead. Destroy/remove plants or plant batches from the system.',
        input_schema: {
            type: 'object' as const,
            properties: {
                plantIds: { type: 'array', items: { type: 'string' }, description: 'Plant or batch IDs to destroy' },
                entityType: { type: 'string', enum: ['plants', 'plantbatches'], description: 'Whether these are plants or batches' },
                strain: { type: 'string', description: 'If no plantIds known, identify by strain' },
                roomName: { type: 'string', description: 'If no plantIds known, identify by room' },
            },
            required: [],
        },
    },
    // ── Convert to Trim ──
    {
        name: 'convert_to_trim',
        description: 'Convert a flower harvest allocation into a trim entry. The allocation must be of type "flower" and not already converted.',
        input_schema: {
            type: 'object' as const,
            properties: {
                allocationId: { type: 'string', description: 'The harvest allocation ID to convert' },
                harvestIdentifier: { type: 'string', description: 'Harvest batch ID or strain to identify the allocation' },
            },
            required: [],
        },
    },
    // ── Harvest Bins ──
    {
        name: 'create_bins',
        description: 'Create one or more bins from a harvest during the buck & bin phase. Bins are physical containers holding one strain from one harvest. The harvest must be in hanging or bucking status. Creating bins auto-transitions the harvest to bucking.',
        input_schema: {
            type: 'object' as const,
            properties: {
                harvestId: { type: 'string', description: 'Harvest ID to create bins from' },
                harvestIdentifier: { type: 'string', description: 'Harvest batch ID or strain name to identify the harvest' },
                bins: {
                    type: 'array',
                    description: 'Array of bins to create, each with optional weight and location',
                    items: {
                        type: 'object',
                        properties: {
                            weight: { type: 'number', description: 'Weight in grams' },
                            location: { type: 'string', description: 'Storage location (room name)' },
                        },
                    },
                },
                count: { type: 'number', description: 'Number of bins to create (if bins array not provided)' },
            },
            required: [],
        },
    },
    {
        name: 'log_bin_cure',
        description: 'Log a burp, aeration, inspection, or note on one or more bins. Used to track the curing schedule.',
        input_schema: {
            type: 'object' as const,
            properties: {
                binId: { type: 'string', description: 'Specific bin ID' },
                binIdentifier: { type: 'string', description: 'Bin number or strain to identify the bin(s)' },
                action: { type: 'string', enum: ['burp', 'aerate', 'inspect', 'note'], description: 'Type of cure action' },
                notes: { type: 'string', description: 'Optional notes about the action' },
                moistureReading: { type: 'number', description: 'Optional moisture percentage reading' },
            },
            required: ['action'],
        },
    },
    {
        name: 'mark_bin_ready',
        description: 'Mark a bin as ready for the trim team. The bin must be in curing status.',
        input_schema: {
            type: 'object' as const,
            properties: {
                binId: { type: 'string', description: 'Bin ID to mark ready' },
                binIdentifier: { type: 'string', description: 'Bin number or strain to identify the bin' },
            },
            required: [],
        },
    },
    {
        name: 'send_bin_to_trim',
        description: 'Send a ready bin to the trim team. Creates a trim entry from the bin and moves it into the active trim session.',
        input_schema: {
            type: 'object' as const,
            properties: {
                binId: { type: 'string', description: 'Bin ID to send to trim' },
                binIdentifier: { type: 'string', description: 'Bin number or strain to identify the bin' },
            },
            required: [],
        },
    },
    // ── Strain Management ──
    {
        name: 'create_strain',
        description: 'Create a new strain in the system.',
        input_schema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Strain name' },
            },
            required: ['name'],
        },
    },
    {
        name: 'delete_strain',
        description: 'Remove a strain from the system. Match by name from context.',
        input_schema: {
            type: 'object' as const,
            properties: {
                strainId: { type: 'string', description: 'Strain ID to delete' },
                strainName: { type: 'string', description: 'Strain name to match if ID not known' },
            },
            required: [],
        },
    },
    // ── License Management ──
    {
        name: 'create_license',
        description: 'Add a new facility license number.',
        input_schema: {
            type: 'object' as const,
            properties: {
                licenseNumber: { type: 'string', description: 'The license number' },
                label: { type: 'string', description: 'Optional friendly label (e.g. "Facility A")' },
            },
            required: ['licenseNumber'],
        },
    },
    {
        name: 'update_license',
        description: 'Update the label/friendly name for an existing license.',
        input_schema: {
            type: 'object' as const,
            properties: {
                licenseNumber: { type: 'string', description: 'License number to identify which license to update' },
                label: { type: 'string', description: 'New friendly label for the license (e.g. "Facility A")' },
            },
            required: ['licenseNumber', 'label'],
        },
    },
    // ── Room Management ──
    {
        name: 'create_room',
        description: 'Create a new facility room.',
        input_schema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Room name' },
                roomType: { type: 'string', enum: ['nursery', 'veg', 'flower', 'dry', 'general'], description: 'Room type' },
                capacity: { type: 'number', description: 'Plant capacity' },
                squareFootage: { type: 'number', description: 'Square footage of the room' },
                notes: { type: 'string', description: 'Optional notes about the room' },
            },
            required: ['name'],
        },
    },
    {
        name: 'update_room',
        description: 'Update an existing room. Identify by current room name.',
        input_schema: {
            type: 'object' as const,
            properties: {
                roomName: { type: 'string', description: 'Current room name to identify' },
                name: { type: 'string', description: 'New name for the room (if renaming)' },
                roomType: { type: 'string', enum: ['nursery', 'veg', 'flower', 'dry', 'general'], description: 'New room type' },
                capacity: { type: 'number', description: 'New plant capacity' },
                squareFootage: { type: 'number', description: 'New square footage' },
                notes: { type: 'string', description: 'New notes' },
            },
            required: ['roomName'],
        },
    },
    {
        name: 'delete_room',
        description: 'Delete a room. Plants in the room will become unassigned.',
        input_schema: {
            type: 'object' as const,
            properties: {
                roomName: { type: 'string', description: 'Room name to delete' },
            },
            required: ['roomName'],
        },
    },
    // ── Tag Management ──
    {
        name: 'import_tags',
        description: 'Bulk import pre-issued tag numbers into the system pool.',
        input_schema: {
            type: 'object' as const,
            properties: {
                tagNumbers: { type: 'array', items: { type: 'string' }, description: 'Array of tag number strings' },
                tagType: { type: 'string', enum: ['plant', 'batch'], description: 'Tag type. Default plant.' },
            },
            required: ['tagNumbers'],
        },
    },
    {
        name: 'assign_tag',
        description: 'Assign a specific METRC tag to a plant, batch, or package.',
        input_schema: {
            type: 'object' as const,
            properties: {
                tagNumber: { type: 'string', description: 'The tag number to assign' },
                plantIdentifier: { type: 'string', description: 'Plant label or strain to identify the target (for plant/batch targets)' },
                roomName: { type: 'string', description: 'Room to narrow down the target plant (for plant/batch targets)' },
                packageLabel: { type: 'string', description: 'Package label to assign the tag to (for package targets, e.g. "PKG-BD-F001")' },
            },
            required: ['tagNumber'],
        },
    },
    {
        name: 'auto_assign_tags',
        description: 'Auto-assign tags from the available pool to untagged plants in a room/strain group.',
        input_schema: {
            type: 'object' as const,
            properties: {
                strain: { type: 'string', description: 'Strain name to filter by' },
                roomName: { type: 'string', description: 'Room to filter by' },
                count: { type: 'number', description: 'Number of tags to assign (defaults to all untagged in group)' },
            },
            required: [],
        },
    },
    // ── Package Inventory ──
    {
        name: 'create_packages',
        description: 'Create one or more packages from processed trim. Packages are the final saleable units (flower, trim, shake).',
        input_schema: {
            type: 'object' as const,
            properties: {
                packages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            label: { type: 'string', description: 'Package label/identifier (e.g. PKG-001)' },
                            packageType: { type: 'string', enum: ['flower', 'trim', 'shake', 'fresh_frozen', 'bubble_hash', 'rosin', 'rosin_cart'], description: 'Type of packaged product. Use fresh_frozen for frozen harvest allocations, bubble_hash/rosin/rosin_cart for extraction outputs.' },
                            strain: { type: 'string', description: 'Cannabis strain name' },
                            licenseNumber: { type: 'string', description: 'License number' },
                            quantity: { type: 'number', description: 'Package weight in grams' },
                            wasteWeight: { type: 'number', description: 'Waste weight in grams during packaging' },
                            location: { type: 'string', description: 'Storage location' },
                            notes: { type: 'string', description: 'Optional notes' },
                        },
                        required: ['label', 'packageType', 'strain', 'licenseNumber', 'quantity'],
                    },
                },
            },
            required: ['packages'],
        },
    },
    {
        name: 'update_package',
        description: 'Update a package status, location, lab testing state, or other fields.',
        input_schema: {
            type: 'object' as const,
            properties: {
                packageIdentifier: { type: 'string', description: 'Package label to identify which package to update' },
                status: { type: 'string', enum: ['active', 'on_hold', 'finished'], description: 'New status' },
                location: { type: 'string', description: 'New location' },
                labTestingState: { type: 'string', enum: ['not_submitted', 'submitted', 'passed', 'failed'], description: 'Lab testing status' },
                notes: { type: 'string', description: 'Updated notes' },
            },
            required: ['packageIdentifier'],
        },
    },
    {
        name: 'finish_package',
        description: 'Mark a package as finished (fully processed and ready for sale).',
        input_schema: {
            type: 'object' as const,
            properties: {
                packageIdentifier: { type: 'string', description: 'Package label to finish' },
            },
            required: ['packageIdentifier'],
        },
    },
    {
        name: 'delete_package',
        description: 'Delete a package from inventory.',
        input_schema: {
            type: 'object' as const,
            properties: {
                packageIdentifier: { type: 'string', description: 'Package label to delete' },
            },
            required: ['packageIdentifier'],
        },
    },
    // ── Extraction / Concentrate Production ──
    // ── UNIFIED `extraction_run` tool (PR #1 tool collapse) ──
    // Replaces the old start_extraction_run + record_extraction decision
    // tree with a single tool discriminated by `action`. The legacy tools
    // are kept below during a migration window so persisted chat history
    // still renders.
    {
        name: 'extraction_run',
        description: `Manage extraction runs across the full lifecycle. Single tool, discriminated by \`action\` — no more decision tree between start_extraction_run and record_extraction. Pick the action that matches the lifecycle stage the user is describing:

- **plan**: Create a run in status=planned (upcoming/planning column). Use for forward-looking language that explicitly schedules work: "tomorrow we're going to do a Toadstool wash", "schedule a live rosin run for Monday", "plan a BHO run next week". Set \`plannedStart\` to the ISO date if mentioned.
- **start**: Create a run in status=active and mark it started. Use for present-tense starting verbs: "start a wash for Toadstool OG", "kick off a live rosin run", "begin pressing the blackberry hash". This is the default when the user is actively initiating work.
- **amend_inputs**: Add or modify inputs on an EXISTING run (identified by runId or runIdentifier). Use when the user mentions additional strains or quantities for a run that was just created — especially across ambient transcript chunks. This is the primary mechanism for capturing multi-strain runs: if the user starts with 3 strains and then says "also add Blue Dream and Gelato", the second utterance calls amend_inputs against the existing run instead of creating a new one.
- **record_yield**: Add output details to an existing run. Use for past-tense yield reports: "the Toadstool wash got 800g of hash", "we pressed the blackberry, got 550g of rosin", "filled 200 carts from the rosin". Set outputPackageType + outputQuantity and reference the run via runId/runIdentifier.
- **cancel**: Cancel a planned or active run. Use for "cancel the Monday rosin run", "scratch that wash".

Vocabulary for resolving output types (applies when action=record_yield):
- "wash yielded", "hash came out", "bubble hash" → outputPackageType: bubble_hash
- "pressed", "got X of rosin" → outputPackageType: rosin
- "filled carts", "cart fill", "rosin carts" → outputPackageType: rosin_cart

The \`inputs[]\` field is an ARRAY for multi-source runs (e.g. multi-strain washes, terpene-infused distillate with both cannabis and botanical inputs). **Include one entry per DISTINCT source package** — never list the same package twice, and never split a single package into multiple entries. If you want to use all of a package, set quantity to the package's full quantity.

**Resolving source packages**: when you already know which specific packages to use (e.g. you just called find_packages and saw the results), pass each package's \`id\` as \`sourcePackageId\` on the matching input entry. This removes ambiguity when multiple packages share the same (strain, packageType) — for example, five different Wi Fi OG fresh frozen packages in the freezer. Without sourcePackageId, the system has to guess which package each input refers to based on (strain, packageType, quantity), which fails when quantities alone don't disambiguate. **If in doubt, call find_packages first to get the IDs, then pass them through on the extraction_run call.**

For plan/start actions this is the initial input set; for amend_inputs it's the inputs to ADD to the existing run.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['plan', 'start', 'amend_inputs', 'record_yield', 'cancel'],
                    description: 'Which lifecycle operation to perform. See tool description for the decision rules.',
                },

                // Identification for amend_inputs / record_yield / cancel
                runId: {
                    type: 'string',
                    description: 'ID of an existing run from the Extraction runs in progress context. Required for amend_inputs, record_yield, cancel when the run is already known.',
                },
                runIdentifier: {
                    type: 'string',
                    description: 'Fuzzy identifier (strain + template) for resolving an existing run when runId is not known — e.g. "the Toadstool wash".',
                },

                // Template + strain (plan/start)
                templateIdentifier: {
                    type: 'string',
                    description: 'For plan/start: template name, process type, or target product keyword. The system matches against the Extraction templates in context.',
                },
                strain: {
                    type: 'string',
                    description: 'Primary cannabis strain for the run. For multi-strain runs, use the dominant strain here and list the rest in inputs[].',
                },

                // Inputs (plan/start/amend_inputs)
                inputs: {
                    type: 'array',
                    description: 'Input materials. One entry per DISTINCT source package. For plan/start this is the initial input set; for amend_inputs these inputs are ADDED to the existing run. Prefer passing sourcePackageId when you know it (e.g. from a prior find_packages call).',
                    items: {
                        type: 'object',
                        properties: {
                            sourcePackageId: {
                                type: 'string',
                                description: 'Canonical: the package ID from find_packages. When set, the backend uses this package directly without any fuzzy matching. This is the reliable way to disambiguate when multiple packages share the same (strain, packageType).',
                            },
                            sourcePackageLabel: {
                                type: 'string',
                                description: 'Optional: the package label (e.g. "WFOG-FF-2026-03-10") if you know it but not the ID. Backend falls back to label matching when sourcePackageId is absent.',
                            },
                            packageType: {
                                type: 'string',
                                description: 'Product type name from the Available product types catalog (e.g. fresh_frozen, bubble_hash, distillate, terpenes_botanical). Required when sourcePackageId is not provided.',
                            },
                            strain: {
                                type: 'string',
                                description: 'Strain of this specific input. May be null for non-cannabis additives. Required when sourcePackageId is not provided.',
                            },
                            quantity: {
                                type: 'number',
                                description: 'Quantity to consume in the catalog default unit (g for biomass, ml for terpenes, each for carts). Omit to consume the full source package.',
                            },
                            unit: {
                                type: 'string',
                                description: 'Optional unit override (g, ml, each, trays). Defaults to catalog default_unit.',
                            },
                        },
                    },
                },

                // Record-yield specific
                outputPackageType: {
                    type: 'string',
                    description: 'For record_yield: type of output product created (e.g. bubble_hash, rosin, rosin_cart).',
                },
                outputQuantity: {
                    type: 'number',
                    description: 'For record_yield: grams (or count for carts) of output produced.',
                },
                outputLabel: {
                    type: 'string',
                    description: 'For record_yield: optional label for the output package. Auto-generated if omitted.',
                },
                licenseNumber: {
                    type: 'string',
                    description: 'License number. Inherited from source package if not specified.',
                },
                wasteWeight: {
                    type: 'number',
                    description: 'For record_yield: waste produced during this step, in grams.',
                },

                // Plan-specific
                plannedStart: {
                    type: 'string',
                    description: 'For plan action: ISO timestamp when the run is scheduled to start.',
                },

                // Shared optional
                targetProduct: {
                    type: 'string',
                    description: 'Optional target product (e.g. live_rosin, distillate_cart).',
                },
                runName: {
                    type: 'string',
                    description: 'Optional custom run name. Auto-generated as "{strain} - {template} - {date}" if omitted.',
                },
                notes: {
                    type: 'string',
                    description: 'Optional notes.',
                },
            },
            required: ['action'],
        },
    },
    // ── LEGACY extraction tools (kept during migration window) ──
    {
        name: 'record_extraction',
        description: `LEGACY: use \`extraction_run\` with action=record_yield instead. Record an extraction/processing step. This handles all stages of concentrate production:
- Fresh Frozen → Wash → Bubble Hash (ice water extraction)
- Bubble Hash → Press → Rosin (heat/pressure extraction)
- Rosin → Cart Fill → Rosin Carts

The user reports what they started with and what they got out. The system will:
1. Find the source package and reduce its quantity by the input amount
2. Create a new output package at the next stage
3. Log the extraction event with yield percentage

Examples:
- "I pulled 17,000 grams of blackberry from the freezer for a wash" → input: fresh_frozen 17000g, output: bubble_hash (pending)
- "The wash yielded 800g of bubble hash from 17K blackberry" → input: fresh_frozen 17000g, output: bubble_hash 800g
- "Pressed the blackberry hash, got 550g of rosin" → input: bubble_hash, output: rosin 550g
- "Filled 200 rosin carts from the blackberry rosin" → input: rosin, output: rosin_cart 200`,
        input_schema: {
            type: 'object' as const,
            properties: {
                strain: { type: 'string', description: 'Cannabis strain being processed' },
                inputPackageType: {
                    type: 'string',
                    description: 'Type of the source/input material being consumed. Must be a product type name from the "Available product types" context (e.g. fresh_frozen, bubble_hash, rosin, distillate, terpenes_botanical). The system fuzzy-matches against the catalog so approximate names work.',
                },
                inputQuantity: {
                    type: 'number',
                    description: 'Quantity of input material consumed in the catalog unit (grams for biomass/intermediate, ml for terpenes, each for carts). If not stated, assume the full source package quantity.',
                },
                outputPackageType: {
                    type: 'string',
                    description: 'Type of output product created. Must be a product type name from the "Available product types" context (e.g. bubble_hash, rosin, distillate_infused, live_rosin_cart).',
                },
                outputQuantity: {
                    type: 'number',
                    description: 'Grams (or count for carts) of output produced. Omit if extraction is still in progress and yield is unknown.',
                },
                outputLabel: {
                    type: 'string',
                    description: 'Optional label for the output package. Auto-generated if omitted.',
                },
                licenseNumber: {
                    type: 'string',
                    description: 'License number. Inherited from source package if not specified.',
                },
                wasteWeight: {
                    type: 'number',
                    description: 'Waste produced during this extraction step, in grams.',
                },
                notes: {
                    type: 'string',
                    description: 'Process notes (e.g. micron size, press temperature, bag type).',
                },
            },
            required: ['strain', 'inputPackageType', 'outputPackageType'],
        },
    },
    {
        name: 'start_extraction_run',
        description: `LEGACY: use \`extraction_run\` with action=plan or action=start instead. Create a planned or active extraction run in the runs workspace. Use this when the user says things like "start a live rosin run for Toadstool OG", "kick off a wash with 2500g of blackberry fresh frozen", "start a terpene infusion run with 50g of distillate and 10ml of orange terpenes", or "schedule a BHO run for Monday". This creates a full run entry with step-by-step workflow (visible in the Extraction → Runs view), distinct from record_extraction which only logs a single consumption event.

When to use this vs record_extraction:
- **start_extraction_run**: Forward-looking. The user is beginning or scheduling work. Output/yield is unknown. Creates a row in extraction_runs with step checkoff UI.
- **record_extraction**: Retrospective. The user is reporting what already happened ("we got 800g of hash from the blackberry wash"). Logs a single event to extraction_logs.

The tool resolves templateIdentifier against the Extraction templates in context — match by name, process type (solventless/bho/distillate), or target product. If the user says "live rosin" pick a solventless template; "shatter" or "BHO" → bho; "distillate" → distillate. Prefer templates whose accepted_inputs include the user's input materials.

**Multi-source runs:** The \`inputs\` field is an ARRAY. Most runs have a single input (length 1). Some runs combine multiple materials — e.g. terpene infusion takes a distillate package AND a terpene package. Include one entry per input material mentioned by the user.

Default startImmediately=true (user said "start") which sets status=active. Use false only if they explicitly schedule for later ("schedule", "plan for Monday").`,
        input_schema: {
            type: 'object' as const,
            properties: {
                templateIdentifier: {
                    type: 'string',
                    description: 'Template name, process type, or target product keyword. The system will match against the Extraction templates in context.',
                },
                strain: {
                    type: 'string',
                    description: 'Primary cannabis strain for the run (used to name the run and inherit compliance license). For multi-strain runs, use the dominant/cannabis strain here and list other strains in the inputs[] array.',
                },
                inputs: {
                    type: 'array',
                    description: 'Input materials the run will consume. Usually length 1 (single source biomass). For multi-source runs (e.g. terpene-infused distillate = distillate package + terpene additive), include one entry per material. Omit entirely if the run has no specific source package yet — the run can be created bare and sources linked later.',
                    items: {
                        type: 'object',
                        properties: {
                            packageType: {
                                type: 'string',
                                description: 'Product type name from the "Available product types" catalog in context (e.g. fresh_frozen, distillate, terpenes_botanical, bubble_hash). System fuzzy-matches against the catalog.',
                            },
                            strain: {
                                type: 'string',
                                description: 'Strain of this specific input material. May be null for non-cannabis additives (botanical terpenes, etc.).',
                            },
                            quantity: {
                                type: 'number',
                                description: 'Quantity of this input to consume, in the catalog default unit (g for biomass, ml for terpenes, each for carts). Omit to consume the full source package.',
                            },
                            unit: {
                                type: 'string',
                                description: 'Optional unit override if the user explicitly specifies one (g, ml, each, trays). Defaults to the catalog default_unit for this packageType.',
                            },
                        },
                        required: ['packageType'],
                    },
                },
                targetProduct: {
                    type: 'string',
                    description: 'Optional product variant the run is targeting (from the catalog — e.g. live_rosin, distillate_cart, distillate_infused). Can be set later.',
                },
                runName: {
                    type: 'string',
                    description: 'Optional custom run name. If omitted, auto-generated as "{strain} - {template} - {date}".',
                },
                plannedStart: {
                    type: 'string',
                    description: 'Optional ISO timestamp for scheduled runs. Omit if starting now.',
                },
                startImmediately: {
                    type: 'boolean',
                    description: 'If true (default), create the run with status=active and set started_at=now. If false, create as status=planned for future scheduling.',
                },
                notes: {
                    type: 'string',
                    description: 'Optional notes for the run.',
                },
            },
            required: ['templateIdentifier'],
        },
    },
];

interface AIParseRequest {
    message?: string;
    csvData?: string;
    transcriptChunks?: string[];
    history?: Array<{ role: string; content: string }>;
    recentTranscriptHistory?: string[];
    // PR #3: opt-in to streaming responses. When true, the handler returns
    // an application/x-ndjson body where each line is a JSON object —
    // {type: "text_delta", text: "..."} lines stream the agent's text
    // output as it's generated, followed by a final
    // {type: "done", actions: [...], toolResults: [...], message: "..."}
    // line when the agent loop completes. When false/undefined, the
    // handler returns the usual application/json body with the full
    // payload once the loop finishes.
    streaming?: boolean;
    context: {
        hasActiveSession: boolean;
        sessionId?: string;
        trimmerProfiles: Array<{ id: string; name: string }>;
        existingEntries: Array<{ id: string; harvestName: string; strain: string; status: string; trimmers?: Array<{ id: string; name: string; startTime: string; endTime?: string; tool?: string }> }>;
        harvests?: Array<{ id: string; batchId: string; strain: string; status: string }>;
        humanTasks?: Array<{ id: string; title: string; status: string; priority: string; category: string; assignee?: string; location?: string }>;
        plantMapSummary?: Array<{ roomName: string; roomId: string; strains: string[]; plantIds: string[]; entityType: 'plants' | 'plantbatches'; plantHealth: number; contaminants: string[] }>;
        screenContext?: string;
    };
}

interface ProposedAction {
    type: string;
    data: Record<string, any>;
}

// PR #3: wrapped with Netlify's stream() helper so the returned body can
// be a live ReadableStream (for the streaming branch). Non-streaming
// requests still return a static JSON body as before — stream() accepts
// both string and stream bodies.
export const handler: Handler = stream(async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const authContext = await resolveContext(event.headers.authorization) as
            { userId: string; companyId: string; role: string; departments?: string[] } | null;
        if (!authContext) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // Route to different models based on user role.
        // Technicians always get Haiku; everyone else defaults to Sonnet.
        // The Haiku downgrade for "simple lookups" happens below AFTER the
        // request body is parsed (need the raw user text to run the
        // heuristic).
        let model = authContext.role === 'technician'
            ? 'claude-haiku-4-5-20251001'
            : 'claude-sonnet-4-20250514';

        // Build department context for the system prompt
        const deptContext = authContext.role === 'admin' || authContext.role === 'director'
            ? 'You are assisting a user with full access to all departments.'
            : `You are assisting a ${authContext.role === 'department_manager' ? 'department manager' : 'technician'} with access to: ${authContext.departments?.join(', ') || 'all departments'}.`;

        // Rate limit: 60 requests per company per 60 seconds
        const rateLimit = await checkRateLimit(authContext.companyId, 'ai-parse', 60, 60);
        if (!rateLimit.allowed) {
            return {
                statusCode: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(rateLimit.retryAfterSeconds || 60),
                },
                body: JSON.stringify({ error: 'Rate limit exceeded. Please try again shortly.' }),
            };
        }

        const request: AIParseRequest = JSON.parse(event.body || '{}');

        if (!request.message && !request.csvData && !request.transcriptChunks?.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Either message, csvData, or transcriptChunks is required' }) };
        }

        // ── Haiku routing: simple-lookup heuristic (PR #2 latency fix) ──
        // Downgrade to Haiku for the whole request when the raw user input
        // is BOTH short AND free of mutation verbs. The bar is deliberately
        // conservative — we'd rather pay Sonnet latency on a borderline
        // request than risk a bad mutation proposal from Haiku.
        //
        //   - length <= HAIKU_MAX_CHARS (short enough to be a direct question)
        //   - no mutation verb anywhere in the text
        //
        // CSV imports are never downgraded (structured data parsing is
        // Sonnet's job). Technicians already use Haiku so this is a no-op
        // for them.
        const HAIKU_MAX_CHARS = 200;
        const MUTATION_VERBS = [
            'start', 'begin', "kick\\s*off", "let'?s", "we'?re going", 'we are going',
            'create', 'add', 'update', 'record', 'log', 'flag', 'assign',
            'move', 'transfer', 'delete', 'remove', 'finish', 'submit', 'cancel',
            'schedule', 'plan', 'destroy', 'harvest', 'cut', 'pull', 'press', 'wash',
            'save', 'make', 'set\\s*up', 'remind', 'mark', 'need to', 'should', 'have to',
        ];
        const MUTATION_VERB_PATTERN = new RegExp(
            '\\b(?:' + MUTATION_VERBS.join('|') + ')\\b',
            'i'
        );
        const rawUserInput = request.transcriptChunks?.length
            ? request.transcriptChunks.join(' ')
            : (request.message || '');
        const isSimpleLookup =
            !request.csvData &&
            rawUserInput.length > 0 &&
            rawUserInput.length <= HAIKU_MAX_CHARS &&
            !MUTATION_VERB_PATTERN.test(rawUserInput);
        if (isSimpleLookup && model !== 'claude-haiku-4-5-20251001') {
            model = 'claude-haiku-4-5-20251001';
            console.log(`[ai-parse model] downgraded to Haiku for simple lookup (${rawUserInput.length} chars)`);
        }

        // Build user message with context
        let userMessage = '';

        if (request.transcriptChunks?.length) {
            const fullTranscript = request.transcriptChunks.join('\n');
            let transcriptPrompt = `Analyze this voice transcript of someone describing their cannabis operations. Extract ALL actionable items — these might include creating sessions, adding batches, assigning trimmers, creating harvests, recording weights, moving harvests, recording extractions, updating extraction quantities, correcting mistakes, updating packages, or any other trackable operation. Be thorough — capture every actionable item mentioned, even if briefly.

IMPORTANT: If the user is correcting or updating a previous statement (e.g. "actually the input was 20,000 grams", "sorry I misspoke, the yield was 2,340"), treat it as an actionable update. Use the record_extraction tool with the corrected values — it will update the existing extraction card. Also handle follow-up statements like "and the yield is 2,340 grams" as part of the most recent extraction context.`;

            if (request.recentTranscriptHistory?.length) {
                transcriptPrompt += `\n\nRecent transcript history (previous chunks from this session, for context — the user may be continuing or correcting these):\n${request.recentTranscriptHistory.map((t, i) => `  [${i + 1}] "${t}"`).join('\n')}`;
            }

            transcriptPrompt += `\n\nCurrent transcript to analyze:\n"${fullTranscript}"`;
            userMessage = transcriptPrompt;
        } else if (request.csvData) {
            userMessage = `Parse this CSV data into batch entries for the trim tracker. Map the columns to harvest name, strain, license number, and start weight fields. Here is the CSV data:\n\n${request.csvData}`;
        } else {
            userMessage = request.message!;
        }

        // Look up current user's name
        let userName = 'Unknown';
        try {
            const { rows } = await sql`SELECT name FROM users WHERE id = ${authContext.userId}`;
            if (rows.length > 0 && rows[0].name) userName = rows[0].name;
        } catch { /* proceed without name */ }

        // Add context about current state
        const today = new Date().toISOString().slice(0, 10);
        const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const contextInfo = [
            `\n\nCurrent application state:`,
            `- Today's date: ${today} (${dayOfWeek})`,
            `- Current user: ${userName}`,
        ];

        if (request.context.screenContext) {
            contextInfo.push(`- **User is currently viewing: ${request.context.screenContext}** (use this to interpret their intent)`);
        }

        contextInfo.push(`- Active session: ${request.context.hasActiveSession ? 'Yes (ID: ' + request.context.sessionId + ')' : 'No active session'}`);

        if (request.context.trimmerProfiles.length > 0) {
            contextInfo.push(`- Trimmer roster: ${request.context.trimmerProfiles.map(p => `${p.name} (ID: ${p.id})`).join(', ')}`);
        } else {
            contextInfo.push(`- Trimmer roster: Empty`);
        }

        if (request.context.existingEntries.length > 0) {
            contextInfo.push(`- Current batches: ${request.context.existingEntries.map(e => {
                const trimmerInfo = e.trimmers?.length
                    ? ` — trimmers: ${e.trimmers.map(t => `${t.name} (ID: ${t.id}, ${t.startTime}${t.endTime ? '-' + t.endTime : ''}, ${t.tool || 'scissors'})`).join(', ')}`
                    : '';
                return `"${e.harvestName}" / ${e.strain} [${e.status}] (ID: ${e.id})${trimmerInfo}`;
            }).join('; ')}`);
        }

        // Harvests summary — bin counts kept inline, full bins listing
        // stripped (PR #2). Use the find_bins tool to look up bin details.
        if (request.context.harvests && request.context.harvests.length > 0) {
            contextInfo.push(`- Harvests: ${request.context.harvests.map(h => `"${h.batchId}" / ${h.strain} [${h.status}]${h.bins?.length ? ` (${h.bins.length} bins)` : ''} (ID: ${h.id})`).join(', ')}`);
        } else {
            contextInfo.push(`- Harvests: None`);
        }

        // Human tasks full list STRIPPED (PR #2). Call find_human_tasks
        // when the user references a task by title or needs a scan of
        // pending work. The update/delete dispatcher cases fall back to a
        // DB fuzzy lookup via resolveHumanTaskRef.

        // Plant map summary STRIPPED (PR #2). Call find_plants to resolve
        // fuzzy plant references to concrete IDs before calling the
        // plants tool.

        if ((request.context as any).activeLicenseNumber) {
            contextInfo.push(`- Active license number: ${(request.context as any).activeLicenseNumber} (use this automatically for any new batches, harvests, extractions, and packages unless the user specifies a different one)`);
        }

        // Recent extraction logs STRIPPED (PR #2). Call find_extraction_logs
        // for historical yield lookups. In-flight runs still pushed below.

        // Add extraction process templates so the AI can resolve "start a live rosin run" → templateId
        try {
            const { rows: tmplRows } = await sql`
                SELECT id, name, process_type, accepted_inputs
                FROM process_templates
                WHERE company_id = ${authContext.companyId} AND domain = 'extraction' AND is_active = true
                ORDER BY name
            `;
            if (tmplRows.length > 0) {
                contextInfo.push(`- Extraction templates: ${tmplRows.map(t => {
                    const inputs = Array.isArray(t.accepted_inputs) ? (t.accepted_inputs as string[]).join('|') : '';
                    return `"${t.name}" [${t.process_type}] accepts=${inputs || 'any'} (ID: ${t.id})`;
                }).join('; ')}`);
            }
        } catch { /* proceed without template context */ }

        // Add extraction equipment catalog so the AI can reference equipment in responses
        try {
            const { rows: equipRows } = await sql`
                SELECT name, equipment_type, capacity_grams, status
                FROM extraction_equipment
                WHERE company_id = ${authContext.companyId} AND status = 'available'
                ORDER BY equipment_type, name
            `;
            if (equipRows.length > 0) {
                contextInfo.push(`- Extraction equipment: ${equipRows.map(e =>
                    `"${e.name}" [${e.equipment_type}]${e.capacity_grams ? ' ' + e.capacity_grams + 'g cap' : ''}`
                ).join('; ')}`);
            }
        } catch { /* proceed without equipment context */ }

        // Add active extraction runs so AI knows what's already in flight
        try {
            const { rows: runRows } = await sql`
                SELECT id, name, strain, status, input_material, target_product
                FROM extraction_runs
                WHERE company_id = ${authContext.companyId} AND status IN ('planned', 'active')
                ORDER BY created_at DESC LIMIT 10
            `;
            if (runRows.length > 0) {
                contextInfo.push(`- Extraction runs in progress: ${runRows.map(r => `"${r.name}" ${r.strain || ''} [${r.status}]${r.input_material ? ' ' + r.input_material : ''}${r.target_product ? ' → ' + r.target_product : ''} (ID: ${r.id})`).join('; ')}`);
            }
        } catch { /* proceed without run context */ }

        // Packages full listing STRIPPED (PR #2). Call find_packages to
        // look up inventory, find specific labels, or scope mutations to
        // a subset. Compact counts are included in the inventory summary
        // below.

        // Compact inventory counts — gives the model a sense of how much
        // is "out there" without pushing full lists. Individual lookups
        // go through find_* tools.
        try {
            const [{ rows: pkgCountRows }, { rows: taskCountRows }, { rows: plantCountRows }, { rows: batchCountRows }] = await Promise.all([
                sql`SELECT COUNT(*)::int AS n FROM packages WHERE company_id = ${authContext.companyId} AND status = 'active'`,
                sql`SELECT COUNT(*)::int AS n FROM human_tasks WHERE company_id = ${authContext.companyId} AND status != 'completed'`,
                sql`SELECT COUNT(*)::int AS n FROM plants WHERE company_id = ${authContext.companyId} AND growth_phase IN ('vegetative', 'flowering')`,
                sql`SELECT COUNT(*)::int AS n FROM plant_batches WHERE company_id = ${authContext.companyId}`,
            ]);
            const pkgCount = pkgCountRows[0]?.n || 0;
            const taskCount = taskCountRows[0]?.n || 0;
            const plantCount = plantCountRows[0]?.n || 0;
            const batchCount = batchCountRows[0]?.n || 0;
            contextInfo.push(`- Inventory counts: ${pkgCount} active packages, ${taskCount} open human tasks, ${plantCount} tracked plants, ${batchCount} plant batches`);
            contextInfo.push(`- For specific lookups, call the find_* tools (find_packages, find_human_tasks, find_plants, find_bins, find_extraction_logs). Do NOT guess at IDs or labels.`);
        } catch { /* proceed without counts */ }

        // Add strains, licenses, and rooms for resolution
        try {
            const { rows: strainRows } = await sql`SELECT id, name FROM strains WHERE company_id = ${authContext.companyId} ORDER BY name`;
            if (strainRows.length > 0) {
                contextInfo.push(`- Available strains: ${strainRows.map(s => `${s.name} (ID: ${s.id})`).join(', ')}`);
            }
            const { rows: licenseRows } = await sql`SELECT id, license_number, label FROM licenses WHERE company_id = ${authContext.companyId} ORDER BY license_number`;
            if (licenseRows.length > 0) {
                contextInfo.push(`- Available licenses: ${licenseRows.map(l => `${l.license_number}${l.label ? ' "' + l.label + '"' : ''} (ID: ${l.id})`).join(', ')}`);
            }
            const { rows: roomRows } = await sql`SELECT id, name, room_type FROM rooms WHERE company_id = ${authContext.companyId} ORDER BY name`;
            if (roomRows.length > 0) {
                contextInfo.push(`- Available rooms: ${roomRows.map(r => `${r.name} [${r.room_type}] (ID: ${r.id})`).join(', ')}`);
            }
        } catch { /* proceed without extra context */ }

        // Add product type catalog (P0 — open package type universe)
        // In ambient mode we send a compact form to minimize tokens per call.
        try {
            const { rows: typeRows } = await sql`
                SELECT name, display_name, category, default_unit, is_cannabis
                FROM product_types
                WHERE company_id = ${authContext.companyId} AND is_active = true
                ORDER BY sort_order ASC, name ASC
            `;
            if (typeRows.length > 0) {
                const isAmbient = (request.transcriptChunks?.length || 0) > 0;
                const formatted = isAmbient
                    ? typeRows.map(t => t.name).join(', ')
                    : typeRows.map(t => `${t.name} [${t.category}${t.is_cannabis ? '' : ', non-cannabis'}, ${t.default_unit}]`).join(', ');
                contextInfo.push(`- Available product types (for package_type, inputs[].packageType, outputPackageType): ${formatted}`);
            }
        } catch { /* proceed without catalog context */ }

        userMessage += contextInfo.join('\n');

        const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('CLAUDE_API_KEY / ANTHROPIC_API_KEY not set');
            return { statusCode: 500, body: JSON.stringify({ error: 'AI service not configured' }) };
        }

        // Build multi-turn messages from history, or single message.
        // Content can be either a string (plain user/assistant turn) or an
        // array of content blocks (for assistant turns from the loop that
        // include tool_use blocks, and for user turns that carry tool_result
        // blocks back to the model).
        type AnthropicContentBlock = Record<string, unknown>;
        type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] };
        let messages: AnthropicMessage[];
        if (request.history && request.history.length > 1) {
            // Use history but replace the last user message with context-enriched version
            messages = request.history.slice(0, -1).map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }));
            messages.push({ role: 'user', content: userMessage });
        } else {
            messages = [{ role: 'user', content: userMessage }];
        }

        // Prompt caching — the static SYSTEM_PROMPT (~160 lines) and the entire
        // `tools` array (~900 lines) are identical across calls. Marking them
        // with cache_control makes Anthropic cache the prefix and charge ~10%
        // of the normal input cost on subsequent calls with the same prefix.
        // This is especially high-leverage for ambient mode, which invokes
        // ai-parse repeatedly as transcript chunks flush.
        //
        // Cache-key ordering:
        //   1. system[0] = SYSTEM_PROMPT (static, cached)
        //   2. system[1] = deptContext (dynamic per-role, NOT cached)
        //   3. tools[0..N-1] + tools[N] with cache_control (cached prefix)
        //   4. messages (never cached)
        //
        // Dynamic context lives in the user message (appended to `userMessage`
        // above via contextInfo.push), so it sits in `messages` and correctly
        // stays out of the cache.
        const cachedTools = tools.length > 0
            ? [
                ...tools.slice(0, -1),
                { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' as const } },
            ]
            : tools;

        // ── Multi-turn agent loop (PR #2) ──
        // Instead of a single-shot fetch, run up to MAX_AGENT_TURNS iterations
        // with Claude's tool_use → tool_result → reason pattern. Read-only
        // find_* tools run server-side (via runLookup) and feed their
        // results back into the next turn. Mutation tools push ProposedActions
        // AND emit a stub tool_result so the agent knows the mutation was
        // queued and can continue reasoning (e.g. propose a follow-up task
        // after proposing a plant action).
        //
        // Cap at 6 turns — typical flows terminate in 1-3. Runaway loops
        // get truncated with a console warning and whatever actions have
        // been collected so far.
        const MAX_AGENT_TURNS = 6;
        const actions: ProposedAction[] = [];
        let assistantMessage = '';
        // tool_result blocks collected during the current turn's block
        // iteration, appended as the next user message if we decide to
        // loop again. Declared here because both the read-only router and
        // the mutation post-dispatch step push into it.
        let toolResultsThisTurn: AnthropicContentBlock[] = [];

        // PR #2 card surfacing: accumulated find_* results across ALL turns
        // of the agent loop. Included in the response body so the frontend
        // can render interactive result cards (PackagesResultCard, etc.)
        // instead of parsing the agent's narrative text. One entry per
        // find_* tool_use block.
        interface AiParseToolResult {
            tool: string;           // find_packages, find_plants, etc.
            toolUseId: string;      // matches the tool_use block id
            query: Record<string, unknown>;
            data: unknown;          // parsed result payload from runLookup
            isError: boolean;
        }
        const toolResults: AiParseToolResult[] = [];

        // ── Shared helper: resolve an extraction run input set ──
        // Used by both the legacy `start_extraction_run` case and the new
        // unified `extraction_run` case (for actions plan/start). Loads the
        // product catalog and extraction templates, resolves each input's
        // packageType via fuzzy match, looks up source packages, picks a
        // matching template, and auto-generates a run name. Returns the
        // full ProposedAction.data payload the frontend expects for
        // start_extraction_run actions.
        type RunInputItem = {
            packageType?: string;
            strain?: string | null;
            quantity?: number;
            unit?: string;
            // PR #2 fix: disambiguation fields. When sourcePackageId is set,
            // the helper uses it directly instead of fuzzy-matching on (strain,
            // packageType). Fixes the case where multiple packages share the
            // same strain + type (e.g. five Wi Fi OG fresh frozen packages).
            sourcePackageId?: string;
            sourcePackageLabel?: string;
        };
        /**
         * Infer a concrete product type (distillate, rosin, bubble_hash, etc.)
         * from a matched template's name or process_type. Used as a fallback
         * when the agent omits `targetProduct` on start_extraction_run so the
         * action preview card can render a real chip instead of a blank target.
         * Keep the keyword list aligned with the TypeChip map in
         * `src/components/ActionPreview.tsx`.
         */
        function inferTargetProduct(tmplName: string | null | undefined, processType: string | null | undefined): string | null {
            const haystack = `${tmplName || ''} ${processType || ''}`.toLowerCase();
            if (!haystack.trim()) return null;
            // Order matters: check compound types before their substrings
            // ("rosin cart" before "rosin", "live resin" before "resin").
            const candidates: Array<[string, RegExp]> = [
                ['rosin_cart', /rosin\s*cart|rosin-cart/],
                ['live_rosin', /live\s*rosin/],
                ['live_resin', /live\s*resin/],
                ['bubble_hash', /bubble\s*hash|ice\s*water\s*hash/],
                ['distillate', /distillate|isolate/],
                ['rosin', /\brosin\b/],
                ['cart', /\bcart\b|cartridge/],
                ['vape', /\bvape\b/],
                ['shake', /\bshake\b/],
            ];
            for (const [type, pattern] of candidates) {
                if (pattern.test(haystack)) return type;
            }
            // process_type is sometimes already concrete ("distillate"); fall
            // back to it verbatim only if it matches a known chip key.
            const known = new Set(['flower', 'trim', 'shake', 'fresh_frozen', 'bubble_hash', 'rosin', 'live_rosin', 'live_resin', 'distillate', 'cart', 'rosin_cart', 'vape']);
            if (processType && known.has(processType)) return processType;
            return null;
        }

        async function buildStartExtractionRunData(runInput: {
            inputs?: RunInputItem[];
            templateIdentifier?: string;
            strain?: string | null;
            targetProduct?: string | null;
            runName?: string | null;
            plannedStart?: string | null;
            startImmediately?: boolean;
            notes?: string | null;
        }): Promise<Record<string, unknown>> {
            type TmplRow = { id: string; name: string; process_type: string | null; accepted_inputs: string[] | null };
            type PkgRow = { id: string; label: string; quantity: string; package_type: string; strain: string | null };
            type CatalogRow = { name: string; display_name: string; category: string; default_unit: string; is_cannabis: boolean };

            const runInputs: RunInputItem[] = Array.isArray(runInput.inputs) ? runInput.inputs : [];

            const [tmplResult, catalogResult] = await Promise.all([
                sql`
                    SELECT id, name, process_type, accepted_inputs
                    FROM process_templates
                    WHERE company_id = ${authContext.companyId} AND domain = 'extraction' AND is_active = true
                `,
                sql`
                    SELECT name, display_name, category, default_unit, is_cannabis
                    FROM product_types
                    WHERE company_id = ${authContext.companyId} AND is_active = true
                `,
            ]);
            const tmplRows = tmplResult.rows as TmplRow[];
            const catalog = catalogResult.rows as CatalogRow[];

            // Fuzzy match catalog names: exact → substring → word-overlap.
            // Full Levenshtein/phonetic matcher lands later; this is the stopgap.
            const resolveCatalogName = (raw: string | undefined | null): CatalogRow | null => {
                if (!raw) return null;
                const needle = String(raw).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                if (!needle) return null;
                const exact = catalog.find(c => c.name === needle);
                if (exact) return exact;
                const sub = catalog.find(c => c.name.includes(needle) || needle.includes(c.name));
                if (sub) return sub;
                const needleTokens = needle.split('_').filter(t => t.length >= 3);
                for (const c of catalog) {
                    const catTokens = c.name.split('_');
                    if (needleTokens.some(t => catTokens.includes(t))) return c;
                }
                return null;
            };

            type ResolvedInput = {
                requestedPackageType: string;
                resolvedPackageType: string | null;
                resolvedDisplayName: string | null;
                unit: string;
                isCannabis: boolean | null;
                strain: string | null;
                quantity: number | null;
                sourcePackageId: string | null;
                sourcePackageLabel: string | null;
            };

            // ── Source package resolution (PR #2 fix) ──
            // Three strategies, tried in order per input:
            //   1. If the agent provided sourcePackageId (from a prior
            //      find_packages call), look it up directly. Authoritative.
            //   2. If the agent provided sourcePackageLabel, look up by label.
            //   3. Otherwise, fetch ALL candidate packages for (strain,
            //      packageType), then disambiguate within this batch by
            //      quantity match, consuming each row at most once.
            //
            // This replaces the old single-query `LIMIT 1` which collapsed
            // N same-strain inputs onto the same source package.
            const consumedPackageIds = new Set<string>();
            const claimPkg = (pkg: PkgRow | null): PkgRow | null => {
                if (!pkg) return null;
                if (consumedPackageIds.has(pkg.id)) return null;
                consumedPackageIds.add(pkg.id);
                return pkg;
            };

            const resolved: ResolvedInput[] = [];
            for (const ri of runInputs) {
                const catalogEntry = resolveCatalogName(ri.packageType);
                const typeName = catalogEntry?.name || ri.packageType || null;
                const strainForInput = ri.strain ?? runInput.strain ?? null;

                let srcPkg: PkgRow | null = null;

                // Strategy 1: explicit sourcePackageId from the agent.
                if (ri.sourcePackageId) {
                    const { rows } = await sql`
                        SELECT id, label, quantity, package_type, strain
                        FROM packages
                        WHERE id = ${ri.sourcePackageId}
                          AND company_id = ${authContext.companyId}
                          AND status = 'active'
                        LIMIT 1
                    `;
                    srcPkg = claimPkg((rows[0] as PkgRow) || null);
                }

                // Strategy 2: explicit sourcePackageLabel from the agent.
                if (!srcPkg && ri.sourcePackageLabel) {
                    const { rows } = await sql`
                        SELECT id, label, quantity, package_type, strain
                        FROM packages
                        WHERE company_id = ${authContext.companyId}
                          AND LOWER(label) = LOWER(${ri.sourcePackageLabel})
                          AND status = 'active'
                        LIMIT 1
                    `;
                    srcPkg = claimPkg((rows[0] as PkgRow) || null);
                }

                // Strategy 3: fuzzy (strain, packageType) + quantity match.
                // Fetch all candidates instead of LIMIT 1 so we can pick the
                // right one when there are multiple packages with the same
                // (strain, type) but different quantities.
                if (!srcPkg && typeName && strainForInput) {
                    const { rows } = await sql`
                        SELECT id, label, quantity, package_type, strain
                        FROM packages
                        WHERE company_id = ${authContext.companyId}
                          AND package_type = ${typeName}
                          AND LOWER(strain) = LOWER(${strainForInput})
                          AND status = 'active'
                        ORDER BY created_at DESC
                    `;
                    const candidates = (rows as PkgRow[]).filter(p => !consumedPackageIds.has(p.id));
                    if (candidates.length === 1) {
                        srcPkg = claimPkg(candidates[0]);
                    } else if (candidates.length > 1) {
                        // Prefer a quantity match when the agent specified a quantity.
                        // Exact match first, then nearest.
                        if (typeof ri.quantity === 'number' && ri.quantity > 0) {
                            const target = ri.quantity;
                            const exact = candidates.find(p => Math.abs(parseFloat(p.quantity) - target) < 0.01);
                            if (exact) {
                                srcPkg = claimPkg(exact);
                            } else {
                                // Nearest by absolute difference.
                                const sorted = [...candidates].sort((a, b) =>
                                    Math.abs(parseFloat(a.quantity) - target) - Math.abs(parseFloat(b.quantity) - target)
                                );
                                srcPkg = claimPkg(sorted[0]);
                            }
                        } else {
                            // No quantity hint — take the next unclaimed candidate
                            // in created_at order. Lets multi-input runs consume
                            // distinct rows sequentially.
                            srcPkg = claimPkg(candidates[0]);
                        }
                    }
                }

                // Strategy 3b: non-cannabis additive (no strain to match on).
                if (!srcPkg && typeName && (catalogEntry?.is_cannabis === false)) {
                    const { rows } = await sql`
                        SELECT id, label, quantity, package_type, strain
                        FROM packages
                        WHERE company_id = ${authContext.companyId}
                          AND package_type = ${typeName}
                          AND status = 'active'
                        ORDER BY created_at DESC
                    `;
                    const candidates = (rows as PkgRow[]).filter(p => !consumedPackageIds.has(p.id));
                    srcPkg = claimPkg(candidates[0] || null);
                }

                resolved.push({
                    requestedPackageType: ri.packageType || srcPkg?.package_type || '',
                    resolvedPackageType: typeName || srcPkg?.package_type || null,
                    resolvedDisplayName: catalogEntry?.display_name || null,
                    unit: ri.unit || catalogEntry?.default_unit || 'g',
                    isCannabis: catalogEntry?.is_cannabis ?? null,
                    strain: strainForInput || srcPkg?.strain || null,
                    quantity: typeof ri.quantity === 'number'
                        ? ri.quantity
                        : (srcPkg ? parseFloat(srcPkg.quantity) : null),
                    sourcePackageId: srcPkg?.id || null,
                    sourcePackageLabel: srcPkg?.label || null,
                });
            }

            const identifier = String(runInput.templateIdentifier || '').toLowerCase().trim();
            let matchedTmpl: TmplRow | null = null;
            if (identifier) {
                matchedTmpl = tmplRows.find(t => t.name.toLowerCase() === identifier)
                    || tmplRows.find(t => t.name.toLowerCase().includes(identifier) || identifier.includes(t.name.toLowerCase()))
                    || tmplRows.find(t => !!t.process_type && identifier.includes(t.process_type))
                    || (runInput.targetProduct ? tmplRows.find(t => {
                        const blob = identifier + ' ' + runInput.targetProduct;
                        return (t.process_type === 'solventless' && /rosin|hash|bubble/.test(blob)) ||
                            (t.process_type === 'bho' && /shatter|wax|crumble|resin|bho/.test(blob)) ||
                            (t.process_type === 'distillate' && /distillate|isolate/.test(blob));
                    }) : null)
                    || null;
            }
            if (!matchedTmpl && resolved.length > 0) {
                const resolvedTypes = resolved.map(r => r.resolvedPackageType).filter(Boolean) as string[];
                matchedTmpl = tmplRows.find(t =>
                    Array.isArray(t.accepted_inputs) && resolvedTypes.some(rt => t.accepted_inputs!.includes(rt))
                ) || null;
            }

            // Check whether matched template actually accepts the resolved input types
            const resolvedTypes = resolved.map(r => r.resolvedPackageType).filter(Boolean) as string[];
            let inputMismatch: string | null = null;
            if (matchedTmpl && Array.isArray(matchedTmpl.accepted_inputs) && matchedTmpl.accepted_inputs.length > 0 && resolvedTypes.length > 0) {
                const rejected = resolvedTypes.filter(rt => !matchedTmpl!.accepted_inputs!.includes(rt));
                if (rejected.length > 0) {
                    // Try to find a template that does accept these inputs
                    const betterTmpl = tmplRows.find(t =>
                        t.id !== matchedTmpl!.id &&
                        Array.isArray(t.accepted_inputs) &&
                        resolvedTypes.every(rt => t.accepted_inputs!.includes(rt))
                    );
                    if (betterTmpl) {
                        matchedTmpl = betterTmpl;
                    } else {
                        inputMismatch = `"${matchedTmpl.name}" does not accept ${rejected.map(r => r.replace(/_/g, ' ')).join(', ')}. Accepted: ${matchedTmpl.accepted_inputs.map(a => a.replace(/_/g, ' ')).join(', ')}.`;
                    }
                }
            }

            const today = new Date();
            const dateStr = `${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}${String(today.getFullYear()).slice(-2)}`;
            const tmplLabel = matchedTmpl?.name || runInput.templateIdentifier || 'Run';
            const strainLabel = runInput.strain || resolved.find(r => r.strain)?.strain || 'Unknown';
            const runName = runInput.runName || `${strainLabel} - ${tmplLabel} - ${dateStr}`;

            const sourcePackageIds = resolved.map(r => r.sourcePackageId).filter((id): id is string => !!id);
            const sourcePackageQuantities: Record<string, number> = {};
            for (const r of resolved) {
                if (r.sourcePackageId && typeof r.quantity === 'number' && r.quantity > 0) {
                    sourcePackageQuantities[r.sourcePackageId] = r.quantity;
                }
            }

            const primary = resolved[0] || null;

            return {
                templateId: matchedTmpl?.id || null,
                templateName: matchedTmpl?.name || runInput.templateIdentifier,
                templateMatched: Boolean(matchedTmpl),
                inputMismatch,
                runName,
                strain: runInput.strain || null,
                inputMaterial: primary?.resolvedPackageType || null,
                inputQuantityG: primary?.quantity || null,
                inputs: resolved.map(r => ({
                    packageType: r.resolvedPackageType,
                    displayName: r.resolvedDisplayName,
                    strain: r.strain,
                    quantity: r.quantity,
                    unit: r.unit,
                    sourcePackageId: r.sourcePackageId,
                    sourcePackageLabel: r.sourcePackageLabel,
                })),
                // Fall back to inferring the target product from the matched
                // template when the agent doesn't pass it explicitly. We scan
                // the template name for known product-type keywords (the same
                // set the UI renders as category chips), and fall back to the
                // template's process_type when it's already a concrete type
                // like "distillate". Keeps the action preview card from
                // showing a blank "Target —" on an obviously-targeted run.
                targetProduct: runInput.targetProduct || inferTargetProduct(matchedTmpl?.name, matchedTmpl?.process_type) || null,
                sourcePackageId: primary?.sourcePackageId || null,
                sourcePackageLabel: primary?.sourcePackageLabel || null,
                sourcePackageIds,
                sourcePackageQuantities,
                plannedStart: runInput.plannedStart || null,
                status: runInput.startImmediately === false ? 'planned' : 'active',
                notes: runInput.notes || null,
            };
        }

        // ── Shared helper: resolve an existing extraction run by ID or fuzzy identifier ──
        // Used by amend_inputs / record_yield / cancel actions on the new
        // unified extraction_run tool. Returns the run row (id, name, strain,
        // status) or null if no match. The fuzzy path matches against the
        // runs already pushed into the context (visible to the LLM), using
        // strain + status + template name as the search keys.
        async function resolveExtractionRunRef(runId?: string, runIdentifier?: string): Promise<{ id: string; name: string; strain: string | null; status: string } | null> {
            if (runId) {
                const { rows } = await sql`
                    SELECT id, name, strain, status
                    FROM extraction_runs
                    WHERE id = ${runId} AND company_id = ${authContext.companyId}
                    LIMIT 1
                `;
                return (rows[0] as { id: string; name: string; strain: string | null; status: string } | undefined) || null;
            }
            if (runIdentifier) {
                const needle = `%${String(runIdentifier).toLowerCase()}%`;
                // Search active + planned first (most likely target), then fall back to any.
                const { rows } = await sql`
                    SELECT id, name, strain, status
                    FROM extraction_runs
                    WHERE company_id = ${authContext.companyId}
                      AND status IN ('planned', 'active')
                      AND (LOWER(name) LIKE ${needle} OR LOWER(strain) LIKE ${needle})
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                return (rows[0] as { id: string; name: string; strain: string | null; status: string } | undefined) || null;
            }
            return null;
        }

        // ── runLookup: read-only find_* dispatcher (PR #2 agent loop) ──
        // Called from inside the multi-turn agent loop when the model emits
        // a tool_use for one of the five read-only lookup tools. Each branch
        // runs a scoped SQL query and returns the result as a JSON string
        // that gets wrapped in a tool_result message block. Errors are
        // caught and surfaced to the model via { isError: true } so it can
        // recover — we never throw out of the loop.
        //
        // PR #2 card surfacing: `data` holds the structured (pre-stringify)
        // result so the agent loop can also push it into the response-level
        // toolResults[] array, enabling the frontend to render interactive
        // result cards (PackagesResultCard, etc.) instead of flattening the
        // data into the assistant's text reply.
        type LookupResult = { content: string; data: unknown; isError: boolean };
        const LOOKUP_LIMIT_DEFAULT = 20;
        const LOOKUP_LIMIT_MAX = 50;
        const clampLimit = (raw: unknown): number => {
            const n = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(n) || n <= 0) return LOOKUP_LIMIT_DEFAULT;
            return Math.min(Math.floor(n), LOOKUP_LIMIT_MAX);
        };
        // Small helpers so each find_* branch returns both the stringified
        // content (for the agent's tool_result) and the parsed data (for
        // the response-level toolResults[] the frontend renders as cards).
        const lookupOk = (payload: unknown): LookupResult => ({
            isError: false,
            content: JSON.stringify(payload),
            data: payload,
        });
        const lookupErr = (message: string): LookupResult => ({
            isError: true,
            content: JSON.stringify({ error: message }),
            data: { error: message },
        });

        async function runLookup(name: string, lookupInput: Record<string, unknown>): Promise<LookupResult> {
            try {
                if (name === 'find_plants') {
                    const strainLike = lookupInput.strainName ? `%${String(lookupInput.strainName).toLowerCase()}%` : null;
                    const roomLike = lookupInput.roomName ? `%${String(lookupInput.roomName).toLowerCase()}%` : null;
                    const phase = typeof lookupInput.phase === 'string' ? lookupInput.phase : null;
                    const minHealth = typeof lookupInput.minHealth === 'number' ? lookupInput.minHealth : null;
                    const maxHealth = typeof lookupInput.maxHealth === 'number' ? lookupInput.maxHealth : null;
                    const contamFilter: string[] = Array.isArray(lookupInput.contaminants) ? lookupInput.contaminants as string[] : [];
                    const entityFilter = lookupInput.entity === 'plant' || lookupInput.entity === 'batch' ? lookupInput.entity : null;
                    const limit = clampLimit(lookupInput.limit);

                    type PlantRow = { id: string; label: string; strain_name: string; room_name: string | null; growth_phase: string; plant_health: number; contaminants: string[] };
                    type BatchRow = { id: string; name: string; strain_name: string; room_name: string | null; batch_type: string | null; untracked_count: number; plant_health: number; contaminants: string[] };

                    const plants: PlantRow[] = [];
                    const batches: BatchRow[] = [];

                    if (entityFilter !== 'batch') {
                        const { rows } = await sql`
                            SELECT p.id, p.label, p.strain_name, r.name AS room_name,
                                   p.growth_phase, p.plant_health, p.contaminants
                            FROM plants p
                            LEFT JOIN rooms r ON r.id = p.room_id
                            WHERE p.company_id = ${authContext.companyId}
                              AND (${strainLike}::text IS NULL OR LOWER(p.strain_name) LIKE ${strainLike}::text)
                              AND (${roomLike}::text IS NULL OR LOWER(r.name) LIKE ${roomLike}::text)
                              AND (${phase}::text IS NULL OR p.growth_phase = ${phase}::text)
                              AND (${minHealth}::int IS NULL OR p.plant_health >= ${minHealth}::int)
                              AND (${maxHealth}::int IS NULL OR p.plant_health <= ${maxHealth}::int)
                              AND (${contamFilter.length === 0} OR p.contaminants && ${contamFilter}::text[])
                            ORDER BY p.strain_name, r.name, p.label
                            LIMIT ${limit}
                        `;
                        plants.push(...(rows as PlantRow[]));
                    }
                    if (entityFilter !== 'plant') {
                        const { rows } = await sql`
                            SELECT pb.id, pb.name, pb.strain_name, r.name AS room_name,
                                   pb.batch_type, pb.untracked_count, pb.plant_health, pb.contaminants
                            FROM plant_batches pb
                            LEFT JOIN rooms r ON r.id = pb.room_id
                            WHERE pb.company_id = ${authContext.companyId}
                              AND (${strainLike}::text IS NULL OR LOWER(pb.strain_name) LIKE ${strainLike}::text)
                              AND (${roomLike}::text IS NULL OR LOWER(r.name) LIKE ${roomLike}::text)
                              AND (${minHealth}::int IS NULL OR pb.plant_health >= ${minHealth}::int)
                              AND (${maxHealth}::int IS NULL OR pb.plant_health <= ${maxHealth}::int)
                              AND (${contamFilter.length === 0} OR pb.contaminants && ${contamFilter}::text[])
                            ORDER BY pb.strain_name, r.name, pb.name
                            LIMIT ${limit}
                        `;
                        batches.push(...(rows as BatchRow[]));
                    }

                    return lookupOk({
                        plants: plants.map(p => ({
                            id: p.id, label: p.label, strain: p.strain_name, room: p.room_name,
                            phase: p.growth_phase, health: p.plant_health, contaminants: p.contaminants,
                        })),
                        batches: batches.map(b => ({
                            id: b.id, name: b.name, strain: b.strain_name, room: b.room_name,
                            batchType: b.batch_type, count: b.untracked_count,
                            health: b.plant_health, contaminants: b.contaminants,
                        })),
                        totalMatches: plants.length + batches.length,
                    });
                }

                if (name === 'find_packages') {
                    const strainLike = lookupInput.strain ? `%${String(lookupInput.strain).toLowerCase()}%` : null;
                    const labelLike = lookupInput.labelContains ? `%${String(lookupInput.labelContains).toLowerCase()}%` : null;
                    const locationLike = lookupInput.location ? `%${String(lookupInput.location).toLowerCase()}%` : null;
                    const packageType = typeof lookupInput.packageType === 'string' ? lookupInput.packageType : null;
                    const status = typeof lookupInput.status === 'string' ? lookupInput.status : null;
                    const labState = typeof lookupInput.labTestingState === 'string' ? lookupInput.labTestingState : null;
                    const licenseNumber = typeof lookupInput.licenseNumber === 'string' ? lookupInput.licenseNumber : null;
                    const minQty = typeof lookupInput.minQuantity === 'number' ? lookupInput.minQuantity : null;
                    const maxQty = typeof lookupInput.maxQuantity === 'number' ? lookupInput.maxQuantity : null;
                    const limit = clampLimit(lookupInput.limit);

                    const { rows } = await sql`
                        SELECT id, label, package_type, strain, license_number, quantity, status, lab_testing_state, location
                        FROM packages
                        WHERE company_id = ${authContext.companyId}
                          AND status != 'archived'
                          AND (${strainLike}::text IS NULL OR LOWER(strain) LIKE ${strainLike}::text)
                          AND (${labelLike}::text IS NULL OR LOWER(label) LIKE ${labelLike}::text)
                          AND (${locationLike}::text IS NULL OR LOWER(location) LIKE ${locationLike}::text)
                          AND (${packageType}::text IS NULL OR package_type = ${packageType}::text)
                          AND (${status}::text IS NULL OR status = ${status}::text)
                          AND (${labState}::text IS NULL OR lab_testing_state = ${labState}::text)
                          AND (${licenseNumber}::text IS NULL OR license_number = ${licenseNumber}::text)
                          AND (${minQty}::numeric IS NULL OR quantity >= ${minQty}::numeric)
                          AND (${maxQty}::numeric IS NULL OR quantity <= ${maxQty}::numeric)
                        ORDER BY packaged_date DESC
                        LIMIT ${limit}
                    `;

                    return lookupOk({
                        packages: rows.map((p: Record<string, unknown>) => ({
                            id: p.id,
                            label: p.label,
                            packageType: p.package_type,
                            strain: p.strain,
                            quantity: p.quantity !== null && p.quantity !== undefined ? parseFloat(String(p.quantity)) : null,
                            status: p.status,
                            labTestingState: p.lab_testing_state,
                            location: p.location,
                            licenseNumber: p.license_number,
                        })),
                        totalMatches: rows.length,
                    });
                }

                if (name === 'find_human_tasks') {
                    const titleLike = lookupInput.titleContains ? `%${String(lookupInput.titleContains).toLowerCase()}%` : null;
                    const assigneeLike = lookupInput.assignee ? `%${String(lookupInput.assignee).toLowerCase()}%` : null;
                    const locationLike = lookupInput.location ? `%${String(lookupInput.location).toLowerCase()}%` : null;
                    const category = typeof lookupInput.category === 'string' ? lookupInput.category : null;
                    const status = typeof lookupInput.status === 'string' ? lookupInput.status : null;
                    const priority = typeof lookupInput.priority === 'string' ? lookupInput.priority : null;
                    const dueBefore = typeof lookupInput.dueDateBefore === 'string' ? lookupInput.dueDateBefore : null;
                    const dueAfter = typeof lookupInput.dueDateAfter === 'string' ? lookupInput.dueDateAfter : null;
                    const limit = clampLimit(lookupInput.limit);

                    const { rows } = await sql`
                        SELECT id, title, description, status, priority, category, assignee, location, due_date
                        FROM human_tasks
                        WHERE company_id = ${authContext.companyId}
                          AND (${titleLike}::text IS NULL OR LOWER(title) LIKE ${titleLike}::text OR LOWER(description) LIKE ${titleLike}::text)
                          AND (${category}::text IS NULL OR category = ${category}::text)
                          AND (${status}::text IS NULL OR status = ${status}::text)
                          AND (${priority}::text IS NULL OR priority = ${priority}::text)
                          AND (${assigneeLike}::text IS NULL OR LOWER(assignee) LIKE ${assigneeLike}::text)
                          AND (${locationLike}::text IS NULL OR LOWER(location) LIKE ${locationLike}::text)
                          AND (${dueBefore}::timestamptz IS NULL OR due_date <= ${dueBefore}::timestamptz)
                          AND (${dueAfter}::timestamptz IS NULL OR due_date >= ${dueAfter}::timestamptz)
                        ORDER BY due_date ASC NULLS LAST, created_at DESC
                        LIMIT ${limit}
                    `;

                    return lookupOk({
                        tasks: rows.map((t: Record<string, unknown>) => ({
                            id: t.id,
                            title: t.title,
                            description: t.description,
                            status: t.status,
                            priority: t.priority,
                            category: t.category,
                            assignee: t.assignee,
                            location: t.location,
                            dueDate: t.due_date,
                        })),
                        totalMatches: rows.length,
                    });
                }

                if (name === 'find_bins') {
                    const strainLike = lookupInput.strain ? `%${String(lookupInput.strain).toLowerCase()}%` : null;
                    const harvestBatchLike = lookupInput.harvestBatchId ? `%${String(lookupInput.harvestBatchId).toLowerCase()}%` : null;
                    const locationLike = lookupInput.location ? `%${String(lookupInput.location).toLowerCase()}%` : null;
                    const status = typeof lookupInput.status === 'string' ? lookupInput.status : null;
                    const minWeight = typeof lookupInput.minWeight === 'number' ? lookupInput.minWeight : null;
                    const maxWeight = typeof lookupInput.maxWeight === 'number' ? lookupInput.maxWeight : null;
                    const limit = clampLimit(lookupInput.limit);

                    const { rows } = await sql`
                        SELECT b.id, b.bin_number, b.strain, b.status, b.weight, b.location,
                               b.harvest_id, h.batch_id AS harvest_batch_id
                        FROM harvest_bins b
                        LEFT JOIN harvests h ON h.id = b.harvest_id
                        WHERE b.company_id = ${authContext.companyId}
                          AND (${strainLike}::text IS NULL OR LOWER(b.strain) LIKE ${strainLike}::text)
                          AND (${harvestBatchLike}::text IS NULL OR LOWER(h.batch_id) LIKE ${harvestBatchLike}::text)
                          AND (${locationLike}::text IS NULL OR LOWER(b.location) LIKE ${locationLike}::text)
                          AND (${status}::text IS NULL OR b.status = ${status}::text)
                          AND (${minWeight}::numeric IS NULL OR b.weight >= ${minWeight}::numeric)
                          AND (${maxWeight}::numeric IS NULL OR b.weight <= ${maxWeight}::numeric)
                        ORDER BY b.created_at DESC
                        LIMIT ${limit}
                    `;

                    return lookupOk({
                        bins: rows.map((b: Record<string, unknown>) => ({
                            id: b.id,
                            binNumber: b.bin_number,
                            strain: b.strain,
                            status: b.status,
                            weight: b.weight !== null && b.weight !== undefined ? parseFloat(String(b.weight)) : null,
                            location: b.location,
                            harvestId: b.harvest_id,
                            harvestBatchId: b.harvest_batch_id,
                        })),
                        totalMatches: rows.length,
                    });
                }

                if (name === 'find_extraction_logs') {
                    const strainLike = lookupInput.strain ? `%${String(lookupInput.strain).toLowerCase()}%` : null;
                    const inputPackageType = typeof lookupInput.inputPackageType === 'string' ? lookupInput.inputPackageType : null;
                    const outputPackageType = typeof lookupInput.outputPackageType === 'string' ? lookupInput.outputPackageType : null;
                    const sinceDate = typeof lookupInput.sinceDate === 'string' ? lookupInput.sinceDate : null;
                    const limit = clampLimit(lookupInput.limit);

                    const { rows } = await sql`
                        SELECT id, strain, input_package_type, input_quantity,
                               output_package_type, output_quantity, yield_percentage, created_at
                        FROM extraction_logs
                        WHERE company_id = ${authContext.companyId}
                          AND (${strainLike}::text IS NULL OR LOWER(strain) LIKE ${strainLike}::text)
                          AND (${inputPackageType}::text IS NULL OR input_package_type = ${inputPackageType}::text)
                          AND (${outputPackageType}::text IS NULL OR output_package_type = ${outputPackageType}::text)
                          AND (${sinceDate}::timestamptz IS NULL OR created_at >= ${sinceDate}::timestamptz)
                        ORDER BY created_at DESC
                        LIMIT ${limit}
                    `;

                    return lookupOk({
                        logs: rows.map((l: Record<string, unknown>) => ({
                            id: l.id,
                            strain: l.strain,
                            inputPackageType: l.input_package_type,
                            inputQuantity: l.input_quantity !== null && l.input_quantity !== undefined ? parseFloat(String(l.input_quantity)) : null,
                            outputPackageType: l.output_package_type,
                            outputQuantity: l.output_quantity !== null && l.output_quantity !== undefined ? parseFloat(String(l.output_quantity)) : null,
                            yieldPercentage: l.yield_percentage !== null && l.yield_percentage !== undefined ? parseFloat(String(l.yield_percentage)) : null,
                            createdAt: l.created_at,
                        })),
                        totalMatches: rows.length,
                    });
                }

                if (name === 'plan_backward') {
                    const targetOutputType = typeof lookupInput.targetOutputType === 'string' ? lookupInput.targetOutputType : '';
                    const targetQuantity = typeof lookupInput.targetQuantity === 'number' ? lookupInput.targetQuantity : 0;
                    const targetUnit = typeof lookupInput.targetUnit === 'string' ? lookupInput.targetUnit : undefined;
                    const planStrain = typeof lookupInput.strain === 'string' ? lookupInput.strain : undefined;

                    if (!targetOutputType || targetQuantity <= 0) {
                        return lookupErr('targetOutputType and targetQuantity > 0 are required');
                    }

                    // Call the plan-backward endpoint logic inline (same DB connection)
                    const templatesRes = await sql`SELECT id, name, process_type, accepted_inputs, producible_outputs
                        FROM process_templates WHERE company_id = ${authContext.companyId} AND is_active = true AND COALESCE(domain, 'extraction') = 'extraction'`;
                    const ptRes = await sql`SELECT name, display_name, category, default_unit FROM product_types WHERE company_id = ${authContext.companyId} AND is_active = true`;
                    const yieldRes = planStrain
                        ? await sql`SELECT input_package_type AS input_type, output_package_type AS output_type,
                                     ROUND(AVG(yield_percentage)::numeric, 2) AS avg_yield_pct, COUNT(*)::int AS sample_count
                              FROM extraction_logs WHERE company_id = ${authContext.companyId} AND strain = ${planStrain} AND yield_percentage IS NOT NULL
                              GROUP BY input_package_type, output_package_type`
                        : { rows: [] as Array<{ input_type: string; output_type: string; avg_yield_pct: string; sample_count: number }> };

                    const ptMap = new Map<string, { displayName: string; category: string; defaultUnit: string }>();
                    for (const pt of ptRes.rows) ptMap.set(pt.name, { displayName: pt.display_name, category: pt.category, defaultUnit: pt.default_unit });

                    const yieldMap = new Map<string, { avg: number; count: number }>();
                    for (const r of yieldRes.rows) yieldMap.set(`${r.input_type}→${r.output_type}`, { avg: parseFloat(r.avg_yield_pct), count: r.sample_count });

                    // Load steps
                    const tIds = templatesRes.rows.map((t: any) => t.id as string);
                    const stepsRes = tIds.length > 0
                        ? await sql`SELECT template_id, step_order, input_type, output_type, expected_yield_pct, is_optional FROM process_steps WHERE template_id = ANY(${tIds}::uuid[]) ORDER BY step_order ASC`
                        : { rows: [] as any[] };
                    const stepsByTmpl = new Map<string, any[]>();
                    for (const s of stepsRes.rows) { if (!stepsByTmpl.has(s.template_id)) stepsByTmpl.set(s.template_id, []); stepsByTmpl.get(s.template_id)!.push(s); }

                    // Chain backward
                    interface ChainLink { templateName: string; inputType: string; outputType: string; yieldPct: number; yieldSource: string; sampleCount?: number; steps: any[] }
                    const chain: ChainLink[] = [];
                    let cur = targetOutputType;
                    const visited = new Set<string>();
                    const warnings: string[] = [];

                    while (true) {
                        const curPt = ptMap.get(cur);
                        if (curPt?.category === 'biomass') break;
                        if (visited.has(cur)) { warnings.push(`Circular: ${cur}`); break; }
                        visited.add(cur);
                        const tmpl = templatesRes.rows.find((t: any) => t.producible_outputs?.includes(cur));
                        if (!tmpl) { if (!curPt || curPt.category !== 'biomass') warnings.push(`No SOP produces ${curPt?.displayName || cur}`); break; }
                        const steps = (stepsByTmpl.get(tmpl.id) || []).filter((s: any) => !s.is_optional);
                        const firstInput = steps[0]?.input_type || tmpl.accepted_inputs?.[0];
                        if (!firstInput) { warnings.push(`Template "${tmpl.name}" has no input`); break; }
                        const hk = `${firstInput}→${cur}`;
                        const hist = yieldMap.get(hk);
                        let yieldPct = 100, yieldSource = 'assumed';
                        let sc: number | undefined;
                        if (hist && hist.count >= 1) { yieldPct = hist.avg; yieldSource = 'historical_avg'; sc = hist.count; }
                        else { const cum = steps.reduce((a: number, s: any) => a * ((s.expected_yield_pct ? parseFloat(s.expected_yield_pct) : 100) / 100), 1) * 100; if (cum > 0 && cum < 100) { yieldPct = Math.round(cum * 100) / 100; yieldSource = 'template_default'; } }
                        chain.unshift({ templateName: tmpl.name, inputType: firstInput, outputType: cur, yieldPct, yieldSource, sampleCount: sc, steps });
                        cur = firstInput;
                    }

                    // Walk forward to compute quantities
                    let reqOut = targetQuantity;
                    const stages: any[] = [];
                    for (let i = chain.length - 1; i >= 0; i--) {
                        const link = chain[i];
                        const reqIn = link.yieldPct > 0 ? reqOut / (link.yieldPct / 100) : reqOut;
                        const inPt = ptMap.get(link.inputType);
                        const outPt = ptMap.get(link.outputType);
                        stages.unshift({
                            templateName: link.templateName, inputType: link.inputType, inputDisplayName: inPt?.displayName || link.inputType,
                            inputQty: Math.ceil(reqIn * 100) / 100, inputUnit: inPt?.defaultUnit || 'g',
                            outputType: link.outputType, outputDisplayName: outPt?.displayName || link.outputType,
                            outputQty: Math.ceil(reqOut * 100) / 100, outputUnit: outPt?.defaultUnit || targetUnit || 'g',
                            yieldPct: link.yieldPct, yieldSource: link.yieldSource, sampleCount: link.sampleCount,
                        });
                        reqOut = reqIn;
                    }

                    // Biomass check
                    const biomassType = chain.length > 0 ? chain[0].inputType : targetOutputType;
                    const biomassPt = ptMap.get(biomassType);
                    const biomassNeeded = stages[0]?.inputQty || targetQuantity;
                    const pkgRes = planStrain
                        ? await sql`SELECT id, label, strain, quantity FROM packages
                                    WHERE company_id = ${authContext.companyId} AND package_type = ${biomassType}
                                      AND status = 'active' AND quantity > 0 AND strain = ${planStrain}
                                    ORDER BY quantity DESC LIMIT 20`
                        : await sql`SELECT id, label, strain, quantity FROM packages
                                    WHERE company_id = ${authContext.companyId} AND package_type = ${biomassType}
                                      AND status = 'active' AND quantity > 0
                                    ORDER BY quantity DESC LIMIT 20`;
                    const onHand = pkgRes.rows.reduce((s: number, p: any) => s + parseFloat(p.quantity), 0);

                    return lookupOk({
                        stages,
                        biomassRequired: { type: biomassType, displayName: biomassPt?.displayName || biomassType, quantity: Math.ceil(biomassNeeded * 100) / 100, unit: biomassPt?.defaultUnit || 'g' },
                        biomassOnHand: { quantity: onHand, unit: biomassPt?.defaultUnit || 'g', packageCount: pkgRes.rows.length },
                        biomassGap: { quantity: Math.max(0, Math.ceil((biomassNeeded - onHand) * 100) / 100), unit: biomassPt?.defaultUnit || 'g' },
                        warnings,
                    });
                }

                return lookupErr(`unknown lookup tool: ${name}`);
            } catch (err) {
                console.error(`runLookup[${name}] failed:`, err);
                return lookupErr(err instanceof Error ? err.message : 'lookup failed');
            }
        }

        // Classifier: which tools run as read-only lookups inside the agent
        // loop vs which are mutations that emit ProposedActions. The default
        // is mutation — only names listed here are read-only.
        const READONLY_TOOLS = new Set([
            'find_plants',
            'find_packages',
            'find_human_tasks',
            'find_bins',
            'find_extraction_logs',
            'plan_backward',
        ]);

        // ── Fuzzy task resolver ──
        // Used by the update_human_tasks / delete_human_tasks dispatcher
        // cases now that humanTasks are no longer pushed into context. The
        // agent is expected to call find_human_tasks first and pass the
        // resolved taskId, but this fallback fuzzy-matches by title when
        // only a taskIdentifier was provided.
        async function resolveHumanTaskRef(taskId?: string, taskIdentifier?: string): Promise<{ id: string; title: string } | null> {
            if (taskId) {
                const { rows } = await sql`
                    SELECT id, title FROM human_tasks
                    WHERE id = ${taskId} AND company_id = ${authContext.companyId}
                    LIMIT 1
                `;
                return (rows[0] as { id: string; title: string } | undefined) || null;
            }
            if (taskIdentifier) {
                const needle = `%${String(taskIdentifier).toLowerCase()}%`;
                const { rows } = await sql`
                    SELECT id, title FROM human_tasks
                    WHERE company_id = ${authContext.companyId}
                      AND status != 'completed'
                      AND (LOWER(title) LIKE ${needle} OR LOWER(description) LIKE ${needle})
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                return (rows[0] as { id: string; title: string } | undefined) || null;
            }
            return null;
        }

        // ── Multi-turn agent loop ──
        // Up to MAX_AGENT_TURNS Anthropic calls per request. Each turn:
        //   1. Call Claude with accumulated messages + cached system/tools
        //   2. Iterate response.content blocks
        //      - text → append to assistantMessage
        //      - tool_use (read-only) → run runLookup, collect tool_result
        //      - tool_use (mutation) → run the existing switch (pushes
        //        ProposedAction into actions[]) + stub tool_result so the
        //        agent knows the mutation was queued
        //   3. If stop_reason !== 'tool_use', break
        //   4. Otherwise append assistant response + tool_results to
        //      messages and continue
        // Runaway loops get truncated at the cap with a console warning.
        let response: ParsedAnthropicResponse = { content: [] };

        // PR #3 streaming: when the streaming branch is active, this holds
        // a writer that pushes text deltas out to the client's ReadableStream
        // as they arrive from Anthropic. When undefined (non-streaming mode
        // or ahead of the streaming branch activating), text is only
        // accumulated into assistantMessage for the final response body.
        let onTextDelta: ((delta: string) => void) | undefined = undefined;

        // Extracted so both the streaming and non-streaming return paths can
        // invoke the same loop body. Reads/writes the outer-scope state
        // (actions, toolResults, assistantMessage, messages, toolResultsThisTurn,
        // response, onTextDelta) via closure.
        const runAgentLoop = async (): Promise<void> => {
        // Tracks which turn most recently produced a text block, so we can
        // inject a paragraph separator when multiple turns emit text. Without
        // this, turn 0's trailing text concatenates directly with turn 1's
        // leading text (e.g. "I'll look that up.| Strain | ...") which breaks
        // markdown table rendering for the common lookup → table pattern.
        let lastTextTurn: number | undefined = undefined;

        for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
            // Paragraph separator between text-producing turns. Fires BEFORE
            // the fetch so the streaming client sees the separator arrive
            // just ahead of the new turn's text deltas — producing a clean
            // inline break. The server-side assistantMessage gets the same
            // separator so the final done payload matches.
            if (
                turn > 0 &&
                lastTextTurn !== undefined &&
                assistantMessage.length > 0 &&
                !assistantMessage.endsWith('\n\n')
            ) {
                assistantMessage += '\n\n';
                if (onTextDelta) onTextDelta('\n\n');
            }

            const apiResponse = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-beta': 'prompt-caching-2024-07-31',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 4096,
                    // Always stream from Anthropic. The helper reconstructs
                    // the full response object either way; streaming lets
                    // us pipe text deltas through to the frontend in real
                    // time when the caller opts in (onTextDelta passed).
                    stream: true,
                    system: [
                        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
                        { type: 'text', text: deptContext },
                    ],
                    tools: cachedTools,
                    messages,
                }),
            });

            if (!apiResponse.ok) {
                const errText = await apiResponse.text();
                console.error('Anthropic API error:', apiResponse.status, errText);
                return { statusCode: 502, body: JSON.stringify({ error: 'AI service error', detail: errText, status: apiResponse.status }) };
            }

            response = await consumeAnthropicStream(apiResponse, onTextDelta);

            // Per-turn cache usage log. Turn 0 mirrors pre-PR-2 single-shot
            // behavior; turns 1+ show how the growing messages array affects
            // input_tokens. Static prefix (system + tools) should still hit
            // cache_read on every turn.
            if (response && response.usage) {
                const u = response.usage;
                console.log(`[ai-parse cache] turn=${turn} model=${model} input=${u.input_tokens || 0} output=${u.output_tokens || 0} cache_create=${u.cache_creation_input_tokens || 0} cache_read=${u.cache_read_input_tokens || 0}`);
            }

            // Reset per-turn collector before iterating blocks.
            toolResultsThisTurn = [];

        for (const block of response.content) {
            if (block.type === 'text') {
                if (block.text) {
                    assistantMessage += block.text;
                    lastTextTurn = turn;
                }
            } else if (block.type === 'tool_use') {
                const input = block.input as Record<string, any>;

                // Read-only lookup tools run server-side and return their
                // results directly to the model via tool_result. They never
                // produce ProposedActions. PR #2 card surfacing: we also
                // push the parsed data into the response-level toolResults
                // array so the frontend can render it as an interactive
                // card (PackagesResultCard, etc.) without re-parsing the
                // agent's narrative text.
                if (READONLY_TOOLS.has(block.name)) {
                    const toolUseId = block.id;
                    if (!toolUseId) continue;
                    const lookup = await runLookup(block.name, input);
                    const resultBlock: AnthropicContentBlock = {
                        type: 'tool_result',
                        tool_use_id: toolUseId,
                        content: lookup.content,
                    };
                    if (lookup.isError) resultBlock.is_error = true;
                    toolResultsThisTurn.push(resultBlock);
                    toolResults.push({
                        tool: block.name,
                        toolUseId,
                        query: input,
                        data: lookup.data,
                        isError: lookup.isError,
                    });
                    continue;
                }

                switch (block.name) {
                    case 'create_session':
                        actions.push({ type: 'create_session', data: input });
                        break;
                    case 'add_batches':
                        for (const batch of (input.batches || [])) {
                            actions.push({ type: 'add_batch', data: { ...batch, status: batch.status || 'upcoming' } });
                        }
                        break;
                    case 'assign_trimmers': {
                        // Resolve entryIdentifier to actual entryId
                        const matchedEntry = request.context.existingEntries.find(
                            e => e.harvestName.toLowerCase().includes(input.entryIdentifier.toLowerCase()) ||
                                e.strain.toLowerCase().includes(input.entryIdentifier.toLowerCase())
                        );
                        for (const trimmer of (input.trimmers || [])) {
                            actions.push({
                                type: 'assign_trimmer',
                                data: {
                                    entryId: matchedEntry?.id || null,
                                    entryName: matchedEntry?.harvestName || input.entryIdentifier,
                                    name: trimmer.name,
                                    profileId: trimmer.profileId || null,
                                    startTime: trimmer.startTime,
                                    tool: trimmer.tool || 'scissors',
                                },
                            });
                        }
                        break;
                    }
                    case 'add_trimmer_profiles':
                        for (const profile of (input.profiles || [])) {
                            actions.push({ type: 'add_trimmer_profile', data: { name: profile.name } });
                        }
                        break;
                    case 'create_harvest':
                        actions.push({ type: 'create_harvest', data: input });
                        break;
                    case 'record_wet_weight': {
                        const matchedHarvest = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'record_wet_weight',
                            data: {
                                harvestId: matchedHarvest?.id || null,
                                harvestName: matchedHarvest?.batchId || input.harvestIdentifier,
                                weight: input.weight,
                            },
                        });
                        break;
                    }
                    case 'allocate_harvest': {
                        const matchedH = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'allocate_harvest',
                            data: {
                                harvestId: matchedH?.id || null,
                                harvestName: matchedH?.batchId || input.harvestIdentifier,
                                allocations: input.allocations,
                            },
                        });
                        break;
                    }
                    case 'record_harvest_waste': {
                        const matchedHW = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'record_harvest_waste',
                            data: {
                                harvestId: matchedHW?.id || null,
                                harvestName: matchedHW?.batchId || input.harvestIdentifier,
                                wasteType: input.wasteType,
                                weight: input.weight,
                            },
                        });
                        break;
                    }
                    case 'record_plant_weight': {
                        const matchedHP = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'record_plant_weight',
                            data: {
                                harvestId: matchedHP?.id || null,
                                harvestName: matchedHP?.batchId || input.harvestIdentifier,
                                weights: input.weights,
                            },
                        });
                        break;
                    }
                    case 'flag_contamination': {
                        const matchedHC = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'flag_contamination',
                            data: {
                                harvestId: matchedHC?.id || null,
                                harvestName: matchedHC?.batchId || input.harvestIdentifier,
                                contaminants: input.contaminants,
                            },
                        });
                        break;
                    }
                    case 'move_harvest': {
                        const matchedHM = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'move_harvest',
                            data: {
                                harvestId: matchedHM?.id || null,
                                harvestName: matchedHM?.batchId || input.harvestIdentifier,
                                dryingLocation: input.dryingLocation,
                            },
                        });
                        break;
                    }
                    case 'delete_harvest': {
                        const matchedDH = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'delete_harvest',
                            data: {
                                harvestId: matchedDH?.id || null,
                                harvestName: matchedDH?.batchId || input.harvestIdentifier,
                            },
                        });
                        break;
                    }
                    case 'update_harvest': {
                        const matchedUH = (request.context.harvests || []).find(
                            h => h.batchId.toLowerCase().includes(input.harvestIdentifier.toLowerCase()) ||
                                h.strain.toLowerCase().includes(input.harvestIdentifier.toLowerCase())
                        );
                        const updateFields: Record<string, any> = {
                            harvestId: matchedUH?.id || null,
                            harvestName: matchedUH?.batchId || input.harvestIdentifier,
                        };
                        if (input.strain) updateFields.strain = input.strain;
                        if (input.name) updateFields.name = input.name;
                        if (input.plantCount) updateFields.plantCount = input.plantCount;
                        if (input.dryingLocation) updateFields.dryingLocation = input.dryingLocation;
                        actions.push({ type: 'update_harvest', data: updateFields });
                        break;
                    }
                    case 'delete_batch': {
                        const matchedDB = request.context.existingEntries.find(
                            e => e.harvestName.toLowerCase().includes(input.entryIdentifier.toLowerCase()) ||
                                e.strain.toLowerCase().includes(input.entryIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'delete_batch',
                            data: {
                                entryId: matchedDB?.id || null,
                                entryName: matchedDB?.harvestName || input.entryIdentifier,
                            },
                        });
                        break;
                    }
                    case 'change_batch_status': {
                        const matchedBS = request.context.existingEntries.find(
                            e => e.harvestName.toLowerCase().includes(input.entryIdentifier.toLowerCase()) ||
                                e.strain.toLowerCase().includes(input.entryIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'change_batch_status',
                            data: {
                                entryId: matchedBS?.id || null,
                                entryName: matchedBS?.harvestName || input.entryIdentifier,
                                newStatus: input.newStatus,
                            },
                        });
                        break;
                    }
                    case 'update_batch_weight': {
                        const matchedBW = request.context.existingEntries.find(
                            e => e.harvestName.toLowerCase().includes(input.entryIdentifier.toLowerCase()) ||
                                e.strain.toLowerCase().includes(input.entryIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'update_batch_weight',
                            data: {
                                entryId: matchedBW?.id || null,
                                entryName: matchedBW?.harvestName || input.entryIdentifier,
                                weightType: input.weightType,
                                value: input.value,
                            },
                        });
                        break;
                    }
                    case 'submit_session':
                        actions.push({ type: 'submit_session', data: {} });
                        break;
                    case 'remove_trimmer': {
                        const matchedRT = request.context.existingEntries.find(
                            e => e.harvestName.toLowerCase().includes(input.entryIdentifier.toLowerCase()) ||
                                e.strain.toLowerCase().includes(input.entryIdentifier.toLowerCase())
                        );
                        actions.push({
                            type: 'remove_trimmer',
                            data: {
                                entryId: matchedRT?.id || null,
                                entryName: matchedRT?.harvestName || input.entryIdentifier,
                                trimmerName: input.trimmerName,
                            },
                        });
                        break;
                    }
                    case 'update_trimmer_profile': {
                        const matchedUTP = request.context.trimmerProfiles.find(
                            p => p.name.toLowerCase().includes(input.profileName.toLowerCase())
                        );
                        actions.push({
                            type: 'update_trimmer_profile',
                            data: {
                                profileId: matchedUTP?.id || null,
                                profileName: matchedUTP?.name || input.profileName,
                                name: input.name,
                                role: input.role,
                                email: input.email,
                                status: input.status,
                            },
                        });
                        break;
                    }
                    case 'update_trimmer': {
                        const matchedUT = request.context.existingEntries.find(
                            e => e.harvestName.toLowerCase().includes(input.entryIdentifier.toLowerCase()) ||
                                e.strain.toLowerCase().includes(input.entryIdentifier.toLowerCase())
                        );
                        // Resolve trimmer by name within the matched entry
                        const matchedTrimmer = matchedUT?.trimmers?.find(
                            t => t.name.toLowerCase().includes(input.trimmerName.toLowerCase())
                        );
                        const updates: Record<string, any> = {};
                        if (input.startTime) updates.startTime = input.startTime;
                        if (input.endTime) updates.endTime = input.endTime;
                        if (input.tool) updates.tool = input.tool;
                        if (input.flowerWeight !== undefined) updates.flowerWeight = input.flowerWeight;
                        if (input.shakeWeight !== undefined) updates.shakeWeight = input.shakeWeight;
                        if (input.trimWeight !== undefined) updates.trimWeight = input.trimWeight;
                        if (input.wasteWeight !== undefined) updates.wasteWeight = input.wasteWeight;
                        actions.push({
                            type: 'update_trimmer',
                            data: {
                                entryId: matchedUT?.id || null,
                                entryName: matchedUT?.harvestName || input.entryIdentifier,
                                trimmerId: matchedTrimmer?.id || null,
                                trimmerName: matchedTrimmer?.name || input.trimmerName,
                                updates,
                            },
                        });
                        break;
                    }
                    // ── find_plants (PR #1 stub) ──
                    // Runs a query against plants/plant_batches and emits a
                    // synthetic ProposedAction of type find_plants_result for
                    // the frontend to surface as a read-only side card. In
                    // PR #2 (multi-turn agent loop) this becomes a true
                    // tool_result the agent reasons about before the next
                    // action in the same turn.
                    case 'find_plants': {
                        try {
                            const contamFilter: string[] = Array.isArray(input.contaminants) ? input.contaminants : [];
                            const strainLike = input.strainName ? `%${String(input.strainName).toLowerCase()}%` : null;
                            const roomLike = input.roomName ? `%${String(input.roomName).toLowerCase()}%` : null;
                            const phase = typeof input.phase === 'string' ? input.phase : null;
                            const minHealth = typeof input.minHealth === 'number' ? input.minHealth : null;
                            const maxHealth = typeof input.maxHealth === 'number' ? input.maxHealth : null;
                            const entityFilter = input.entity === 'plant' || input.entity === 'batch' ? input.entity : null;

                            type PlantRow = { id: string; label: string; strain_name: string; room_name: string | null; growth_phase: string; plant_health: number; contaminants: string[] };
                            type BatchRow = { id: string; name: string; strain_name: string; room_name: string | null; batch_type: string | null; untracked_count: number; plant_health: number; contaminants: string[] };

                            const matchedPlants: PlantRow[] = [];
                            const matchedBatches: BatchRow[] = [];

                            if (entityFilter !== 'batch') {
                                const { rows } = await sql`
                                    SELECT p.id, p.label, p.strain_name, r.name AS room_name,
                                           p.growth_phase, p.plant_health, p.contaminants
                                    FROM plants p
                                    LEFT JOIN rooms r ON r.id = p.room_id
                                    WHERE p.company_id = ${authContext.companyId}
                                      AND (${strainLike}::text IS NULL OR LOWER(p.strain_name) LIKE ${strainLike}::text)
                                      AND (${roomLike}::text IS NULL OR LOWER(r.name) LIKE ${roomLike}::text)
                                      AND (${phase}::text IS NULL OR p.growth_phase = ${phase}::text)
                                      AND (${minHealth}::int IS NULL OR p.plant_health >= ${minHealth}::int)
                                      AND (${maxHealth}::int IS NULL OR p.plant_health <= ${maxHealth}::int)
                                      AND (${contamFilter.length === 0} OR p.contaminants && ${contamFilter}::text[])
                                    ORDER BY p.strain_name, r.name, p.label
                                    LIMIT 50
                                `;
                                matchedPlants.push(...(rows as PlantRow[]));
                            }

                            if (entityFilter !== 'plant') {
                                const { rows } = await sql`
                                    SELECT pb.id, pb.name, pb.strain_name, r.name AS room_name,
                                           pb.batch_type, pb.untracked_count, pb.plant_health, pb.contaminants
                                    FROM plant_batches pb
                                    LEFT JOIN rooms r ON r.id = pb.room_id
                                    WHERE pb.company_id = ${authContext.companyId}
                                      AND (${strainLike}::text IS NULL OR LOWER(pb.strain_name) LIKE ${strainLike}::text)
                                      AND (${roomLike}::text IS NULL OR LOWER(r.name) LIKE ${roomLike}::text)
                                      AND (${minHealth}::int IS NULL OR pb.plant_health >= ${minHealth}::int)
                                      AND (${maxHealth}::int IS NULL OR pb.plant_health <= ${maxHealth}::int)
                                      AND (${contamFilter.length === 0} OR pb.contaminants && ${contamFilter}::text[])
                                    ORDER BY pb.strain_name, r.name, pb.name
                                    LIMIT 50
                                `;
                                matchedBatches.push(...(rows as BatchRow[]));
                            }

                            actions.push({
                                type: 'find_plants_result',
                                data: {
                                    query: {
                                        strainName: input.strainName || null,
                                        roomName: input.roomName || null,
                                        phase: phase,
                                        contaminants: contamFilter,
                                        minHealth: minHealth,
                                        maxHealth: maxHealth,
                                        entity: entityFilter,
                                    },
                                    plants: matchedPlants.map(p => ({
                                        id: p.id,
                                        label: p.label,
                                        strain: p.strain_name,
                                        room: p.room_name,
                                        phase: p.growth_phase,
                                        health: p.plant_health,
                                        contaminants: p.contaminants,
                                    })),
                                    batches: matchedBatches.map(b => ({
                                        id: b.id,
                                        name: b.name,
                                        strain: b.strain_name,
                                        room: b.room_name,
                                        batchType: b.batch_type,
                                        count: b.untracked_count,
                                        health: b.plant_health,
                                        contaminants: b.contaminants,
                                    })),
                                    totalMatches: matchedPlants.length + matchedBatches.length,
                                },
                            });
                        } catch (err) {
                            console.error('find_plants failed:', err);
                            actions.push({
                                type: 'find_plants_result',
                                data: { query: input, plants: [], batches: [], totalMatches: 0, error: 'lookup failed' },
                            });
                        }
                        break;
                    }
                    // ── UNIFIED `plants` dispatcher (PR #1 tool collapse) ──
                    // Routes by input.action into the same ProposedAction
                    // shapes the legacy plant tools produced, so the frontend
                    // actionExecutor needs no changes. The LLM-facing surface
                    // shrinks from 5 tools to 1; the internal action types
                    // stay stable for persisted chat history.
                    case 'plants': {
                        const action = input.action;
                        switch (action) {
                            case 'update_health': {
                                actions.push({
                                    type: 'update_plant_health',
                                    data: {
                                        plantIds: input.plantIds || [],
                                        entityType: input.entity === 'batch' ? 'plantbatches' : 'plants',
                                        roomName: input.sourceRoomName || input.roomName,
                                        strain: input.strainName,
                                        health: input.health,
                                        contaminants: input.contaminants || [],
                                        note: input.note || '',
                                    },
                                });
                                break;
                            }
                            case 'create': {
                                const batchType = input.batchType || 'clone';
                                // New plantings default to nursery batches. Only flip to individual plants
                                // when the LLM explicitly picks entity=plant AND omits a clone/seed batchType.
                                const plantingType = input.entity === 'plant' && !input.batchType
                                    ? 'plant'
                                    : 'batch';

                                // If plannedFor is set, this is a scheduled planting — create a human task
                                // with onCompleteAction instead of committing immediately. This is the
                                // "planning is status, not a mode" pattern from the refactor plan.
                                if (input.plannedFor) {
                                    actions.push({
                                        type: 'create_human_task',
                                        data: {
                                            title: `Plant ${input.count || ''} ${input.strainName || ''} ${batchType === 'seed' ? 'seeds' : 'clones'}`.trim().replace(/\s+/g, ' '),
                                            description: `Scheduled planting: ${input.count} ${input.strainName} in ${input.roomName}`,
                                            priority: 'medium',
                                            category: 'cultivation',
                                            dueDate: input.plannedFor,
                                            location: input.roomName,
                                            onCompleteAction: {
                                                type: 'create_planting',
                                                data: {
                                                    plantingType,
                                                    strainName: input.strainName,
                                                    roomName: input.roomName,
                                                    count: input.count,
                                                    batchType,
                                                    batchName: input.batchName || '',
                                                    growthPhase: input.growthPhase || 'vegetative',
                                                    labelPrefix: input.labelPrefix || '',
                                                },
                                            },
                                        },
                                    });
                                } else {
                                    actions.push({
                                        type: 'create_planting',
                                        data: {
                                            plantingType,
                                            strainName: input.strainName,
                                            roomName: input.roomName,
                                            count: input.count,
                                            batchType,
                                            batchName: input.batchName || '',
                                            growthPhase: input.growthPhase || 'vegetative',
                                            labelPrefix: input.labelPrefix || '',
                                        },
                                    });
                                }
                                break;
                            }
                            case 'move': {
                                actions.push({
                                    type: 'move_plants',
                                    data: {
                                        plantIds: input.plantBatchIds || input.plantIds || [],
                                        entityType: input.entity === 'batch' ? 'plantbatches' : 'plants',
                                        targetRoomName: input.targetRoomName,
                                        strain: input.strainName,
                                        sourceRoomName: input.sourceRoomName,
                                    },
                                });
                                break;
                            }
                            case 'change_phase': {
                                actions.push({
                                    type: 'change_plant_phase',
                                    data: {
                                        plantIds: input.plantIds || [],
                                        targetPhase: input.targetPhase,
                                        targetRoomName: input.targetRoomName,
                                        strain: input.strainName,
                                        sourceRoomName: input.sourceRoomName,
                                    },
                                });
                                break;
                            }
                            case 'destroy': {
                                actions.push({
                                    type: 'destroy_plants',
                                    data: {
                                        plantIds: input.plantBatchIds || input.plantIds || [],
                                        entityType: input.entity === 'batch' ? 'plantbatches' : 'plants',
                                        strain: input.strainName,
                                        roomName: input.sourceRoomName || input.roomName,
                                    },
                                });
                                break;
                            }
                            default:
                                // Unknown action — drop silently. The LLM shouldn't emit this.
                                break;
                        }
                        break;
                    }
                    case 'update_plant_health': {
                        // Plant IDs will be resolved at execution time via room map lookup
                        actions.push({
                            type: 'update_plant_health',
                            data: {
                                plantIds: [],
                                entityType: 'plants',
                                roomName: input.roomName || input.plantIdentifier,
                                strain: input.plantIdentifier,
                                health: input.health,
                                contaminants: input.contaminants || [],
                                note: input.note || '',
                            },
                        });
                        break;
                    }
                    case 'create_planting': {
                        const batchType = input.batchType || 'clone';
                        // New plantings always start as nursery batches (clones/seeds)
                        const plantingType = batchType === 'clone' || batchType === 'seed' || batchType === 'tissue_culture' ? 'batch' : (input.type || 'batch');
                        actions.push({
                            type: 'create_planting',
                            data: {
                                plantingType,
                                strainName: input.strainName,
                                roomName: input.roomName,
                                count: input.count,
                                batchType,
                                batchName: input.batchName || '',
                                growthPhase: input.growthPhase || 'vegetative',
                                labelPrefix: input.labelPrefix || '',
                            },
                        });
                        break;
                    }
                    case 'move_plants':
                        actions.push({
                            type: 'move_plants',
                            data: {
                                plantIds: input.plantIds || [],
                                entityType: input.entityType || 'plants',
                                targetRoomName: input.targetRoomName,
                                strain: input.strain,
                                sourceRoomName: input.sourceRoomName,
                            },
                        });
                        break;
                    case 'change_plant_phase':
                        actions.push({
                            type: 'change_plant_phase',
                            data: {
                                plantIds: input.plantIds || [],
                                targetPhase: input.targetPhase,
                                targetRoomName: input.targetRoomName,
                                strain: input.strain,
                                sourceRoomName: input.sourceRoomName,
                            },
                        });
                        break;
                    case 'destroy_plants':
                        actions.push({
                            type: 'destroy_plants',
                            data: {
                                plantIds: input.plantIds || [],
                                entityType: input.entityType || 'plants',
                                strain: input.strain,
                                roomName: input.roomName,
                            },
                        });
                        break;
                    case 'convert_to_trim':
                        actions.push({
                            type: 'convert_to_trim',
                            data: {
                                allocationId: input.allocationId,
                                harvestIdentifier: input.harvestIdentifier,
                            },
                        });
                        break;
                    case 'create_strain':
                        actions.push({
                            type: 'create_strain',
                            data: { name: input.name },
                        });
                        break;
                    case 'delete_strain': {
                        // Resolve strain name to ID if needed (via strains in context)
                        actions.push({
                            type: 'delete_strain',
                            data: {
                                strainId: input.strainId,
                                strainName: input.strainName,
                            },
                        });
                        break;
                    }
                    case 'create_license':
                        actions.push({
                            type: 'create_license',
                            data: {
                                licenseNumber: input.licenseNumber,
                                label: input.label,
                            },
                        });
                        break;
                    case 'update_license':
                        actions.push({
                            type: 'update_license',
                            data: {
                                licenseNumber: input.licenseNumber,
                                label: input.label,
                            },
                        });
                        break;
                    case 'create_room':
                        actions.push({
                            type: 'create_room',
                            data: {
                                name: input.name,
                                roomType: input.roomType,
                                capacity: input.capacity,
                                squareFootage: input.squareFootage,
                                notes: input.notes,
                            },
                        });
                        break;
                    case 'update_room':
                        actions.push({
                            type: 'update_room',
                            data: {
                                roomName: input.roomName,
                                name: input.name,
                                roomType: input.roomType,
                                capacity: input.capacity,
                                squareFootage: input.squareFootage,
                                notes: input.notes,
                            },
                        });
                        break;
                    case 'delete_room':
                        actions.push({
                            type: 'delete_room',
                            data: { roomName: input.roomName },
                        });
                        break;
                    case 'import_tags':
                        actions.push({
                            type: 'import_tags',
                            data: {
                                tagNumbers: input.tagNumbers || [],
                                tagType: input.tagType || 'plant',
                            },
                        });
                        break;
                    case 'assign_tag':
                        actions.push({
                            type: 'assign_tag',
                            data: {
                                tagNumber: input.tagNumber,
                                plantIdentifier: input.plantIdentifier,
                                roomName: input.roomName,
                            },
                        });
                        break;
                    case 'auto_assign_tags':
                        actions.push({
                            type: 'auto_assign_tags',
                            data: {
                                strain: input.strain,
                                roomName: input.roomName,
                                count: input.count,
                            },
                        });
                        break;
                    case 'create_packages':
                        for (const pkg of (input.packages || [])) {
                            actions.push({
                                type: 'create_package',
                                data: {
                                    label: pkg.label,
                                    packageType: pkg.packageType,
                                    strain: pkg.strain,
                                    licenseNumber: pkg.licenseNumber,
                                    quantity: pkg.quantity,
                                    wasteWeight: pkg.wasteWeight || 0,
                                    location: pkg.location,
                                    notes: pkg.notes,
                                },
                            });
                        }
                        break;
                    case 'update_package': {
                        // Resolve package by label
                        const { rows: matchPkgs } = await sql`
                            SELECT id, label FROM packages
                            WHERE company_id = ${authContext.companyId}
                              AND LOWER(label) = LOWER(${input.packageIdentifier || ''})
                              AND status != 'archived'
                            LIMIT 1
                        `;
                        const matchPkg = matchPkgs[0];
                        actions.push({
                            type: 'update_package',
                            data: {
                                label: matchPkg?.label || input.packageIdentifier,
                                packageId: matchPkg?.id || input.packageIdentifier,
                                status: input.status,
                                location: input.location,
                                labTestingState: input.labTestingState,
                                notes: input.notes,
                            },
                        });
                        break;
                    }
                    case 'finish_package': {
                        const { rows: finishPkgs } = await sql`
                            SELECT id, label FROM packages
                            WHERE company_id = ${authContext.companyId}
                              AND LOWER(label) = LOWER(${input.packageIdentifier || ''})
                              AND status != 'archived'
                            LIMIT 1
                        `;
                        const finishPkg = finishPkgs[0];
                        actions.push({
                            type: 'finish_package',
                            data: {
                                label: finishPkg?.label || input.packageIdentifier,
                                packageId: finishPkg?.id || input.packageIdentifier,
                            },
                        });
                        break;
                    }
                    case 'delete_package': {
                        const { rows: delPkgs } = await sql`
                            SELECT id, label FROM packages
                            WHERE company_id = ${authContext.companyId}
                              AND LOWER(label) = LOWER(${input.packageIdentifier || ''})
                              AND status != 'archived'
                            LIMIT 1
                        `;
                        const delPkg = delPkgs[0];
                        actions.push({
                            type: 'delete_package',
                            data: {
                                label: delPkg?.label || input.packageIdentifier,
                                packageId: delPkg?.id || input.packageIdentifier,
                            },
                        });
                        break;
                    }
                    // ── UNIFIED `extraction_run` dispatcher (PR #1 tool collapse) ──
                    // Single case routes all five actions. plan/start reuse
                    // the shared buildStartExtractionRunData helper. amend_inputs
                    // and cancel emit new internal action types that the
                    // frontend actionExecutor handles explicitly. record_yield
                    // translates to the legacy record_extraction ProposedAction
                    // shape so persisted history stays compatible.
                    case 'extraction_run': {
                        const action = input.action;
                        if (action === 'plan' || action === 'start') {
                            const data = await buildStartExtractionRunData({
                                inputs: input.inputs,
                                templateIdentifier: input.templateIdentifier,
                                strain: input.strain,
                                targetProduct: input.targetProduct,
                                runName: input.runName,
                                plannedStart: input.plannedStart,
                                startImmediately: action === 'start',
                                notes: input.notes,
                            });
                            actions.push({ type: 'start_extraction_run', data });
                            break;
                        }

                        if (action === 'amend_inputs') {
                            const ref = await resolveExtractionRunRef(input.runId, input.runIdentifier);
                            if (!ref) {
                                // No matching run — fall back to creating a new one so the input
                                // isn't lost. The frontend will show a "couldn't find the run you
                                // meant, created a new one" hint via the label.
                                const data = await buildStartExtractionRunData({
                                    inputs: input.inputs,
                                    templateIdentifier: input.templateIdentifier,
                                    strain: input.strain,
                                    targetProduct: input.targetProduct,
                                    runName: input.runName,
                                    plannedStart: input.plannedStart,
                                    startImmediately: true,
                                    notes: input.notes,
                                });
                                actions.push({ type: 'start_extraction_run', data });
                                break;
                            }
                            // Resolve the new inputs via the same helper so catalog + source
                            // package lookup is consistent with new-run creation. We reuse
                            // buildStartExtractionRunData then lift out just the inputs piece.
                            const resolvedData = await buildStartExtractionRunData({
                                inputs: input.inputs,
                                templateIdentifier: input.templateIdentifier || 'amend',
                                strain: input.strain || ref.strain || '',
                                startImmediately: true,
                            });
                            actions.push({
                                type: 'amend_extraction_run_inputs',
                                data: {
                                    runId: ref.id,
                                    runName: ref.name,
                                    addedInputs: resolvedData.inputs,
                                    addedSourcePackageIds: resolvedData.sourcePackageIds,
                                    addedSourcePackageQuantities: resolvedData.sourcePackageQuantities,
                                },
                            });
                            break;
                        }

                        if (action === 'record_yield') {
                            // Map unified tool shape to the legacy record_extraction ProposedAction.
                            // Most of the resolution logic lives on the frontend (source package
                            // lookup via recordExtraction API), so here we just pass the fields through.
                            const ref = await resolveExtractionRunRef(input.runId, input.runIdentifier);
                            // Look up source package by the resolved run's strain (if available)
                            // or the input strain, plus the input package type. Mirrors the legacy
                            // record_extraction case behavior.
                            const yieldStrain = input.strain || ref?.strain || '';
                            // Infer inputPackageType from inputs[] if provided, else from record_yield-specific field
                            const inputPkgType = Array.isArray(input.inputs) && input.inputs[0]?.packageType
                                ? input.inputs[0].packageType
                                : (input.inputPackageType || '');
                            const { rows: srcPkgs } = await sql`
                                SELECT id, label, quantity, license_number
                                FROM packages
                                WHERE company_id = ${authContext.companyId}
                                  AND package_type = ${inputPkgType}
                                  AND LOWER(strain) = LOWER(${yieldStrain})
                                  AND status = 'active'
                                ORDER BY created_at DESC
                                LIMIT 1
                            `;
                            const srcPkg = srcPkgs[0];
                            const autoLabel = input.outputLabel ||
                                `${yieldStrain}-${(input.outputPackageType || '').replace('_', '-').toUpperCase()}-${new Date().toISOString().slice(0, 10)}`;
                            const inputQty = Array.isArray(input.inputs) && typeof input.inputs[0]?.quantity === 'number'
                                ? input.inputs[0].quantity
                                : (srcPkg ? parseFloat(srcPkg.quantity) : null);
                            actions.push({
                                type: 'record_extraction',
                                data: {
                                    strain: yieldStrain,
                                    sourcePackageId: srcPkg?.id || null,
                                    sourcePackageLabel: srcPkg?.label || `${yieldStrain} ${inputPkgType}`,
                                    inputPackageType: inputPkgType,
                                    inputQuantity: inputQty,
                                    outputPackageType: input.outputPackageType,
                                    outputQuantity: input.outputQuantity || null,
                                    outputLabel: autoLabel,
                                    licenseNumber: input.licenseNumber || srcPkg?.license_number || null,
                                    wasteWeight: input.wasteWeight || 0,
                                    notes: input.notes || null,
                                    runId: ref?.id || null,
                                },
                            });
                            break;
                        }

                        if (action === 'cancel') {
                            const ref = await resolveExtractionRunRef(input.runId, input.runIdentifier);
                            if (!ref) break; // Nothing to cancel — drop silently.
                            actions.push({
                                type: 'cancel_extraction_run',
                                data: {
                                    runId: ref.id,
                                    runName: ref.name,
                                },
                            });
                            break;
                        }

                        // Unknown action — drop silently.
                        break;
                    }
                    case 'record_extraction': {
                        // Find source package by strain + type
                        const { rows: srcPkgs } = await sql`
                            SELECT id, label, quantity, license_number
                            FROM packages
                            WHERE company_id = ${authContext.companyId}
                              AND package_type = ${input.inputPackageType}
                              AND LOWER(strain) = LOWER(${input.strain || ''})
                              AND status = 'active'
                            ORDER BY created_at DESC
                            LIMIT 1
                        `;
                        const srcPkg = srcPkgs[0];
                        const autoLabel = input.outputLabel ||
                            `${input.strain}-${(input.outputPackageType || '').replace('_', '-').toUpperCase()}-${new Date().toISOString().slice(0, 10)}`;

                        // Resolve inputQuantity: AI value > source package qty > outputQuantity fallback
                        const resolvedInputQty = input.inputQuantity
                            || (srcPkg ? parseFloat(srcPkg.quantity) : null)
                            || input.outputQuantity
                            || null;

                        actions.push({
                            type: 'record_extraction',
                            data: {
                                strain: input.strain,
                                sourcePackageId: srcPkg?.id || null,
                                sourcePackageLabel: srcPkg?.label || `${input.strain} ${input.inputPackageType}`,
                                inputPackageType: input.inputPackageType,
                                inputQuantity: resolvedInputQty,
                                outputPackageType: input.outputPackageType,
                                outputQuantity: input.outputQuantity || null,
                                outputLabel: autoLabel,
                                licenseNumber: input.licenseNumber || srcPkg?.license_number || null,
                                wasteWeight: input.wasteWeight || 0,
                                notes: input.notes || null,
                            },
                        });
                        break;
                    }
                    case 'start_extraction_run': {
                        const data = await buildStartExtractionRunData({
                            inputs: input.inputs,
                            templateIdentifier: input.templateIdentifier,
                            strain: input.strain,
                            targetProduct: input.targetProduct,
                            runName: input.runName,
                            plannedStart: input.plannedStart,
                            startImmediately: input.startImmediately,
                            notes: input.notes,
                        });
                        actions.push({ type: 'start_extraction_run', data });
                        break;
                    }
                    case 'create_human_tasks':
                        for (const task of (input.tasks || [])) {
                            const taskData: Record<string, any> = {
                                title: task.title,
                                description: task.description || '',
                                priority: task.priority || 'medium',
                                category: task.category || 'other',
                                dueDate: task.dueDate || undefined,
                                assignee: task.assignee || undefined,
                                location: task.location || undefined,
                            };
                            if (task.onCompleteAction) {
                                taskData.onCompleteAction = task.onCompleteAction;
                            }
                            actions.push({ type: 'create_human_task', data: taskData });
                        }
                        break;
                    case 'update_human_tasks':
                        for (const update of (input.updates || [])) {
                            // Resolve taskIdentifier to actual taskId via DB lookup
                            // (PR #2: humanTasks no longer pushed into context).
                            const matchedTask = await resolveHumanTaskRef(update.taskId, update.taskIdentifier);
                            if (matchedTask) {
                                const updates: Record<string, any> = { taskId: matchedTask.id, taskTitle: matchedTask.title };
                                if (update.status) updates.status = update.status;
                                if (update.title) updates.title = update.title;
                                if (update.description) updates.description = update.description;
                                if (update.priority) updates.priority = update.priority;
                                if (update.category) updates.category = update.category;
                                if (update.dueDate) updates.dueDate = update.dueDate;
                                if (update.assignee) updates.assignee = update.assignee;
                                if (update.location) updates.location = update.location;
                                actions.push({ type: 'update_human_task', data: updates });
                            }
                        }
                        break;
                    case 'delete_human_tasks':
                        for (const deletion of (input.deletions || [])) {
                            const matchedDel = await resolveHumanTaskRef(deletion.taskId, deletion.taskIdentifier);
                            if (matchedDel) {
                                actions.push({
                                    type: 'delete_human_task',
                                    data: { taskId: matchedDel.id, taskTitle: matchedDel.title },
                                });
                            }
                        }
                        break;
                }

                // Mutation tool_use blocks that reached this point have been
                // dispatched via the switch above and pushed into actions[].
                // Emit a stub tool_result so the agent can continue reasoning
                // in the next turn (e.g. chain: find_plants → propose move →
                // find_human_tasks → propose follow-up task). Without this,
                // the agent sees no response for its mutation call and may
                // re-propose or get confused about turn state.
                if (block.id) {
                    toolResultsThisTurn.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify({
                            status: 'proposed',
                            tool: block.name,
                            note: 'Queued for user confirmation. You can continue reasoning or call more tools.',
                        }),
                    });
                }
            }
        }

            // ── Turn termination ──
            // Stop the loop if Claude indicated it's done (any stop_reason
            // other than 'tool_use' means the turn is terminal). Otherwise
            // append the assistant response + collected tool_results to
            // messages[] and loop to the next turn.
            if (response.stop_reason !== 'tool_use') {
                break;
            }
            if (turn === MAX_AGENT_TURNS - 1) {
                console.warn(`[ai-parse] agent loop hit turn cap (${MAX_AGENT_TURNS}); truncating with ${actions.length} action(s) collected`);
                break;
            }
            // Append the full assistant response (preserving tool_use blocks)
            // and the collected tool_result blocks for the next turn.
            messages.push({ role: 'assistant', content: response.content as unknown as AnthropicContentBlock[] });
            if (toolResultsThisTurn.length > 0) {
                messages.push({ role: 'user', content: toolResultsThisTurn });
            }
        }

        if (!assistantMessage && actions.length > 0) {
            assistantMessage = `I've prepared ${actions.length} action${actions.length > 1 ? 's' : ''} for you to review.`;
        }
        }; // end runAgentLoop

        // ── Streaming branch (PR #3) ──
        // When the client requested streaming, wrap the agent loop in a
        // ReadableStream and emit NDJSON events:
        //   {type: "text_delta", text: "..."}   — incremental agent text
        //   {type: "done", actions, toolResults, message}  — final payload
        //   {type: "error", error}               — caught exception
        // Each event is one line of JSON (no SSE framing — the client
        // parses by newline delimiters).
        //
        // The stream is returned from the handler synchronously while its
        // start() method continues running the loop in the background.
        // Netlify's stream() wrapper pipes the body to the client as data
        // is enqueued.
        if (request.streaming) {
            const encoder = new TextEncoder();
            const bodyStream = new ReadableStream<Uint8Array>({
                async start(controller) {
                    const write = (obj: unknown): void => {
                        try {
                            controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
                        } catch (err) {
                            // Client disconnected or controller already closed — swallow.
                            console.warn('[ai-parse stream] enqueue failed:', err);
                        }
                    };
                    // Hook up the text delta writer BEFORE running the loop
                    // so consumeAnthropicStream forwards Anthropic's text
                    // deltas out to the client as they arrive.
                    onTextDelta = (delta: string): void => {
                        write({ type: 'text_delta', text: delta });
                    };
                    try {
                        await runAgentLoop();
                        write({
                            type: 'done',
                            actions,
                            toolResults,
                            message: assistantMessage,
                        });
                    } catch (err) {
                        console.error('[ai-parse stream] agent loop failed:', err);
                        captureError(err, { function: 'ai-parse', streaming: true });
                        write({
                            type: 'error',
                            error: err instanceof Error ? err.message : 'Failed to parse input',
                        });
                    } finally {
                        try { controller.close(); } catch { /* already closed */ }
                    }
                },
            });
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/x-ndjson',
                    'Cache-Control': 'no-cache',
                },
                body: bodyStream as unknown as string,
            };
        }

        // ── Non-streaming branch (existing behavior) ──
        await runAgentLoop();

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actions, toolResults, message: assistantMessage }),
        };
    } catch (error) {
        console.error('Error in ai-parse:', error);
        captureError(error, { function: 'ai-parse' });
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to parse input' }),
        };
    }
});

import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are an AI assistant for a cannabis cultivation and manufacturing application called Trim Tracker. Your job is to parse user input (natural language, voice transcripts, or CSV data) into structured actions for the application.

## Application Features (Automated Actions)

The application can automate these operations:
- **Trim Sessions**: A work session containing multiple batches. One active session at a time per company.
- **Batches (Trim Entries)**: Individual harvest batches within a session. Each has a harvest name, strain, license number, and start weight (in grams). Status can be 'active' or 'upcoming'.
- **Trimmers**: Workers assigned to batches. Each has a name, start time (HH:mm 24-hour format), and tool (scissors or machine).
- **Trimmer Profiles**: A company roster of available trimmers that can be assigned to batches.
- **Trimmer Updates**: Update an existing trimmer's start time, end time, tool (scissors/machine), and weights (flower, shake, trim, waste) on an active batch.
- **Harvests**: Pre-trim records tracking plant harvest through drying. Each has a batch ID, strain, license number, wet weight, waste, and allocations (flower for dry trim, frozen for fresh frozen, or both).
- **Plant Health**: Update plant health scores (0-100) and contaminant flags for plants or plant batches. Plants/batches are identified by strain and room.
- **Plantings**: Create new plant batches (clones/seeds in nursery) or individual plants (veg/flower). Requires strain, room, and count.
- **Plant Actions**: Move plants between rooms, change growth phase (vegetative→flowering→harvested), or destroy plants. Works on both individual plants and batches.
- **Convert to Trim**: Convert a flower harvest allocation into a trim entry for processing.
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

**HYBRID TASKS**: Many operations involve both physical work AND a system write. For example, "cut 50 clones of Wedding Cake" requires a human to physically cut the clones, but then the system needs a \`create_planting\` action to track them. For these, create a human task AND include an \`onCompleteAction\` — a system action that will execute when the person marks the task as completed. The \`onCompleteAction\` should be a JSON object with \`type\` and \`data\` matching the corresponding automated action tool schema. Examples of hybrid tasks:
- "Cut 50 clones" → human task + onCompleteAction: create_planting (batch, 50 clones)
- "Move plants to flower room" → human task + onCompleteAction: move_plants
- "Harvest the Gelato" → human task + onCompleteAction: change_plant_phase (harvested)
- "Weigh the harvest" → human task + onCompleteAction: record_wet_weight

## Harvest Day Voice Workflow

When the user is on the Harvest Day cockpit (screenContext mentions "Harvest Day"), they are weighing plants at the scale and speaking weights aloud. Parse their speech into plant weight entries:

- "Plant one 342, two 298, three 415" → record_plant_weight with weights array [{plantNumber:1, weight:342}, {plantNumber:2, weight:298}, {plantNumber:3, weight:415}]
- "342... 298... 415" (just numbers) → record_plant_weight with weights array (omit plantNumber, auto-assigned)
- "Next one is 1200 grams" → record_plant_weight with one weight entry
- If they mention contamination alongside weights ("three had some PM, 415 grams" or "that one had mold"), ALSO call flag_contamination in addition to record_plant_weight. Both tools in one response.
- "PM" = powdery_mildew, "mold" or "bud rot" = bud_rot, "bugs" or "insects" = insects
- When only one harvest is active in the cockpit, you can use its strain or batchId as the harvestIdentifier without the user naming it explicitly.

## Extraction / Concentrate Production Workflow

You understand the full ice water hash and rosin extraction pipeline. The stages are:

1. **Fresh Frozen** → stored in freezer as packages (already tracked)
2. **Wash** (ice water extraction) → produces **Bubble Hash** from Fresh Frozen input
3. **Press** (heat/pressure) → produces **Rosin** from Bubble Hash input
4. **Cart Fill** → produces **Rosin Carts** from Rosin input

When the user describes extraction work, use the \`record_extraction\` tool. Key vocabulary mappings:
- "pulled from the freezer", "pulled for a wash", "washing" → inputPackageType: fresh_frozen, outputPackageType: bubble_hash
- "wash yielded", "hash came out", "bubble hash" → outputPackageType: bubble_hash
- "pressed", "pressing", "press run" → inputPackageType: bubble_hash, outputPackageType: rosin
- "filled carts", "cart fill", "rosin carts" → inputPackageType: rosin, outputPackageType: rosin_cart
- "yield", "yielded", "got", "came out to" → the outputQuantity

The user often works in large increments of fresh frozen (e.g. 17,000g). They may report results for multiple strains in one utterance (e.g. "gummy worms was 450, blackberry was 600, mad fruit was 525"). Create separate \`record_extraction\` calls for each strain.

If the user mentions pulling material but does NOT yet have the yield (e.g. "I pulled 17K blackberry for a wash"), still create the record_extraction — just omit outputQuantity. This records the input consumption. They will report the yield later.

**Reporting yield on an existing run**: When the user reports output (e.g. "we got 79 grams of bubble hash from the white fire OG"), set ONLY the outputQuantity and outputPackageType. Do NOT set inputQuantity — the input was already recorded when the run started. The yield quantity is always the OUTPUT, not the input.

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
- If a user mentions a strain that doesn't exist in the available strains list, AUTOMATICALLY add a \`create_strain\` action before any actions that reference it. Don't just warn — create the strain so the workflow can proceed.
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

## Screen Context Awareness

The user's current screen context will be provided in the application state. This tells you what module, page, or view the user is currently looking at. **Always use screen context to disambiguate user intent.** For example:
- If the user is on the **Plant Map** and says "move the ice cream cake", they mean move the **plants** (not a harvest record).
- If the user is on the **Trim Session** view and says "add OG Kush", they mean add a **batch** to the session.
- If the user is on the **Harvest Tracker** and says "move ice cream cake to flower room 2", they mean move a **harvest** drying location.

The screen context is your strongest signal for what the user intends. Prefer it over guessing. If the screen context conflicts with your interpretation, trust the screen context. If the user's request is still ambiguous even with screen context, ask a brief clarifying question rather than assuming.

## Response Style
- **Be action-first.** When the user asks you to do something, produce the actions immediately — don't ask for confirmation or list options. The user sees a preview and can edit or cancel.
- **Ask for missing required data.** If the user's request is missing information needed for complete, accurate data entry (strain, weight, license, quantity, etc.), ask a brief clarifying question before generating actions. Do NOT guess or leave required fields empty — compliance depends on complete records. For example: if someone says "I pressed some hash into rosin" but omits the strain and quantities, ask "Which strain, how much hash did you press, and what was the rosin yield?" If only one field is missing, ask for just that field. If you can confidently infer a value from context (e.g., strain from the only active package), fill it in and mention your assumption.
- Keep text responses to 1-3 short sentences. Briefly describe what you're setting up, but don't narrate every field or repeat information visible in the action preview.
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
        name: 'delete_trimmer_profile',
        description: 'Remove a trimmer from the company roster.',
        input_schema: {
            type: 'object' as const,
            properties: {
                profileName: { type: 'string', description: 'Name of the trimmer profile to delete' },
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
    {
        name: 'update_plant_health',
        description: 'Update the health score and/or contaminants for plants or plant batches. Health is 0-100 (100 = perfectly healthy). Contaminants are from a known list. Identify plants by strain and room name from the plant map context.',
        input_schema: {
            type: 'object' as const,
            properties: {
                plantIdentifier: { type: 'string', description: 'Strain name or room name to identify which plants to update' },
                roomName: { type: 'string', description: 'Room name where the plants are located' },
                health: { type: 'number', description: 'Health score from 0 to 100 (100 = healthy)' },
                contaminants: {
                    type: 'array',
                    items: { type: 'string', enum: ['Spider mites', 'Thrips', 'Whiteflies', 'Aphids', 'Fungus gnats', 'Powdery mildew', 'Botrytis', 'Fusarium', 'Verticillium', 'Tobacco mosaic virus', 'Root aphids', 'Hops latent viroid', 'Other'] },
                    description: 'List of contaminants detected on the plants',
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
        description: 'Create new plants or plant batches. Use "batch" for nursery clones/seeds (untracked group). Use "plant" for individually tracked plants in veg or flower rooms.',
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
        description: 'Move plants or plant batches to a different room.',
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
        description: 'Change the growth phase of individual plants (e.g. vegetative to flowering, or mark as harvested/destroyed). Only works on individual plants, not batches.',
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
        description: 'Destroy/remove plants or plant batches from the system.',
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
        name: 'delete_license',
        description: 'Remove a license from the system.',
        input_schema: {
            type: 'object' as const,
            properties: {
                licenseId: { type: 'string', description: 'License ID to delete' },
                licenseNumber: { type: 'string', description: 'License number to match if ID not known' },
            },
            required: [],
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
        description: 'Assign a specific tag to a plant or batch.',
        input_schema: {
            type: 'object' as const,
            properties: {
                tagNumber: { type: 'string', description: 'The tag number to assign' },
                plantIdentifier: { type: 'string', description: 'Plant label or strain to identify the target' },
                roomName: { type: 'string', description: 'Room to narrow down the target plant' },
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
    {
        name: 'record_extraction',
        description: `Record an extraction/processing step. This handles all stages of concentrate production:
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
                    enum: ['fresh_frozen', 'bubble_hash', 'rosin'],
                    description: 'Type of the source/input material being consumed',
                },
                inputQuantity: {
                    type: 'number',
                    description: 'Grams of input material consumed. If not stated, assume the full source package quantity.',
                },
                outputPackageType: {
                    type: 'string',
                    enum: ['bubble_hash', 'rosin', 'rosin_cart'],
                    description: 'Type of output product created',
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
];

interface AIParseRequest {
    message?: string;
    csvData?: string;
    transcriptChunks?: string[];
    history?: Array<{ role: string; content: string }>;
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

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const authContext = await resolveContext(event.headers.authorization);
        if (!authContext) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const request: AIParseRequest = JSON.parse(event.body || '{}');

        if (!request.message && !request.csvData && !request.transcriptChunks?.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Either message, csvData, or transcriptChunks is required' }) };
        }

        // Build user message with context
        let userMessage = '';

        if (request.transcriptChunks?.length) {
            const fullTranscript = request.transcriptChunks.join('\n');
            userMessage = `Analyze this voice transcript of someone describing their cannabis operations. Extract ALL actionable tasks you can identify — these might include creating sessions, adding batches, assigning trimmers, creating harvests, recording weights, moving harvests, or any other trackable operation. Be thorough — capture every actionable item mentioned, even if briefly. Here is the transcript:\n\n"${fullTranscript}"`;
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

        if (request.context.harvests && request.context.harvests.length > 0) {
            contextInfo.push(`- Harvests: ${request.context.harvests.map(h => `"${h.batchId}" / ${h.strain} [${h.status}] (ID: ${h.id})`).join(', ')}`);
        } else {
            contextInfo.push(`- Harvests: None`);
        }

        if (request.context.humanTasks && request.context.humanTasks.length > 0) {
            contextInfo.push(`- Human tasks: ${request.context.humanTasks.map(t => `"${t.title}" [${t.status}/${t.priority}] ${t.assignee ? `assigned to ${t.assignee}` : ''} ${t.location ? `@ ${t.location}` : ''} (ID: ${t.id})`).join(', ')}`);
        } else {
            contextInfo.push(`- Human tasks: None`);
        }

        if (request.context.plantMapSummary && request.context.plantMapSummary.length > 0) {
            contextInfo.push(`- Plant map: ${request.context.plantMapSummary.map(p => `${p.roomName}: ${p.strains.join(', ')} [${p.entityType}] health=${p.plantHealth}${p.contaminants.length ? ' contaminants: ' + p.contaminants.join(', ') : ''} (roomId: ${p.roomId}, plantIds: ${p.plantIds.join(',')})`).join('; ')}`);
        }

        if ((request.context as any).activeLicenseNumber) {
            contextInfo.push(`- Active license number: ${(request.context as any).activeLicenseNumber} (use this automatically for any new batches, harvests, extractions, and packages unless the user specifies a different one)`);
        }

        // Add packages context
        try {
            const { rows: pkgRows } = await sql`
                SELECT id, label, package_type, strain, license_number, quantity, status, lab_testing_state, location
                FROM packages WHERE company_id = ${authContext.companyId} AND status != 'archived'
                ORDER BY packaged_date DESC LIMIT 50
            `;
            if (pkgRows.length > 0) {
                contextInfo.push(`- Packages: ${pkgRows.map((p: any) => `${p.label} [${p.package_type}] ${p.strain} ${parseFloat(p.quantity)}g status=${p.status} lab=${p.lab_testing_state}${p.location ? ' @' + p.location : ''} (ID: ${p.id})`).join('; ')}`);
            } else {
                contextInfo.push(`- Packages: None`);
            }
        } catch { /* proceed without package context */ }

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

        userMessage += contextInfo.join('\n');

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('ANTHROPIC_API_KEY not set');
            return { statusCode: 500, body: JSON.stringify({ error: 'AI service not configured' }) };
        }

        // Build multi-turn messages from history, or single message
        let messages: Array<{ role: string; content: string }>;
        if (request.history && request.history.length > 1) {
            // Use history but replace the last user message with context-enriched version
            messages = request.history.slice(0, -1).map(m => ({
                role: m.role,
                content: m.content,
            }));
            messages.push({ role: 'user', content: userMessage });
        } else {
            messages = [{ role: 'user', content: userMessage }];
        }

        const apiResponse = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                system: SYSTEM_PROMPT,
                tools,
                messages,
            }),
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            console.error('Anthropic API error:', apiResponse.status, errText);
            return { statusCode: 502, body: JSON.stringify({ error: 'AI service error', detail: errText, status: apiResponse.status }) };
        }

        const response = await apiResponse.json();

        // Extract tool calls and text from response
        const actions: ProposedAction[] = [];
        let assistantMessage = '';

        for (const block of response.content) {
            if (block.type === 'text') {
                assistantMessage += block.text;
            } else if (block.type === 'tool_use') {
                const input = block.input as Record<string, any>;

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
                    case 'delete_trimmer_profile': {
                        const matchedDP = request.context.trimmerProfiles.find(
                            p => p.name.toLowerCase().includes(input.profileName.toLowerCase())
                        );
                        actions.push({
                            type: 'delete_trimmer_profile',
                            data: {
                                profileId: matchedDP?.id || null,
                                profileName: matchedDP?.name || input.profileName,
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
                    case 'delete_license':
                        actions.push({
                            type: 'delete_license',
                            data: {
                                licenseId: input.licenseId,
                                licenseNumber: input.licenseNumber,
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
                            // Resolve taskIdentifier to actual taskId
                            const matchedTask = (request.context.humanTasks || []).find(
                                t => update.taskId === t.id ||
                                    t.title.toLowerCase().includes(update.taskIdentifier.toLowerCase())
                            );
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
                            const matchedDel = (request.context.humanTasks || []).find(
                                t => deletion.taskId === t.id ||
                                    t.title.toLowerCase().includes(deletion.taskIdentifier.toLowerCase())
                            );
                            if (matchedDel) {
                                actions.push({
                                    type: 'delete_human_task',
                                    data: { taskId: matchedDel.id, taskTitle: matchedDel.title },
                                });
                            }
                        }
                        break;
                }
            }
        }

        if (!assistantMessage && actions.length > 0) {
            assistantMessage = `I've prepared ${actions.length} action${actions.length > 1 ? 's' : ''} for you to review.`;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actions, message: assistantMessage }),
        };
    } catch (error) {
        console.error('Error in ai-parse:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to parse input' }),
        };
    }
};

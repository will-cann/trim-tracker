import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are an AI assistant for a cannabis cultivation and manufacturing application called Trim Tracker. Your job is to parse user input (natural language, voice transcripts, or CSV data) into structured actions for the application.

## Application Features (Automated Actions)

The application can automate these operations:
- **Trim Sessions**: A work session containing multiple batches. One active session at a time per company.
- **Batches (Trim Entries)**: Individual harvest batches within a session. Each has a harvest name, strain, license number, and start weight (in grams). Status can be 'active' or 'upcoming'.
- **Trimmers**: Workers assigned to batches. Each has a name, start time (HH:mm 24-hour format), and tool (scissors or machine).
- **Trimmer Profiles**: A company roster of available trimmers that can be assigned to batches.
- **Harvests**: Pre-trim records tracking plant harvest through drying. Each has a batch ID, strain, license number, wet weight, waste, and allocations (flower for dry trim, frozen for fresh frozen, or both).

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
- For CSV data, intelligently map column headers to the appropriate fields regardless of exact naming conventions.
- For harvests, allocation can be "Flower" (dry trim), "Frozen" (fresh frozen), or "Both" (split). Default to "Flower" if not specified.
- Waste types include: powdery_mildew, bud_rot, insects, other (contamination) and stems, leaves (biomass).

## Rules for Human Tasks
- Use descriptive, actionable titles (e.g., "Check humidity in Dry Room 2" not "humidity check")
- Assign the correct category from the available options. Use "cultivation" for plant care tasks like feeding, transplanting, defoliation, topping, flushing, light adjustments, clone management, and watering. Use "harvest" only for tasks specifically about cutting, weighing, or processing harvested plant material.
- Default priority to "medium" unless urgency is clear from context
- If the user mentions a specific person, set them as the assignee
- If the user mentions a location/room, capture it in the location field
- If the user mentions a deadline or timeframe, set an appropriate dueDate

## Screen Context Awareness

The user's current screen context will be provided in the application state. This tells you what module, page, or view the user is currently looking at. **Always use screen context to disambiguate user intent.** For example:
- If the user is on the **Plant Map** and says "move the ice cream cake", they mean move the **plants** (not a harvest record).
- If the user is on the **Trim Session** view and says "add OG Kush", they mean add a **batch** to the session.
- If the user is on the **Harvest Tracker** and says "move ice cream cake to flower room 2", they mean move a **harvest** drying location.

The screen context is your strongest signal for what the user intends. Prefer it over guessing. If the screen context conflicts with your interpretation, trust the screen context. If the user's request is still ambiguous even with screen context, ask a brief clarifying question rather than assuming.

Be conversational in your text responses but always use tools to represent the structured data.`;

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
        existingEntries: Array<{ id: string; harvestName: string; strain: string; status: string }>;
        harvests?: Array<{ id: string; batchId: string; strain: string; status: string }>;
        humanTasks?: Array<{ id: string; title: string; status: string; priority: string; category: string; assignee?: string; location?: string }>;
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

        // Add context about current state
        const contextInfo = [
            `\n\nCurrent application state:`,
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
            contextInfo.push(`- Current batches: ${request.context.existingEntries.map(e => `"${e.harvestName}" / ${e.strain} [${e.status}] (ID: ${e.id})`).join(', ')}`);
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

        if ((request.context as any).activeLicenseNumber) {
            contextInfo.push(`- Active license number: ${(request.context as any).activeLicenseNumber} (use this automatically for any new batches or harvests unless the user specifies a different one)`);
        }

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
                    case 'create_human_tasks':
                        for (const task of (input.tasks || [])) {
                            actions.push({
                                type: 'create_human_task',
                                data: {
                                    title: task.title,
                                    description: task.description || '',
                                    priority: task.priority || 'medium',
                                    category: task.category || 'other',
                                    dueDate: task.dueDate || undefined,
                                    assignee: task.assignee || undefined,
                                    location: task.location || undefined,
                                },
                            });
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

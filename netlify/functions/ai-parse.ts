import { Handler } from '@netlify/functions';
import Anthropic from '@anthropic-ai/sdk';
import { resolveContext } from './utils/auth';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an AI assistant for a cannabis trim tracking application called Trim Tracker. Your job is to parse user input (natural language or CSV data) into structured actions for the application.

The application tracks:
- **Trim Sessions**: A work session containing multiple batches. One active session at a time per company.
- **Batches (Trim Entries)**: Individual harvest batches within a session. Each has a harvest name, strain, license number, and start weight (in grams). Status can be 'active' or 'upcoming'.
- **Trimmers**: Workers assigned to batches. Each has a name, start time (HH:mm 24-hour format), and tool (scissors or machine).
- **Trimmer Profiles**: A company roster of available trimmers that can be assigned to batches.

When the user provides information, use the available tools to create structured actions. Key rules:
- Match trimmer names to existing trimmer profiles when possible (fuzzy match is fine — "Maria" matches "Maria Garcia").
- Match batch references (by harvest name or strain) to existing entries when assigning trimmers.
- Default tool to "scissors" if not specified.
- Default status to "upcoming" for new batches added to existing sessions.
- If creating a new session, the first batch should have status "active".
- Start weight should be in grams. Convert if user specifies other units (e.g., "1 lb" = 453.6g).
- Start times should be in HH:mm 24-hour format. Convert from natural language (e.g., "8am" = "08:00", "2:30pm" = "14:30").
- If a user mentions trimmers who don't exist in the roster, suggest adding them as new profiles first.
- For CSV data, intelligently map column headers to the appropriate fields regardless of exact naming conventions.

Be conversational in your text responses but always use tools to represent the structured data.`;

const tools: Anthropic.Tool[] = [
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
];

interface AIParseRequest {
    message?: string;
    csvData?: string;
    context: {
        hasActiveSession: boolean;
        sessionId?: string;
        trimmerProfiles: Array<{ id: string; name: string }>;
        existingEntries: Array<{ id: string; harvestName: string; strain: string; status: string }>;
    };
}

interface ProposedAction {
    type: 'create_session' | 'add_batch' | 'assign_trimmer' | 'add_trimmer_profile';
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

        if (!request.message && !request.csvData) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Either message or csvData is required' }) };
        }

        // Build user message with context
        let userMessage = '';

        if (request.csvData) {
            userMessage = `Parse this CSV data into batch entries for the trim tracker. Map the columns to harvest name, strain, license number, and start weight fields. Here is the CSV data:\n\n${request.csvData}`;
        } else {
            userMessage = request.message!;
        }

        // Add context about current state
        const contextInfo = [
            `\n\nCurrent application state:`,
            `- Active session: ${request.context.hasActiveSession ? 'Yes (ID: ' + request.context.sessionId + ')' : 'No active session'}`,
        ];

        if (request.context.trimmerProfiles.length > 0) {
            contextInfo.push(`- Trimmer roster: ${request.context.trimmerProfiles.map(p => `${p.name} (ID: ${p.id})`).join(', ')}`);
        } else {
            contextInfo.push(`- Trimmer roster: Empty`);
        }

        if (request.context.existingEntries.length > 0) {
            contextInfo.push(`- Current batches: ${request.context.existingEntries.map(e => `"${e.harvestName}" / ${e.strain} [${e.status}] (ID: ${e.id})`).join(', ')}`);
        }

        userMessage += contextInfo.join('\n');

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools,
            messages: [{ role: 'user', content: userMessage }],
        });

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

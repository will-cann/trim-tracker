import { Handler } from '@netlify/functions';
import { resolveContext, authorize } from './utils/auth';

/**
 * Reads a grow-room schematic (floor plan photo, CAD export, hand sketch,
 * PDF) and proposes rooms with the plant-map grid each one needs: benches
 * (rows) × positions per bench (columns), plus type and capacity where the
 * drawing shows them. The settings page previews the proposals and the
 * operator edits before anything is written.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.SCHEMATIC_PARSE_MODEL || 'claude-opus-5-5';
const MAX_BASE64_CHARS = 5 * 1024 * 1024; // ~3.75 MB binary; Netlify caps bodies at 6 MB
const MEDIA_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ROOM_TYPES = new Set(['nursery', 'veg', 'flower', 'dry', 'storage', 'general']);
const MAX_GRID = 60;

export interface SchematicRoom {
    name: string;
    roomType: 'nursery' | 'veg' | 'flower' | 'dry' | 'storage' | 'general' | null;
    layoutRows: number | null;
    layoutCols: number | null;
    capacity: number | null;
    squareFootage: number | null;
    notes: string | null;
}

export interface ParsedSchematic {
    rooms: SchematicRoom[];
    notes: string | null;
}

const SYSTEM_PROMPT = `You read cannabis grow-facility schematics (floor plans, bench layouts, CAD exports, whiteboard sketches) and return the rooms they show as JSON for a plant-map grid.

Return ONLY a JSON object, no prose, shaped exactly like:
{
  "rooms": [
    { "name": "Flower Room 1", "roomType": "flower", "layoutRows": 4, "layoutCols": 12, "capacity": 48, "squareFootage": 1200, "notes": "4 rolling benches, 12 positions each; dehumidifier in NE corner" }
  ],
  "notes": null
}

Rules:
- One entry per cultivation or drying room drawn or labelled. Use the label as printed for "name"; if a room has no label, name it by what it is ("Flower Room A") and say so in notes.
- roomType: nursery (clones/propagation), veg, flower, dry (drying/curing), storage, general. null if unclear.
- layoutRows = number of benches, tables, rows or trellis runs along which plants sit. layoutCols = plant positions along one bench. Count drawn pots, squares or grid marks when they are shown; if only bench dimensions are given, estimate positions from a 1 ft (30 cm) spacing for flower and 0.5 ft for veg, and say "estimated" in notes. Both are whole numbers 1–60 or null when the drawing gives no basis.
- capacity = layoutRows × layoutCols when both are known, unless a plant count is printed; squareFootage only when printed or clearly scaled.
- Never invent rooms that are not in the drawing. Mechanical rooms, hallways, offices and bathrooms are skipped.
- If the file is not a facility drawing, return {"rooms":[],"notes":"<why>"}.`;

interface Body {
    fileName?: string;
    mediaType?: string;
    /** base64 file bytes */
    data?: string;
}

function intOrNull(v: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) : NaN;
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(max, Math.round(n));
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null;
}

export function normalizeSchematic(raw: unknown): ParsedSchematic {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const rooms = Array.isArray(o.rooms) ? o.rooms : [];
    const seen = new Set<string>();
    return {
        notes: str(o.notes),
        rooms: rooms
            .map((r): SchematicRoom | null => {
                const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
                const name = str(x.name);
                if (!name) return null;
                const key = name.toLowerCase();
                if (seen.has(key)) return null;
                seen.add(key);
                const type = typeof x.roomType === 'string' ? x.roomType.toLowerCase() : null;
                const layoutRows = intOrNull(x.layoutRows, MAX_GRID);
                const layoutCols = intOrNull(x.layoutCols, MAX_GRID);
                const printedCapacity = intOrNull(x.capacity);
                return {
                    name: name.slice(0, 255),
                    roomType: type && ROOM_TYPES.has(type) ? (type as SchematicRoom['roomType']) : null,
                    layoutRows,
                    layoutCols,
                    capacity: printedCapacity ?? (layoutRows && layoutCols ? layoutRows * layoutCols : null),
                    squareFootage: intOrNull(x.squareFootage),
                    notes: str(x.notes),
                };
            })
            .filter((r): r is SchematicRoom => r !== null),
    };
}

export function extractJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object in model response');
    return JSON.parse(candidate.slice(start, end + 1));
}

const json = (statusCode: number, body: unknown) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return json(401, { error: 'Unauthorized' });
        const denied = authorize(context, 'director');
        if (denied) return denied;

        const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return json(500, { error: 'Schematic reading is not configured on this deploy (no Claude API key).' });

        const body: Body = JSON.parse(event.body || '{}');
        if (!body.data) return json(400, { error: 'Attach a schematic (PDF, JPG, PNG or WebP).' });
        const mediaType = body.mediaType ?? '';
        if (!MEDIA_TYPES.has(mediaType)) return json(400, { error: `Unsupported file type: ${mediaType || 'unknown'}. Use PDF, JPG, PNG or WebP.` });
        if (body.data.length > MAX_BASE64_CHARS) return json(400, { error: 'File is too large. Keep schematics under ~3.5 MB (downsize a phone photo).' });

        const content: unknown[] = [
            {
                type: mediaType === 'application/pdf' ? 'document' : 'image',
                source: { type: 'base64', media_type: mediaType, data: body.data },
            },
            { type: 'text', text: `List the grow rooms in this schematic${body.fileName ? ` (${body.fileName})` : ''} with their bench grid.` },
        ];

        const res = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }] }),
        });

        if (!res.ok) {
            const detail = await res.text();
            console.error('parse-room-schematic: Anthropic error', res.status, detail.slice(0, 500));
            return json(502, { error: `Could not read the schematic right now (AI service ${res.status}). Try again in a moment.` });
        }

        const payload = (await res.json()) as { content?: { type: string; text?: string }[] };
        const text = (payload.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n');
        let parsed: ParsedSchematic;
        try {
            parsed = normalizeSchematic(extractJson(text));
        } catch (err) {
            console.error('parse-room-schematic: bad model JSON', err, text.slice(0, 300));
            return json(502, { error: 'The schematic came back in a shape I could not read. Try a clearer image.' });
        }

        return json(200, parsed);
    } catch (error) {
        console.error('parse-room-schematic error:', error);
        return json(500, { error: 'Internal server error' });
    }
};

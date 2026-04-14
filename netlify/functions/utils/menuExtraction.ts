/**
 * Inbound email menu extraction — shared system prompt + JSON schema
 * for Claude tool-use structured output.
 *
 * Used by `parse-inbound-menu.ts` to parse `contact_messages.body_text`
 * (typically a cultivator's email offering fresh frozen / flower / trim)
 * into structured `vendor_products` rows.
 */

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const INBOUND_MENU_MODEL = 'claude-haiku-4-5-20251001';

export type InboundInputType = 'fresh_frozen' | 'flower' | 'trim' | 'shake' | 'other';
export type InboundUnit = 'lb' | 'kg' | 'g' | 'oz';

export interface InboundMenuProduct {
    name: string;
    strain: string;
    inputType: InboundInputType;
    unit: InboundUnit;
    unitSize: number;
    unitPrice: number | null;
    caseSize: number | null;
    casePrice: number | null;
    availableQty: number | null;
    notes: string | null;
}

export interface InboundMenuParse {
    products: InboundMenuProduct[];
    menuDateMentioned: string | null;
    generalNotes: string | null;
}

export const INBOUND_MENU_SYSTEM_PROMPT = `You are a data extraction assistant for a cannabis extraction lab's purchasing workflow.

You parse INBOUND emails from cultivators offering bulk biomass (fresh frozen, flower, trim, shake).
The lab buys this material to run through bubble hash / rosin / cart production.

Your job: extract EVERY product offered in the email body into a structured list.

Rules:
- name: a short human-readable product label, e.g. "Blue Dream Fresh Frozen 1lb"
- strain: best-guess strain name — pull from the line, even if embedded in a longer phrase
- inputType: one of fresh_frozen | flower | trim | shake | other
  - "FF", "fresh frozen", "frozen" → fresh_frozen
  - "smalls", "flower", "buds" → flower
  - "trim" → trim
  - "shake" → shake
  - anything else → other
- unit: lb | kg | g | oz. If ambiguous, prefer lb (US wholesale convention).
- unitSize: numeric size of one selling unit (e.g., 1 for a 1lb bag)
- unitPrice: wholesale price per unit in dollars (no $, no commas). null if not mentioned.
- caseSize: units per case/bundle, integer. null if not mentioned.
- casePrice: total price of a case. null if not mentioned.
- availableQty: how many units are available/on offer. null if not mentioned.
- notes: anything about THIS product specifically (lab tested, cured date, terpene %, harvest batch). null otherwise.

Also extract:
- menuDateMentioned: ISO date (YYYY-MM-DD) if the email references a drop/harvest/pickup date. null otherwise.
- generalNotes: anything relevant to the WHOLE menu that doesn't attach to a single product (payment terms, delivery window, minimums, contact info). null if nothing noteworthy.

If a product line is ambiguous, include it anyway with best-guess fields. Never invent prices or quantities — use null.
Call the extract_menu tool exactly once with the complete result.`;

export const INBOUND_MENU_TOOL = {
    name: 'extract_menu',
    description: 'Return the structured menu extracted from the inbound email body.',
    input_schema: {
        type: 'object',
        properties: {
            products: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        strain: { type: 'string' },
                        inputType: {
                            type: 'string',
                            enum: ['fresh_frozen', 'flower', 'trim', 'shake', 'other'],
                        },
                        unit: { type: 'string', enum: ['lb', 'kg', 'g', 'oz'] },
                        unitSize: { type: 'number' },
                        unitPrice: { type: ['number', 'null'] },
                        caseSize: { type: ['integer', 'null'] },
                        casePrice: { type: ['number', 'null'] },
                        availableQty: { type: ['number', 'null'] },
                        notes: { type: ['string', 'null'] },
                    },
                    required: ['name', 'strain', 'inputType', 'unit', 'unitSize'],
                },
            },
            menuDateMentioned: { type: ['string', 'null'] },
            generalNotes: { type: ['string', 'null'] },
        },
        required: ['products'],
    },
} as const;

/**
 * Strip HTML tags for fallback when body_text is absent. Very lightweight —
 * we just need text for Claude, not perfect rendering.
 */
export function htmlToText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>(?!\s*<\/)/gi, '\n')
        .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Call Claude with tool-use to extract a structured menu from an email body.
 * Throws on network or protocol errors. Returns `null` if Claude refused to
 * call the tool (unparseable input).
 *
 * `fetchImpl` is injected so tests can stub the Anthropic call.
 */
export async function callAnthropicForMenu(
    bodyText: string,
    apiKey: string,
    fetchImpl: typeof fetch = fetch,
): Promise<InboundMenuParse | null> {
    const resp = await fetchImpl(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: INBOUND_MENU_MODEL,
            max_tokens: 4096,
            system: INBOUND_MENU_SYSTEM_PROMPT,
            tools: [INBOUND_MENU_TOOL],
            tool_choice: { type: 'tool', name: INBOUND_MENU_TOOL.name },
            messages: [
                {
                    role: 'user',
                    content: `Extract the menu from this inbound email body:\n\n${bodyText}`,
                },
            ],
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Anthropic API error ${resp.status}: ${errText}`);
    }

    const json = await resp.json() as { content: Array<{ type: string; name?: string; input?: unknown }> };
    for (const block of json.content ?? []) {
        if (block.type === 'tool_use' && block.name === INBOUND_MENU_TOOL.name) {
            return normalizeParse(block.input);
        }
    }
    return null;
}

/**
 * Coerce Claude's tool input into our interface, defaulting anything missing.
 */
export function normalizeParse(raw: unknown): InboundMenuParse {
    const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const productsRaw = Array.isArray(obj.products) ? obj.products as Record<string, unknown>[] : [];
    const products: InboundMenuProduct[] = productsRaw
        .filter(p => typeof p?.name === 'string' && (p.name as string).trim().length > 0)
        .map(p => ({
            name: String(p.name).trim(),
            strain: typeof p.strain === 'string' ? p.strain : '',
            inputType: normalizeInputType(p.inputType),
            unit: normalizeUnit(p.unit),
            unitSize: Number(p.unitSize) || 1,
            unitPrice: numOrNull(p.unitPrice),
            caseSize: intOrNull(p.caseSize),
            casePrice: numOrNull(p.casePrice),
            availableQty: numOrNull(p.availableQty),
            notes: typeof p.notes === 'string' && p.notes.trim() ? p.notes.trim() : null,
        }));
    return {
        products,
        menuDateMentioned: typeof obj.menuDateMentioned === 'string' ? obj.menuDateMentioned : null,
        generalNotes: typeof obj.generalNotes === 'string' ? obj.generalNotes : null,
    };
}

function normalizeInputType(v: unknown): InboundInputType {
    const s = typeof v === 'string' ? v.toLowerCase() : '';
    if (s === 'fresh_frozen' || s === 'flower' || s === 'trim' || s === 'shake') return s;
    return 'other';
}
function normalizeUnit(v: unknown): InboundUnit {
    const s = typeof v === 'string' ? v.toLowerCase() : '';
    if (s === 'lb' || s === 'kg' || s === 'g' || s === 'oz') return s;
    return 'lb';
}
function numOrNull(v: unknown): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function intOrNull(v: unknown): number | null {
    const n = numOrNull(v);
    return n == null ? null : Math.round(n);
}

/**
 * Deterministic lookup key for idempotent upsert of vendor_products:
 * match rows by (vendor_id, lowercased name, unit_size).
 * unit_size is stored as TEXT in the schema (e.g. "1lb"), so we format it here.
 */
export function formatUnitSize(p: Pick<InboundMenuProduct, 'unit' | 'unitSize'>): string {
    return `${p.unitSize}${p.unit}`;
}

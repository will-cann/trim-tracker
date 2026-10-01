import { Handler } from '@netlify/functions';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';

/**
 * Reads a wholesale invoice (Apex PDF, phone photo, or CSV/text export) and
 * returns its line items so the manifest picker can fill in WholesalePrice
 * per package. Apex invoices are usually image-only PDFs, so this goes
 * through Claude's document/vision input rather than a text extractor.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.INVOICE_PARSE_MODEL || 'claude-sonnet-4-20250514';
const MAX_BASE64_CHARS = 5 * 1024 * 1024; // ~3.75 MB binary; Netlify caps bodies at 6 MB
const MAX_TEXT_CHARS = 200_000;

const MEDIA_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface InvoiceLine {
    description: string;
    sku: string | null;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
}

export interface ParsedInvoice {
    invoiceNumber: string | null;
    orderNumber: string | null;
    invoiceDate: string | null;
    buyer: string | null;
    total: number | null;
    lines: InvoiceLine[];
    notes: string | null;
}

const SYSTEM_PROMPT = `You read cannabis wholesale invoices (typically from Apex Trading) and return their line items as JSON.

Return ONLY a JSON object, no prose, shaped exactly like:
{
  "invoiceNumber": "4934",
  "orderNumber": "Proper-4934",
  "invoiceDate": "2026-09-12",
  "buyer": "Terrabis - Springfield",
  "total": 4276.00,
  "lines": [
    { "description": "Daily Driver - Infused Pre-Roll - 1g - High Fructose Corn Syrup", "sku": null, "quantity": 20, "unitPrice": 4.50, "lineTotal": 90.00 }
  ],
  "notes": null
}

Rules:
- One entry per product line on the invoice. Keep the description text as printed (strain, size, mix number). Do not merge or split lines.
- quantity is the number of sellable units billed on that line (e.g. 20 pre-rolls), not cases. If the invoice only shows cases, multiply out if the units-per-case is printed; otherwise leave quantity as the printed number and mention it in notes.
- unitPrice and lineTotal are numbers in dollars with no currency symbols. If only one of them is printed, compute the other from quantity when possible; otherwise use null.
- Ignore subtotal, tax, discount, shipping and total rows in "lines" — put the grand total in "total".
- invoiceNumber is the invoice/document number; orderNumber is the sales order reference if printed (often like "Proper-4934"). Use null when absent.
- If the document is not an invoice, return {"invoiceNumber":null,"orderNumber":null,"invoiceDate":null,"buyer":null,"total":null,"lines":[],"notes":"<why>"}.`;

interface Body {
    fileName?: string;
    mediaType?: string;
    /** base64 file bytes for PDF/image */
    data?: string;
    /** raw text for CSV/TXT exports */
    text?: string;
}

function num(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function normalizeParsed(raw: unknown): ParsedInvoice {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const lines = Array.isArray(o.lines) ? o.lines : [];
    return {
        invoiceNumber: str(o.invoiceNumber),
        orderNumber: str(o.orderNumber),
        invoiceDate: str(o.invoiceDate),
        buyer: str(o.buyer),
        total: num(o.total),
        notes: str(o.notes),
        lines: lines
            .map((l): InvoiceLine | null => {
                const r = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
                const description = str(r.description);
                if (!description) return null;
                const quantity = num(r.quantity);
                let unitPrice = num(r.unitPrice);
                let lineTotal = num(r.lineTotal);
                if (lineTotal === null && unitPrice !== null && quantity !== null) lineTotal = Math.round(unitPrice * quantity * 100) / 100;
                if (unitPrice === null && lineTotal !== null && quantity) unitPrice = Math.round((lineTotal / quantity) * 100) / 100;
                return { description, sku: str(r.sku), quantity, unitPrice, lineTotal };
            })
            .filter((l): l is InvoiceLine => l !== null),
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

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const auth = await authorizeManifestRequest(event.headers);
        if (!auth.ok) return json(auth.status, { error: auth.error });

        const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return json(500, { error: 'Invoice reading is not configured on this deploy (no Claude API key).' });

        const body: Body = JSON.parse(event.body || '{}');
        const content: unknown[] = [];

        if (body.text) {
            if (body.text.length > MAX_TEXT_CHARS) return json(400, { error: 'Invoice text is too large.' });
            content.push({ type: 'text', text: `Invoice export${body.fileName ? ` (${body.fileName})` : ''}:\n\n${body.text}` });
        } else if (body.data) {
            const mediaType = body.mediaType ?? '';
            if (!MEDIA_TYPES.has(mediaType)) return json(400, { error: `Unsupported file type: ${mediaType || 'unknown'}. Use PDF, JPG, PNG, or CSV.` });
            if (body.data.length > MAX_BASE64_CHARS) return json(400, { error: 'File is too large. Keep invoices under ~3.5 MB (a phone photo usually needs downsizing).' });
            content.push({
                type: mediaType === 'application/pdf' ? 'document' : 'image',
                source: { type: 'base64', media_type: mediaType, data: body.data },
            });
            content.push({ type: 'text', text: 'Extract the line items from this invoice.' });
        } else {
            return json(400, { error: 'Attach an invoice file (PDF, photo, or CSV).' });
        }

        const res = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }] }),
        });

        if (!res.ok) {
            const detail = await res.text();
            console.error('parse-invoice: Anthropic error', res.status, detail.slice(0, 500));
            return json(502, { error: 'Could not read the invoice right now. Try again in a moment.' });
        }

        const payload = (await res.json()) as { content?: { type: string; text?: string }[] };
        const text = (payload.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n');
        let parsed: ParsedInvoice;
        try {
            parsed = normalizeParsed(extractJson(text));
        } catch (err) {
            console.error('parse-invoice: bad model JSON', err, text.slice(0, 300));
            return json(502, { error: 'The invoice came back in a shape I could not read. Try a clearer scan.' });
        }

        return json(200, parsed);
    } catch (error) {
        console.error('parse-invoice error:', error);
        return json(500, { error: 'Internal server error' });
    }
};

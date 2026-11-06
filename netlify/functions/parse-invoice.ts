import { Handler } from '@netlify/functions';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { askClaudeAboutDocument, DEFAULT_DOC_MODEL, documentContent, extractJson, num, str, type DocumentBody } from './utils/documentParse';

/**
 * Reads a wholesale invoice (Apex PDF, phone photo, or CSV/text export) and
 * returns its line items so the manifest picker can fill in WholesalePrice
 * per package. Apex invoices are usually image-only PDFs, so this goes
 * through Claude's document/vision input rather than a text extractor.
 */

const MODEL = process.env.INVOICE_PARSE_MODEL || DEFAULT_DOC_MODEL;

export { extractJson };

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

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const auth = await authorizeManifestRequest(event.headers);
        if (!auth.ok) return json(auth.status, { error: auth.error });

        const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return json(500, { error: 'Invoice reading is not configured on this deploy (no Claude API key).' });

        const body: DocumentBody = JSON.parse(event.body || '{}');
        const doc = documentContent(body, 'Invoice', 'Extract the line items from this invoice.');
        if (!doc.ok) return json(400, { error: doc.error });

        const res = await askClaudeAboutDocument({ apiKey, model: MODEL, system: SYSTEM_PROMPT, content: doc.content });
        if (!res.ok) {
            console.error('parse-invoice: Anthropic error', res.status, res.detail);
            return json(502, { error: 'Could not read the invoice right now. Try again in a moment.' });
        }

        let parsed: ParsedInvoice;
        try {
            parsed = normalizeParsed(extractJson(res.text));
        } catch (err) {
            console.error('parse-invoice: bad model JSON', err, res.text.slice(0, 300));
            return json(502, { error: 'The invoice came back in a shape I could not read. Try a clearer scan.' });
        }

        return json(200, parsed);
    } catch (error) {
        console.error('parse-invoice error:', error);
        return json(500, { error: 'Internal server error' });
    }
};

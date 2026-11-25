import { Handler } from '@netlify/functions';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { askClaudeAboutDocument, DEFAULT_DOC_MODEL, documentContent, extractJson, num, str, type DocumentBody } from './utils/documentParse';
import type { PickListDocLine, PickListDocument } from '../../shared/manifest/pickListDocument';

/**
 * Reads the Apex invoice PDF (what Apex hands the lead; it doubles as the
 * pick list) or a photo of it and returns its lines so the manifest picker
 * can load it the way it loads the CSV export. Proper asked for this because
 * the PDF is what their lead actually gets, and unlike the CSV it carries
 * potency and price. Apex invoices are image-only PDFs, hence Claude vision.
 * The CSV path (src/manifest/lib/pickList.ts) stays as is.
 *
 * Layout seen on Proper-5718 (Nov 2026), per line: "#", "Name" (brand on one
 * line, product on the next, category · type beneath), "Details" (Sku:,
 * Batch: <product> #<lot tag> (#<case suffix ranges>), Potency:), "Price"
 * (struck list price, then the per-case price), "Quantity" (1 Case, N Units
 * total, Package Size / Weight / N Unit Per Unit), "Line" (list total,
 * Customer Discount, final).
 */

const MODEL = process.env.PICKLIST_PARSE_MODEL || process.env.INVOICE_PARSE_MODEL || DEFAULT_DOC_MODEL;
const TAG_RE = /\b1A4[0-9A-Z]{21}\b/g;
const MAX_LINES = 200;

const SYSTEM_PROMPT = `You read cannabis wholesale invoices, pick lists and sales orders printed from Apex Trading and return their product lines as JSON for a warehouse picking app. The invoice doubles as the pick list: the picker needs the lot each line comes from, the case tags Apex recorded, how many cases and units, and the final price.

Return ONLY a JSON object, no prose, shaped exactly like:
{
  "orderNumber": "Proper-5718",
  "buyer": "Key MO - Richmond Heights",
  "buyerLicense": "DIS000114",
  "buyerAddress": "1026 S. Brentwood Blvd., Richmond Heights, Missouri 63117",
  "lines": [
    {
      "productName": "Proper - Sauce+ - 1g - Skywalker OG",
      "brand": "Proper Cannabis",
      "category": "Carts & Vapes",
      "productType": "Cartridge",
      "sku": "Proper - Sauce+ - 1g - Skywalker OG",
      "lotTag": "1A40C0300000B56000273850",
      "lotLabel": null,
      "metrcTags": ["(#319491-319558)"],
      "packages": 1,
      "totalUnits": 12,
      "unitsPerPackage": 12,
      "potency": "86.38 % THC",
      "unitPrice": null,
      "casePrice": 180.00,
      "lineTotal": 180.00
    }
  ],
  "notes": null
}

Rules:
- One entry per numbered product line, in the order printed, across every page. Do not merge or split lines. Ignore subtotal, line item adjustments, total, payments and signature blocks.
- productName is the product as printed in the Name column (e.g. "Proper - Sauce+ - 1g - Skywalker OG"), not the brand line above it. brand is the brand line ("Proper Cannabis", "Honeybee", "RATIO"). The small italic text under the name is "category · productType" (e.g. "Carts & Vapes · Cartridge", "Prepack · A Bud", "Prerolls · Whole Flower"); copy both. sku is the Sku: text when printed, else null.
- The Details column prints "Batch: <product name> #<24-character Metrc tag> (#<range>)". lotTag is that 24-character tag starting with 1A4; copy it exactly, character by character (0 vs O, 5 vs S, 8 vs B matter). When only part of a tag is legible, put the legible text in lotLabel and leave lotTag null.
- metrcTags is the parenthesised case-tag text that follows the lot tag, copied as printed, one string per group: "(#143967-143980)", "(#291767-291905, 307867-307910)". Also include any full 24-character case tags or full-tag ranges printed for the line. Empty array when nothing follows the lot tag. Never put the lot tag itself here.
- Quantity: "1 Case / 12 Units total" → packages 1, totalUnits 12, unitsPerPackage 12. "2 Cases / 100 Units total" → packages 2, totalUnits 100, unitsPerPackage 50. If only units are printed, packages null. Ignore "Package Size", "Weight" and "N Gram Per Unit" except to sanity-check.
- potency is the Potency: text as printed ("86.38 % THC"); null when the line has none (edibles usually have none).
- Prices are numbers in dollars with no symbols. casePrice is the Price column's effective per-case price (the un-struck number; ignore the struck-through list price). lineTotal is the FINAL amount for the line after any "Customer Discount" (the bold last number in the Line column, e.g. list $330.00, discount -$66.00 → lineTotal 264.00). unitPrice is only for sheets that print a per-unit price; otherwise null.
- buyer is the SHIP TO facility name; buyerLicense is the licence number printed under the ship-to address (e.g. "DIS000114"); buyerAddress the ship-to street address. orderNumber is the INVOICE # / order reference (e.g. "Proper-5718").
- If the document is something else (a lab report, a manifest), still return any product lines you can see and say in notes what it looks like. Use notes for anything the picker should know (a page you could not read, a tag you were unsure of).`;

function tags(v: unknown): string[] {
    const arr = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
    return Array.from(new Set(arr.map(x => (typeof x === 'string' ? x.trim().toUpperCase() : '')).filter(Boolean)));
}

function fullTag(v: unknown): string | null {
    const s = str(v);
    if (!s) return null;
    const m = s.toUpperCase().match(TAG_RE);
    return m ? m[0] : null;
}

export function normalizePickListDoc(raw: unknown): PickListDocument {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const lines = Array.isArray(o.lines) ? o.lines.slice(0, MAX_LINES) : [];
    return {
        orderNumber: str(o.orderNumber),
        buyer: str(o.buyer),
        buyerLicense: str(o.buyerLicense)?.toUpperCase() ?? null,
        buyerAddress: str(o.buyerAddress),
        notes: str(o.notes),
        lines: lines
            .map((l): PickListDocLine | null => {
                const r = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
                const productName = str(r.productName);
                if (!productName) return null;
                const lotTag = fullTag(r.lotTag) ?? fullTag(r.lotLabel);
                const lotLabel = lotTag ? null : str(r.lotLabel) ?? str(r.lotTag);
                let packages = num(r.packages);
                let totalUnits = num(r.totalUnits);
                let unitsPerPackage = num(r.unitsPerPackage);
                if (packages !== null && packages <= 0) packages = null;
                if (totalUnits === null && packages !== null && unitsPerPackage !== null) totalUnits = packages * unitsPerPackage;
                if (unitsPerPackage === null && packages && totalUnits !== null) unitsPerPackage = Math.round(totalUnits / packages);
                let unitPrice = num(r.unitPrice);
                const casePrice = num(r.casePrice);
                let lineTotal = num(r.lineTotal);
                if (lineTotal === null && casePrice !== null && packages !== null) lineTotal = Math.round(casePrice * packages * 100) / 100;
                if (lineTotal === null && unitPrice !== null && totalUnits !== null) lineTotal = Math.round(unitPrice * totalUnits * 100) / 100;
                if (unitPrice === null && lineTotal !== null && totalUnits) unitPrice = Math.round((lineTotal / totalUnits) * 100) / 100;
                return {
                    productName,
                    brand: str(r.brand),
                    category: str(r.category),
                    productType: str(r.productType),
                    sku: str(r.sku),
                    lotTag,
                    lotLabel,
                    metrcTags: tags(r.metrcTags).filter(t => t !== lotTag),
                    packages,
                    totalUnits,
                    unitsPerPackage,
                    potency: str(r.potency),
                    unitPrice,
                    casePrice,
                    lineTotal,
                };
            })
            .filter((l): l is PickListDocLine => l !== null),
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
        if (!apiKey) return json(500, { error: 'PDF reading is not configured on this deploy (no Claude API key). Load the CSV export instead.' });

        const body: DocumentBody = JSON.parse(event.body || '{}');
        const doc = documentContent(body, 'Pick list', 'Extract every product line from this Apex document (all pages) for the picker.');
        if (!doc.ok) return json(400, { error: doc.error });

        const res = await askClaudeAboutDocument({ apiKey, model: MODEL, system: SYSTEM_PROMPT, content: doc.content, maxTokens: 8192 });
        if (!res.ok) {
            console.error('parse-pick-list: Anthropic error', res.status, res.detail);
            return json(502, { error: 'Could not read the pick list right now. Try again in a moment, or load the CSV export.' });
        }

        let parsed: PickListDocument;
        try {
            parsed = normalizePickListDoc(extractJson(res.text));
        } catch (err) {
            console.error('parse-pick-list: bad model JSON', err, res.text.slice(0, 300));
            return json(502, { error: 'The pick list came back in a shape I could not read. Try a clearer scan, or load the CSV export.' });
        }

        return json(200, parsed);
    } catch (error) {
        console.error('parse-pick-list error:', error);
        return json(500, { error: 'Internal server error' });
    }
};

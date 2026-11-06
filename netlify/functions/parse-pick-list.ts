import { Handler } from '@netlify/functions';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { askClaudeAboutDocument, DEFAULT_DOC_MODEL, documentContent, extractJson, num, str, type DocumentBody } from './utils/documentParse';
import type { PickListDocLine, PickListDocument } from '../../shared/manifest/pickListDocument';

/**
 * Reads an Apex pick list / sales order PDF (or a photo of the printed sheet)
 * and returns its lines so the manifest picker can load it the way it loads
 * the CSV export. Proper asked for this because the PDF is what their lead
 * actually prints, and unlike the CSV it carries potency and price.
 * The CSV path (src/manifest/lib/pickList.ts) stays as is.
 */

const MODEL = process.env.PICKLIST_PARSE_MODEL || process.env.INVOICE_PARSE_MODEL || DEFAULT_DOC_MODEL;
const TAG_RE = /\b1A4[0-9A-Z]{21}\b/g;
const MAX_LINES = 200;

const SYSTEM_PROMPT = `You read cannabis wholesale pick lists and sales orders (typically printed from Apex Trading) and return their lines as JSON for a warehouse picking app.

Return ONLY a JSON object, no prose, shaped exactly like:
{
  "orderNumber": "Proper-4934",
  "buyer": "Terrabis - Springfield",
  "buyerLicense": "DIS000045",
  "buyerAddress": "1234 S Glenstone Ave, Springfield, MO 65804",
  "lines": [
    {
      "productName": "Proper - Pre-Roll - 1g - Legend OG",
      "brand": "Proper",
      "category": "Pre-Roll",
      "productType": "Pre-Roll",
      "sku": null,
      "lotTag": "1A40C0300000B56000108430",
      "lotLabel": null,
      "metrcTags": ["1A40C0300000B56000146121-1A40C0300000B56000146131"],
      "packages": 2,
      "totalUnits": 100,
      "unitsPerPackage": 50,
      "potency": "THC 24.1%",
      "unitPrice": 4.50,
      "lineTotal": 450.00
    }
  ],
  "notes": null
}

Rules:
- One entry per product line on the sheet, in the order printed. Do not merge or split lines.
- productName is the product as printed (brand, form, size, strain). brand / category / productType are the sheet's own columns when present, else your best split of the name; null when you cannot tell.
- lotTag is the source batch / lot / parent package tag: a 24-character Metrc tag starting with 1A4. Pick lists usually print it with the batch. Copy it exactly. If only part of it is printed (e.g. "…108430" or "Lot 108430"), put that text in lotLabel and leave lotTag null.
- metrcTags are the CASE tags recorded for the line (what the picker will scan), as printed: full tags or a range like "1A40C0300000B56000146121-1A40C0300000B56000146131" or "…146121 to 131". Keep ranges as one string. Empty array when none are printed. Do not put the lot tag here.
- Quantities: "2 Cases (100 Units)" → packages 2, totalUnits 100, unitsPerPackage 50. "20 Units" → packages null, totalUnits 20. Only fill what the sheet supports; use null otherwise.
- potency is the printed test result text (THC / CBD / total cannabinoids), as printed. null when absent.
- unitPrice and lineTotal are numbers in dollars (no symbols). Compute one from the other and totalUnits when only one is printed; otherwise null.
- buyer is the receiving facility; buyerLicense its state licence number if printed; buyerAddress the shipping address if printed.
- Ignore subtotal / tax / total rows.
- If the document is not a pick list or order (for example an invoice with no lots, or a lab report), still return any product lines you can see and explain in notes what it looks like.`;

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
                let lineTotal = num(r.lineTotal);
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
        const doc = documentContent(body, 'Pick list', 'Extract the pick list lines from this document.');
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

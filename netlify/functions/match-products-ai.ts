import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const MATCH_PROMPT = `You are a product matching assistant for a cannabis retail purchasing system.

You will be given:
1. A list of unmatched POS SKUs (with product names and recent sales volume) from a Dutchie point-of-sale export
2. A vendor catalog of products (the canonical "what we order from suppliers" list)

Your job: for each POS SKU, find the SINGLE best matching vendor product, or return null if there's no plausible match.

Match criteria, in order of importance:
1. Brand match (e.g., "Wyld" must match "Wyld" — never cross brands)
2. Product type / category (gummies vs chocolates vs flower vs cart)
3. Strain or flavor (e.g., "Raspberry" matches "Raspberry", "Blue Dream" matches "Blue Dream")
4. Pack size and unit size (e.g., "10pk" = "10ct", "100mg" = "100mg")
5. THC content if specified

Return strict JSON in this shape:
{
  "matches": [
    {
      "sku": "<the POS sku exactly as given>",
      "vendorProductId": "<uuid from catalog, or null if no match>",
      "confidence": 0.95,
      "reasoning": "Brand+strain+size all match"
    }
  ]
}

Confidence scale:
- 0.95-1.0: brand, type, strain/flavor, AND size all match clearly
- 0.80-0.94: brand and type match, minor naming differences
- 0.60-0.79: probable but uncertain (different size or ambiguous strain)
- below 0.60: return vendorProductId: null

Be strict. A wrong match causes incorrect order quantities. When in doubt, return null.`;

interface UnmatchedItem {
    sku: string;
    productName?: string;
    units60d?: number;
}

interface CatalogItem {
    id: string;
    name: string;
    brand?: string | null;
    category?: string | null;
    sku?: string | null;
    unitSize?: string | null;
}

interface MatchResult {
    sku: string;
    vendorProductId: string | null;
    confidence: number;
    reasoning: string;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'AI service not configured' }) };

        const body = JSON.parse(event.body || '{}');
        const unmatched: UnmatchedItem[] = body.unmatched || [];
        const vendorId: string | undefined = body.vendorId;

        if (!Array.isArray(unmatched) || unmatched.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'unmatched[] is required' }) };
        }

        // Load vendor catalog (single vendor, or all active products)
        const { rows: catalogRows } = vendorId
            ? await sql`
                SELECT id, name, brand, category, sku, unit_size
                FROM vendor_products
                WHERE company_id = ${context.companyId}
                  AND vendor_id = ${vendorId}
                  AND is_active = TRUE
            `
            : await sql`
                SELECT id, name, brand, category, sku, unit_size
                FROM vendor_products
                WHERE company_id = ${context.companyId}
                  AND is_active = TRUE
            `;

        if (catalogRows.length === 0) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matches: [], message: 'No vendor catalog to match against' }),
            };
        }

        const catalog: CatalogItem[] = catalogRows.map(r => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            category: r.category,
            sku: r.sku,
            unitSize: r.unit_size,
        }));

        // Batch the unmatched items to keep prompts manageable (~50 per call)
        const BATCH_SIZE = 25;
        const allMatches: MatchResult[] = [];

        for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
            const batch = unmatched.slice(i, i + BATCH_SIZE);
            const userMessage = JSON.stringify({
                unmatchedSkus: batch.map(u => ({
                    sku: u.sku,
                    name: u.productName || null,
                    units60d: u.units60d || 0,
                })),
                vendorCatalog: catalog,
            });

            const apiResponse = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-opus-4-20250514',
                    max_tokens: 8192,
                    system: MATCH_PROMPT,
                    messages: [{ role: 'user', content: userMessage }],
                }),
            });

            if (!apiResponse.ok) {
                const errText = await apiResponse.text();
                console.error('Anthropic API error:', apiResponse.status, errText);
                return { statusCode: 502, body: JSON.stringify({ error: 'AI matching failed', detail: errText }) };
            }

            const response = await apiResponse.json();
            for (const block of response.content) {
                if (block.type === 'text') {
                    const jsonMatch = block.text.match(/\{[\s\S]*"matches"[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const parsed = JSON.parse(jsonMatch[0]) as { matches: MatchResult[] };
                            if (Array.isArray(parsed.matches)) allMatches.push(...parsed.matches);
                        } catch (e) {
                            console.error('Failed to parse AI match response', e);
                        }
                    }
                }
            }
        }

        // Validate vendorProductIds against the catalog (Claude could hallucinate)
        const validIds = new Set(catalog.map(c => c.id));
        const cleaned = allMatches.map(m => ({
            ...m,
            vendorProductId: m.vendorProductId && validIds.has(m.vendorProductId) ? m.vendorProductId : null,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matches: cleaned }),
        };
    } catch (error) {
        console.error('match-products-ai error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const PARSE_PROMPT = `You are a data extraction assistant for a cannabis retail purchasing system. Your job is to parse vendor product menus (Excel exports, CSV data, or PDF catalogs) into structured product records.

Extract EVERY product you can find. For each product, extract:
- name: product name (required)
- brand: brand name if present
- category: product category (flower, pre-roll, edible, concentrate, vape, topical, tincture, accessory, etc.)
- sku: SKU or product code if present
- unitSize: package size (e.g., "1g", "3.5g", "1oz", "100mg", "0.5g cart")
- caseSize: units per case if listed (integer)
- unitPrice: per-unit wholesale price (number, no $ sign)
- casePrice: per-case wholesale price (number, no $ sign)

Rules:
- If a field isn't present, omit it or set to null
- Prices should be numbers only (strip $ and commas)
- Normalize category names to lowercase
- If you see a header row, skip it
- If store columns are present (quantities per store), ignore those — just extract the product catalog
- Combine multi-line product entries where appropriate
- For THC/CBD percentages, include them in the product name if they seem relevant

Return a JSON object with exactly this shape:
{
  "products": [
    { "name": "...", "brand": "...", "category": "...", "sku": "...", "unitSize": "...", "caseSize": 12, "unitPrice": 5.50, "casePrice": 60.00 }
  ],
  "vendorName": "..." // if you can detect the vendor name from the document
}`;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'AI service not configured' }) };

        const body = JSON.parse(event.body || '{}');
        const { fileName, fileContent, fileType } = body;

        if (!fileContent) {
            return { statusCode: 400, body: JSON.stringify({ error: 'fileContent is required' }) };
        }

        // Build Claude message content
        const content: any[] = [];

        if (fileType === 'pdf' || fileType === 'image') {
            // Use vision: send as image/document
            const mediaType = fileType === 'pdf' ? 'application/pdf' : 'image/png';
            content.push({
                type: 'document',
                source: { type: 'base64', media_type: mediaType, data: fileContent },
            });
            content.push({ type: 'text', text: 'Extract all products from this vendor menu document.' });
        } else {
            // Text/CSV/TSV content
            content.push({
                type: 'text',
                text: `Extract all products from this vendor menu data:\n\n${fileContent}`,
            });
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
                max_tokens: 8192,
                system: PARSE_PROMPT,
                messages: [{ role: 'user', content }],
            }),
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            console.error('Anthropic API error:', apiResponse.status, errText);
            return { statusCode: 502, body: JSON.stringify({ error: 'AI parsing failed', detail: errText }) };
        }

        const response = await apiResponse.json();

        // Extract JSON from response text
        let parsed: { products: any[]; vendorName?: string } = { products: [] };
        for (const block of response.content) {
            if (block.type === 'text') {
                // Find JSON in the response (might be wrapped in markdown code blocks)
                const jsonMatch = block.text.match(/\{[\s\S]*"products"[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsed = JSON.parse(jsonMatch[0]);
                    } catch {
                        console.error('Failed to parse JSON from AI response');
                    }
                }
            }
        }

        if (!parsed.products?.length) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: [], vendorName: parsed.vendorName, message: 'No products could be extracted from the file.' }),
            };
        }

        // Return parsed products + detected vendor for review (nothing saved yet)
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vendorName: parsed.vendorName || fileName?.replace(/\.[^.]+$/, '') || 'Unknown Vendor',
                products: parsed.products,
            }),
        };
    } catch (error) {
        console.error('parse-vendor-menu error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

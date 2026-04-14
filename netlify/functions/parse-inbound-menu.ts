/**
 * parse-inbound-menu — extract structured vendor_products from an inbound
 * cultivator email stored in contact_messages. Idempotent: re-running on the
 * same messageId replaces the parse and upserts products by (vendor, name, size).
 *
 * Body: { messageId: uuid }
 */
import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';
import {
    callAnthropicForMenu,
    htmlToText,
    formatUnitSize,
    type InboundMenuParse,
} from './utils/menuExtraction';

interface ContactMessageRow {
    id: string;
    thread_id: string;
    company_id: string;
    body_text: string | null;
    body_html: string | null;
    subject: string | null;
    vendor_id: string | null;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: 'AI service not configured' }) };
        }

        const { messageId } = JSON.parse(event.body || '{}');
        if (!messageId || typeof messageId !== 'string') {
            return { statusCode: 400, body: JSON.stringify({ error: 'messageId is required' }) };
        }

        // Load the message joined to its thread to get vendor_id + subject.
        const rowResult = await sql`
            SELECT m.id,
                   m.thread_id,
                   m.company_id,
                   m.body_text,
                   m.body_html,
                   m.subject,
                   t.vendor_id
            FROM contact_messages m
            JOIN contact_threads t ON t.id = m.thread_id
            WHERE m.id = ${messageId}
              AND m.company_id = ${context.companyId}
            LIMIT 1
        `;
        const row = rowResult.rows[0] as ContactMessageRow | undefined;
        if (!row) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Message not found' }) };
        }

        const sourceText = (row.body_text && row.body_text.trim())
            ? row.body_text
            : (row.body_html ? htmlToText(row.body_html) : '');
        if (!sourceText.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Message has no parseable body' }) };
        }

        const parsed = await callAnthropicForMenu(sourceText, apiKey);
        if (!parsed) {
            return { statusCode: 502, body: JSON.stringify({ error: 'AI did not return a structured menu' }) };
        }

        // Persist the full parse on the message for auditability / re-parse.
        await sql`
            UPDATE contact_messages
               SET parsed_as = ${JSON.stringify(parsed)}::jsonb
             WHERE id = ${messageId}
               AND company_id = ${context.companyId}
        `;

        // If no vendor linked to the thread yet, return parse without writing catalog rows.
        if (!row.vendor_id) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parsed,
                    written: false,
                    reason: 'thread has no vendor_id — assign a vendor before importing products',
                }),
            };
        }

        const writeResult = await writeMenuAndProducts({
            companyId: context.companyId,
            vendorId: row.vendor_id,
            messageId: row.id,
            subject: row.subject,
            parsed,
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parsed,
                written: true,
                menuId: writeResult.menuId,
                productsUpserted: writeResult.productsUpserted,
            }),
        };
    } catch (error) {
        console.error('parse-inbound-menu error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

interface WriteArgs {
    companyId: string;
    vendorId: string;
    messageId: string;
    subject: string | null;
    parsed: InboundMenuParse;
}

/**
 * Create a vendor_menus row and upsert vendor_products keyed by
 * (vendor_id, lower(name), unit_size). Exported for testing.
 */
export async function writeMenuAndProducts(args: WriteArgs): Promise<{ menuId: string; productsUpserted: number }> {
    const { companyId, vendorId, messageId, subject, parsed } = args;

    const fileName = (subject && subject.trim()) ? subject.trim() : 'Inbound email menu';
    const noteBody = `parsed from contact_messages.id=${messageId}`;

    const menuInsert = await sql`
        INSERT INTO vendor_menus (vendor_id, company_id, file_name, status, parsed_at, notes)
        VALUES (${vendorId}, ${companyId}, ${fileName}, 'parsed', NOW(), ${noteBody})
        RETURNING id
    `;
    const menuId = menuInsert.rows[0]?.id as string;

    let productsUpserted = 0;
    for (const p of parsed.products) {
        const unitSize = formatUnitSize(p);
        const category = p.inputType; // store inputType in category for now (schema has no dedicated column)

        // Find existing row by (vendor_id, lower(name), unit_size)
        const existing = await sql`
            SELECT id FROM vendor_products
             WHERE vendor_id = ${vendorId}
               AND company_id = ${companyId}
               AND LOWER(name) = LOWER(${p.name})
               AND COALESCE(unit_size, '') = ${unitSize}
             LIMIT 1
        `;

        if (existing.rows[0]?.id) {
            await sql`
                UPDATE vendor_products
                   SET menu_id    = ${menuId},
                       category   = ${category},
                       case_size  = ${p.caseSize},
                       unit_price = ${p.unitPrice},
                       case_price = ${p.casePrice},
                       is_active  = TRUE,
                       updated_at = NOW()
                 WHERE id = ${existing.rows[0].id}
            `;
        } else {
            await sql`
                INSERT INTO vendor_products
                    (vendor_id, company_id, menu_id, name, brand, category, sku,
                     unit_size, case_size, unit_price, case_price)
                VALUES
                    (${vendorId}, ${companyId}, ${menuId}, ${p.name}, ${p.strain || null},
                     ${category}, ${null}, ${unitSize}, ${p.caseSize}, ${p.unitPrice}, ${p.casePrice})
            `;
        }
        productsUpserted += 1;
    }

    return { menuId, productsUpserted };
}

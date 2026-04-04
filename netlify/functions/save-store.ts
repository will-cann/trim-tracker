import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        if (!body.name?.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Store name is required' }) };
        }

        if (body.storeId) {
            const { rows } = await sql`
                UPDATE stores SET
                    name = ${body.name.trim()},
                    pos_store_id = COALESCE(${body.posStoreId || null}, pos_store_id),
                    address = COALESCE(${body.address || null}, address),
                    vault_capacity_notes = COALESCE(${body.vaultCapacityNotes || null}, vault_capacity_notes),
                    is_active = COALESCE(${body.isActive ?? null}, is_active),
                    updated_at = NOW()
                WHERE id = ${body.storeId} AND company_id = ${context.companyId}
                RETURNING *
            `;
            if (!rows.length) return { statusCode: 404, body: JSON.stringify({ error: 'Store not found' }) };
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formatStore(rows[0])),
            };
        }

        const { rows } = await sql`
            INSERT INTO stores (company_id, name, pos_store_id, address, vault_capacity_notes)
            VALUES (${context.companyId}, ${body.name.trim()}, ${body.posStoreId || null}, ${body.address || null}, ${body.vaultCapacityNotes || null})
            RETURNING *
        `;

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formatStore(rows[0])),
        };
    } catch (error) {
        console.error('save-store error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

function formatStore(r: any) {
    return {
        id: r.id,
        name: r.name,
        posStoreId: r.pos_store_id,
        address: r.address,
        vaultCapacityNotes: r.vault_capacity_notes,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}

import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const { rows } = await sql`
            SELECT * FROM stores
            WHERE company_id = ${context.companyId}
            ORDER BY name
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows.map(r => ({
                id: r.id,
                name: r.name,
                posStoreId: r.pos_store_id,
                address: r.address,
                vaultCapacityNotes: r.vault_capacity_notes,
                isActive: r.is_active,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }))),
        };
    } catch (error) {
        console.error('get-stores error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

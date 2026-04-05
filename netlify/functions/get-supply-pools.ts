import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const result = await sql`
            SELECT id, slug, label, created_at
            FROM supply_pools
            WHERE company_id = ${context.companyId}
            ORDER BY
                CASE slug WHEN 'extraction' THEN 1 WHEN 'cultivation' THEN 2 WHEN 'facility' THEN 3 END
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows.map((r: any) => ({
                id: r.id,
                slug: r.slug,
                label: r.label,
                createdAt: r.created_at,
            }))),
        };
    } catch (error) {
        console.error('Error fetching supply pools:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch supply pools' }),
        };
    }
};

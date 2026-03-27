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
            SELECT
                s.id,
                s.name,
                s.default_flowering_days,
                s.created_at,
                s.updated_at,
                (
                    SELECT COUNT(*)::int FROM harvests h
                    WHERE h.company_id = s.company_id AND LOWER(h.strain) = LOWER(s.name)
                ) AS harvest_count,
                (
                    SELECT COUNT(*)::int FROM trim_entries te
                    JOIN trim_sessions ts ON te.session_id = ts.id
                    WHERE ts.company_id = s.company_id AND LOWER(te.strain) = LOWER(s.name)
                ) AS session_count
            FROM strains s
            WHERE s.company_id = ${context.companyId}
            ORDER BY s.name ASC
        `;

        const strains = result.rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            defaultFloweringDays: r.default_flowering_days || null,
            harvestCount: r.harvest_count || 0,
            sessionCount: r.session_count || 0,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(strains),
        };
    } catch (error) {
        console.error('Error fetching strains:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch strains' }),
        };
    }
};

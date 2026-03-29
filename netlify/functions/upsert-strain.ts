import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { name, defaultFloweringDays, defaultVegDays } = JSON.parse(event.body || '{}');
        if (!name?.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Strain name is required' }) };
        }

        const trimmedName = name.trim();
        const floweringDays = (typeof defaultFloweringDays === 'number' && defaultFloweringDays > 0 && defaultFloweringDays <= 120)
            ? defaultFloweringDays
            : null;
        const vegDays = (typeof defaultVegDays === 'number' && defaultVegDays > 0 && defaultVegDays <= 120)
            ? defaultVegDays
            : null;

        // Upsert — insert if not exists, update days if provided
        const result = await sql`
            INSERT INTO strains (company_id, name, default_flowering_days, default_veg_days)
            VALUES (${context.companyId}, ${trimmedName}, ${floweringDays}, ${vegDays})
            ON CONFLICT (company_id, LOWER(name)) DO UPDATE SET
                default_flowering_days = COALESCE(${floweringDays}, strains.default_flowering_days),
                default_veg_days = COALESCE(${vegDays}, strains.default_veg_days),
                updated_at = NOW()
            RETURNING id, name, default_flowering_days, default_veg_days, created_at, updated_at
        `;

        const strain = result.rows[0];

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: strain.id,
                name: strain.name,
                defaultVegDays: strain.default_veg_days || null,
                defaultFloweringDays: strain.default_flowering_days || null,
                createdAt: strain.created_at,
                updatedAt: strain.updated_at,
            }),
        };
    } catch (error) {
        console.error('Error upserting strain:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create strain' }),
        };
    }
};

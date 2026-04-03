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
            SELECT * FROM extraction_equipment
            WHERE company_id = ${context.companyId}
            ORDER BY name ASC
        `;

        const equipment = result.rows.map(formatEquipment);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(equipment),
        };
    } catch (error) {
        console.error('Error fetching equipment:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch equipment' }) };
    }
};

function formatEquipment(row: any) {
    return {
        id: row.id,
        name: row.name,
        equipmentType: row.equipment_type,
        capacityGrams: row.capacity_grams ? parseFloat(row.capacity_grams) : null,
        capacityUnit: row.capacity_unit,
        notes: row.notes,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

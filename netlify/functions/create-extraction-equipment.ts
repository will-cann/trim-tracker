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

        const { name, equipmentType, capacityGrams, capacityUnit, notes } = JSON.parse(event.body || '{}');

        if (!name || !equipmentType) {
            return { statusCode: 400, body: JSON.stringify({ error: 'name and equipmentType are required' }) };
        }

        const result = await sql`
            INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, capacity_unit, notes)
            VALUES (${context.companyId}, ${name}, ${equipmentType}, ${capacityGrams || null}, ${capacityUnit || 'g'}, ${notes || null})
            RETURNING *
        `;

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formatEquipment(result.rows[0])),
        };
    } catch (error) {
        console.error('Error creating equipment:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create equipment' }) };
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

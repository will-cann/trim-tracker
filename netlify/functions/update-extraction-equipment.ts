import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { id, ...updates } = JSON.parse(event.body || '{}');
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        const result = await sql`
            UPDATE extraction_equipment
            SET name = COALESCE(${updates.name ?? null}, name),
                equipment_type = COALESCE(${updates.equipmentType ?? null}, equipment_type),
                capacity_grams = CASE WHEN ${updates.capacityGrams !== undefined} THEN ${updates.capacityGrams ?? null} ELSE capacity_grams END,
                capacity_unit = COALESCE(${updates.capacityUnit ?? null}, capacity_unit),
                notes = CASE WHEN ${updates.notes !== undefined} THEN ${updates.notes ?? null} ELSE notes END,
                status = COALESCE(${updates.status ?? null}, status),
                updated_at = NOW()
            WHERE id = ${id} AND company_id = ${context.companyId}
            RETURNING *
        `;

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Equipment not found' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formatEquipment(result.rows[0])),
        };
    } catch (error) {
        console.error('Error updating equipment:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update equipment' }) };
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

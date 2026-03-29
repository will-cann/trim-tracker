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

        const roomType = event.queryStringParameters?.type;
        const detail = event.queryStringParameters?.detail === 'true';

        let result;
        if (detail && roomType) {
            result = await sql`
                SELECT r.id, r.name, r.room_type, r.capacity, r.square_footage, r.notes,
                    COALESCE(json_agg(
                        json_build_object(
                            'id', e.id,
                            'equipmentType', e.equipment_type,
                            'name', e.name,
                            'quantity', e.quantity,
                            'specs', e.specs
                        )
                    ) FILTER (WHERE e.id IS NOT NULL), '[]') AS equipment
                FROM rooms r
                LEFT JOIN room_equipment e ON e.room_id = r.id
                WHERE r.company_id = ${context.companyId} AND r.room_type = ${roomType}
                GROUP BY r.id
                ORDER BY r.name
            `;
        } else if (detail) {
            result = await sql`
                SELECT r.id, r.name, r.room_type, r.capacity, r.square_footage, r.notes,
                    COALESCE(json_agg(
                        json_build_object(
                            'id', e.id,
                            'equipmentType', e.equipment_type,
                            'name', e.name,
                            'quantity', e.quantity,
                            'specs', e.specs
                        )
                    ) FILTER (WHERE e.id IS NOT NULL), '[]') AS equipment
                FROM rooms r
                LEFT JOIN room_equipment e ON e.room_id = r.id
                WHERE r.company_id = ${context.companyId}
                GROUP BY r.id
                ORDER BY r.name
            `;
        } else if (roomType) {
            result = await sql`
                SELECT id, name, room_type, capacity, square_footage, notes
                FROM rooms
                WHERE company_id = ${context.companyId}
                    AND room_type = ${roomType}
                ORDER BY name
            `;
        } else {
            result = await sql`
                SELECT id, name, room_type, capacity, square_footage, notes
                FROM rooms
                WHERE company_id = ${context.companyId}
                ORDER BY name
            `;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows),
        };
    } catch (error) {
        console.error('Error fetching rooms:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch rooms' }),
        };
    }
};

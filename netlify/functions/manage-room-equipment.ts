import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // CREATE
        if (event.httpMethod === 'POST') {
            const { roomId, equipmentType, name, quantity, specs } = JSON.parse(event.body || '{}');
            if (!roomId || !equipmentType || !name?.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'roomId, equipmentType, and name are required' }) };
            }

            // Verify room belongs to company
            const roomCheck = await sql`
                SELECT id FROM rooms WHERE id = ${roomId} AND company_id = ${context.companyId}
            `;
            if (roomCheck.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };
            }

            const result = await sql`
                INSERT INTO room_equipment (room_id, company_id, equipment_type, name, quantity, specs)
                VALUES (
                    ${roomId},
                    ${context.companyId},
                    ${equipmentType},
                    ${name.trim()},
                    ${quantity || 1},
                    ${JSON.stringify(specs || {})}
                )
                RETURNING id, room_id, equipment_type, name, quantity, specs
            `;

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.rows[0]),
            };
        }

        // UPDATE
        if (event.httpMethod === 'PUT') {
            const { id, equipmentType, name, quantity, specs } = JSON.parse(event.body || '{}');
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Equipment ID is required' }) };
            }

            const result = await sql`
                UPDATE room_equipment SET
                    equipment_type = COALESCE(${equipmentType || null}, equipment_type),
                    name = COALESCE(${name?.trim() || null}, name),
                    quantity = COALESCE(${quantity || null}, quantity),
                    specs = COALESCE(${specs ? JSON.stringify(specs) : null}, specs),
                    updated_at = NOW()
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING id, room_id, equipment_type, name, quantity, specs
            `;

            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Equipment not found' }) };
            }

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.rows[0]),
            };
        }

        // DELETE
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Equipment ID is required' }) };
            }

            await sql`
                DELETE FROM room_equipment
                WHERE id = ${id} AND company_id = ${context.companyId}
            `;

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true }),
            };
        }

        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (error) {
        console.error('Error managing room equipment:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to manage room equipment' }),
        };
    }
};

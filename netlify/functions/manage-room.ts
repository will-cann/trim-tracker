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
            const { name, roomType, capacity, squareFootage, notes } = JSON.parse(event.body || '{}');
            if (!name?.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Room name is required' }) };
            }

            const result = await sql`
                INSERT INTO rooms (company_id, name, room_type, capacity, square_footage, notes)
                VALUES (
                    ${context.companyId},
                    ${name.trim()},
                    ${roomType || null},
                    ${capacity || null},
                    ${squareFootage || null},
                    ${notes?.trim() || null}
                )
                RETURNING id, name, room_type, capacity, square_footage, notes, created_at
            `;

            const room = result.rows[0];
            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: room.id,
                    name: room.name,
                    room_type: room.room_type,
                    capacity: room.capacity,
                    square_footage: room.square_footage,
                    notes: room.notes,
                }),
            };
        }

        // UPDATE
        if (event.httpMethod === 'PUT') {
            const { id, name, roomType, capacity, squareFootage, notes } = JSON.parse(event.body || '{}');
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Room ID is required' }) };
            }

            const result = await sql`
                UPDATE rooms SET
                    name = COALESCE(${name?.trim() || null}, name),
                    room_type = COALESCE(${roomType}, room_type),
                    capacity = ${capacity === undefined ? null : capacity},
                    square_footage = ${squareFootage === undefined ? null : squareFootage},
                    notes = ${notes === undefined ? null : notes?.trim() || null},
                    updated_at = NOW()
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING id, name, room_type, capacity, square_footage, notes
            `;

            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };
            }

            const room = result.rows[0];
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(room),
            };
        }

        // DELETE
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Room ID is required' }) };
            }

            // Check for plants in this room
            const plantCheck = await sql`
                SELECT
                    (SELECT COUNT(*) FROM plants WHERE room_id = ${id}) +
                    (SELECT COUNT(*) FROM plant_batches WHERE room_id = ${id}) AS plant_count
            `;
            const plantCount = parseInt(plantCheck.rows[0]?.plant_count || '0');

            await sql`
                DELETE FROM rooms
                WHERE id = ${id} AND company_id = ${context.companyId}
            `;

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, affectedPlants: plantCount }),
            };
        }

        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (error: any) {
        console.error('Error managing room:', error);

        // Handle unique constraint violation
        if (error?.code === '23505') {
            return {
                statusCode: 409,
                body: JSON.stringify({ error: 'A room with that name already exists' }),
            };
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to manage room' }),
        };
    }
};

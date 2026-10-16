import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

const MAX_GRID = 60;

function validateLayout(rows: unknown, cols: unknown): string | null {
    for (const [label, v] of [['Rows', rows], ['Columns', cols]] as const) {
        if (v === undefined || v === null) continue;
        if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > MAX_GRID) {
            return `${label} must be a whole number between 1 and ${MAX_GRID} (or empty to clear the grid).`;
        }
    }
    return null;
}

export const handler: Handler = async (event) => {
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'director');
        if (denied) return denied;

        // CREATE
        if (event.httpMethod === 'POST') {
            const { name, roomType, capacity, squareFootage, notes, layoutRows, layoutCols } = JSON.parse(event.body || '{}');
            if (!name?.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Room name is required' }) };
            }
            const layoutErr = validateLayout(layoutRows, layoutCols);
            if (layoutErr) return { statusCode: 400, body: JSON.stringify({ error: layoutErr }) };

            const result = await sql`
                INSERT INTO rooms (company_id, name, room_type, capacity, square_footage, notes, layout_rows, layout_cols)
                VALUES (
                    ${context.companyId},
                    ${name.trim()},
                    ${roomType || null},
                    ${capacity || null},
                    ${squareFootage || null},
                    ${notes?.trim() || null},
                    ${layoutRows || null},
                    ${layoutCols || null}
                )
                RETURNING id, name, room_type, capacity, square_footage, notes, layout_rows, layout_cols, created_at
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
                    layout_rows: room.layout_rows,
                    layout_cols: room.layout_cols,
                }),
            };
        }

        // UPDATE
        if (event.httpMethod === 'PUT') {
            const { id, name, roomType, capacity, squareFootage, notes, layoutRows, layoutCols } = JSON.parse(event.body || '{}');
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Room ID is required' }) };
            }
            const layoutErr = validateLayout(layoutRows, layoutCols);
            if (layoutErr) return { statusCode: 400, body: JSON.stringify({ error: layoutErr }) };

            // Shrinking the grid takes any plant that no longer fits off the grid
            // (it keeps its room; it just needs placing again).
            if (layoutRows !== undefined || layoutCols !== undefined) {
                await sql`
                    UPDATE plants SET position_row = NULL, position_col = NULL
                    WHERE company_id = ${context.companyId} AND room_id = ${id}
                      AND position_row IS NOT NULL AND position_col IS NOT NULL
                      AND (
                           (${layoutRows === undefined ? null : (layoutRows || 0)}::int IS NOT NULL AND position_row >= ${layoutRows === undefined ? null : (layoutRows || 0)}::int)
                        OR (${layoutCols === undefined ? null : (layoutCols || 0)}::int IS NOT NULL AND position_col >= ${layoutCols === undefined ? null : (layoutCols || 0)}::int)
                      )
                `;
            }

            const result = await sql`
                UPDATE rooms SET
                    name = COALESCE(${name?.trim() || null}, name),
                    room_type = COALESCE(${roomType}, room_type),
                    capacity = CASE WHEN ${capacity !== undefined} THEN ${capacity ?? null} ELSE capacity END,
                    square_footage = CASE WHEN ${squareFootage !== undefined} THEN ${squareFootage ?? null} ELSE square_footage END,
                    notes = CASE WHEN ${notes !== undefined} THEN ${notes?.trim() || null} ELSE notes END,
                    layout_rows = CASE WHEN ${layoutRows !== undefined} THEN ${layoutRows || null} ELSE layout_rows END,
                    layout_cols = CASE WHEN ${layoutCols !== undefined} THEN ${layoutCols || null} ELSE layout_cols END,
                    updated_at = NOW()
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING id, name, room_type, capacity, square_footage, notes, layout_rows, layout_cols
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

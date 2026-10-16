import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

/**
 * POST /set-plant-positions
 *   { roomId, placements: [{ plantId, row, col }], clearPlantIds?: string[] }
 *
 * Places (or swaps) plants on a room's grid in one transaction. Plants in
 * `placements` are moved into `roomId` if they aren't there already, so this
 * doubles as the cross-room move used by the planner. `clearPlantIds` takes
 * plants off the grid without changing their room.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }
        const denied = authorize(context, 'technician');
        if (denied) return denied;

        const body = JSON.parse(event.body || '{}');
        const roomId: string | undefined = body.roomId;
        const placements: Array<{ plantId: string; row: number; col: number }> = Array.isArray(body.placements) ? body.placements : [];
        const clearPlantIds: string[] = Array.isArray(body.clearPlantIds) ? body.clearPlantIds.filter((x: unknown) => typeof x === 'string') : [];

        if (!roomId && placements.length > 0) {
            return json(400, { error: 'roomId is required when placing plants.' });
        }
        if (placements.length === 0 && clearPlantIds.length === 0) {
            return json(400, { error: 'Nothing to do: pass placements or clearPlantIds.' });
        }
        for (const p of placements) {
            if (typeof p.plantId !== 'string' || !Number.isInteger(p.row) || !Number.isInteger(p.col) || p.row < 0 || p.col < 0) {
                return json(400, { error: 'Each placement needs plantId, row and col (non-negative integers).' });
            }
        }
        const seenCells = new Set<string>();
        const seenPlants = new Set<string>();
        for (const p of placements) {
            const key = `${p.row}:${p.col}`;
            if (seenCells.has(key)) return json(400, { error: `Cell ${p.row + 1}/${p.col + 1} is assigned twice.` });
            if (seenPlants.has(p.plantId)) return json(400, { error: 'A plant appears twice in placements.' });
            seenCells.add(key);
            seenPlants.add(p.plantId);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let room: any = null;
            if (roomId) {
                const { rows } = await client.query(
                    'SELECT id, name, layout_rows, layout_cols FROM rooms WHERE id = $1 AND company_id = $2',
                    [roomId, context.companyId],
                );
                room = rows[0];
                if (!room) {
                    await client.query('ROLLBACK');
                    return json(404, { error: 'Room not found.' });
                }
                if (placements.length > 0 && (!room.layout_rows || !room.layout_cols)) {
                    await client.query('ROLLBACK');
                    return json(400, { error: 'This room has no grid yet. Set rows and columns in Settings → Rooms first.' });
                }
                for (const p of placements) {
                    if (p.row >= room.layout_rows || p.col >= room.layout_cols) {
                        await client.query('ROLLBACK');
                        return json(400, { error: `Cell ${p.row + 1}/${p.col + 1} is outside the ${room.layout_rows}×${room.layout_cols} grid.` });
                    }
                }
            }

            const allIds = [...new Set([...placements.map(p => p.plantId), ...clearPlantIds])];
            const { rows: owned } = await client.query(
                `SELECT id FROM plants WHERE id = ANY($1::uuid[]) AND company_id = $2 AND growth_phase IN ('vegetative', 'flowering')`,
                [allIds, context.companyId],
            );
            if (owned.length !== allIds.length) {
                await client.query('ROLLBACK');
                return json(404, { error: 'One or more plants were not found or are no longer live.' });
            }

            // Release every touched cell first so swaps don't trip the unique index.
            await client.query(
                `UPDATE plants SET position_row = NULL, position_col = NULL WHERE id = ANY($1::uuid[]) AND company_id = $2`,
                [allIds, context.companyId],
            );

            // Any plant already sitting on a target cell (and not being re-placed itself) gets bumped off the grid.
            const bumped: string[] = [];
            if (placements.length > 0) {
                const rowsArr = placements.map(p => p.row);
                const colsArr = placements.map(p => p.col);
                const { rows: occupants } = await client.query(
                    `SELECT id, label FROM plants
                     WHERE company_id = $1 AND room_id = $2
                       AND growth_phase IN ('vegetative', 'flowering')
                       AND (position_row, position_col) IN (SELECT unnest($3::int[]), unnest($4::int[]))`,
                    [context.companyId, roomId, rowsArr, colsArr],
                );
                if (occupants.length > 0) {
                    await client.query(
                        `UPDATE plants SET position_row = NULL, position_col = NULL WHERE id = ANY($1::uuid[])`,
                        [occupants.map((o: any) => o.id)],
                    );
                    bumped.push(...occupants.map((o: any) => o.label));
                }
            }

            for (const p of placements) {
                await client.query(
                    `UPDATE plants SET room_id = $1, position_row = $2, position_col = $3
                     WHERE id = $4 AND company_id = $5`,
                    [roomId, p.row, p.col, p.plantId, context.companyId],
                );
            }

            await client.query('COMMIT');
            return json(200, {
                success: true,
                placed: placements.length,
                cleared: clearPlantIds.length,
                bumped,
                room: room ? { id: room.id, name: room.name } : null,
            });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error setting plant positions:', msg);
        return json(500, { error: 'Failed to set plant positions', detail: msg });
    }
};

function json(statusCode: number, body: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

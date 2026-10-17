import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';
import { rotScoreToSeverity, rotScoreLabel } from '../../shared/plantMap/roomSheet';
import type { ParsedRoomSheet } from '../../shared/plantMap/roomSheet';

/**
 * POST /import-room-sheet
 *   { roomId?, roomName?, observedAt (YYYY-MM-DD), sheet: ParsedRoomSheet }
 *
 * The client parses the workbook (shared/plantMap/roomSheet.ts) and sends
 * the structured result. In one transaction this:
 *   1. finds or creates the room and sets its grid + section labels,
 *   2. replaces the room's tables (strain + plant count per cell),
 *   3. replaces that day's sheet-sourced bud-rot events with the scores.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return json(401, { error: 'Unauthorized' });
        const denied = authorize(context, 'technician');
        if (denied) return denied;

        const body = JSON.parse(event.body || '{}');
        const sheet = body.sheet as ParsedRoomSheet | undefined;
        if (!sheet || !Array.isArray(sheet.tables) || !Array.isArray(sheet.scores)) {
            return json(400, { error: 'sheet (parsed room workbook) is required.' });
        }
        const rows = Number.isInteger(sheet.rows) ? sheet.rows : 0;
        const cols = Number.isInteger(sheet.cols) ? sheet.cols : 0;
        if (rows < 1 || cols < 1 || rows > 60 || cols > 60) {
            return json(400, { error: `The sheet describes a ${rows}×${cols} grid; rooms support 1–60 benches and positions.` });
        }
        const observedAt = typeof body.observedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.observedAt) ? body.observedAt : null;
        if (sheet.scores.length > 0 && !observedAt) {
            return json(400, { error: 'observedAt (YYYY-MM-DD) is required when the sheet has scores.' });
        }
        const roomName = typeof body.roomName === 'string' && body.roomName.trim() ? body.roomName.trim() : sheet.roomName?.trim();
        const roomId = typeof body.roomId === 'string' ? body.roomId : null;
        if (!roomId && !roomName) return json(400, { error: 'roomId or roomName is required.' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Room
            let room: any = null;
            if (roomId) {
                const r = await client.query('SELECT id, name FROM rooms WHERE id = $1 AND company_id = $2', [roomId, context.companyId]);
                room = r.rows[0] ?? null;
                if (!room) { await client.query('ROLLBACK'); return json(404, { error: 'Room not found.' }); }
            } else {
                const r = await client.query('SELECT id, name FROM rooms WHERE company_id = $1 AND LOWER(name) = LOWER($2)', [context.companyId, roomName]);
                room = r.rows[0] ?? null;
            }
            let created = false;
            if (!room) {
                const r = await client.query(
                    `INSERT INTO rooms (company_id, name, room_type) VALUES ($1, $2, 'flower') RETURNING id, name`,
                    [context.companyId, roomName],
                );
                room = r.rows[0];
                created = true;
            }
            const layoutMeta = {
                sections: (sheet.sections ?? []).map(s => ({ name: String(s.name).slice(0, 80), rowStart: s.rowStart, rowCount: s.rowCount })),
                colStartLabel: sheet.colStartLabel ?? null,
                colEndLabel: sheet.colEndLabel ?? null,
            };
            await client.query(
                `UPDATE rooms SET layout_rows = $1, layout_cols = $2, layout_meta = $3::jsonb, updated_at = NOW() WHERE id = $4 AND company_id = $5`,
                [rows, cols, JSON.stringify(layoutMeta), room.id, context.companyId],
            );
            // Plants placed beyond the new grid come off the grid.
            await client.query(
                `UPDATE plants SET position_row = NULL, position_col = NULL
                 WHERE company_id = $1 AND room_id = $2 AND (position_row >= $3 OR position_col >= $4)`,
                [context.companyId, room.id, rows, cols],
            );

            // 2. Tables
            await client.query('DELETE FROM room_tables WHERE room_id = $1 AND company_id = $2', [room.id, context.companyId]);
            let tables = 0;
            let plants = 0;
            for (const t of sheet.tables) {
                if (!Number.isInteger(t.row) || !Number.isInteger(t.col) || t.row < 0 || t.col < 0 || t.row >= rows || t.col >= cols) continue;
                const strains = (Array.isArray(t.strains) ? t.strains : [])
                    .filter(s => s && typeof s.strain === 'string' && s.strain.trim())
                    .map(s => ({ strain: s.strain.trim().toUpperCase().slice(0, 60), count: Number.isFinite(s.count as number) ? Math.round(s.count as number) : null }));
                const count = Number.isFinite(t.plantCount) ? Math.max(0, Math.round(t.plantCount)) : 0;
                await client.query(
                    `INSERT INTO room_tables (company_id, room_id, position_row, position_col, section, strains, plant_count, source)
                     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'sheet')
                     ON CONFLICT (room_id, position_row, position_col)
                     DO UPDATE SET section = EXCLUDED.section, strains = EXCLUDED.strains, plant_count = EXCLUDED.plant_count, source = 'sheet', updated_at = NOW()`,
                    [context.companyId, room.id, t.row, t.col, t.section ? String(t.section).slice(0, 80) : null, JSON.stringify(strains), count],
                );
                tables++;
                plants += count;
            }

            // 3. Scores → bud-rot events for that day (replace the day's sheet events for this room)
            let events = 0;
            if (observedAt) {
                await client.query(
                    `DELETE FROM plant_health_events WHERE company_id = $1 AND room_id = $2 AND source = 'sheet' AND observed_at::date = $3::date`,
                    [context.companyId, room.id, observedAt],
                );
                const tableAt = new Map(sheet.tables.map(t => [`${t.row}:${t.col}`, t]));
                for (const s of sheet.scores) {
                    if (!Number.isInteger(s.row) || !Number.isInteger(s.col) || s.row < 0 || s.col < 0 || s.row >= rows || s.col >= cols) continue;
                    const score = Number(s.score);
                    if (!Number.isFinite(score) || score <= 0 || score > 3) continue;
                    const table = tableAt.get(`${s.row}:${s.col}`);
                    const strain = (s.strain || table?.strains?.[0]?.strain || null);
                    const label = table ? table.strains.map(x => x.strain).join('/') : (strain ?? 'table');
                    await client.query(
                        `INSERT INTO plant_health_events (
                            company_id, plant_id, plant_label, strain_name, room_id, room_name,
                            position_row, position_col, contaminant, severity, rot_score, note,
                            growth_phase, status, observed_at, source, reported_by
                        ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'botrytis', $8, $9, $10, 'flowering', 'active', ($11::date + INTERVAL '12 hours'), 'sheet',
                                  (SELECT id FROM users WHERE id = $12))`,
                        [
                            context.companyId, `${label} table`, strain, room.id, room.name, s.row, s.col,
                            rotScoreToSeverity(score), score,
                            `Sheet score ${score} — ${rotScoreLabel(score)}${s.sourceCell ? ` (${s.sourceCell})` : ''}`,
                            observedAt, context.userId,
                        ],
                    );
                    events++;
                }
                // Earlier sheet events on this room that weren't re-scored today are over: resolve them.
                await client.query(
                    `UPDATE plant_health_events SET status = 'resolved', resolved_at = NOW()
                     WHERE company_id = $1 AND room_id = $2 AND source = 'sheet' AND status = 'active' AND observed_at::date < $3::date`,
                    [context.companyId, room.id, observedAt],
                );
            }

            await client.query('COMMIT');
            return json(200, { success: true, room: { id: room.id, name: room.name, created }, rows, cols, tables, plants, events, observedAt });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[import-room-sheet] error', msg);
        return json(500, { error: 'Failed to import room sheet', detail: msg });
    }
};

function json(statusCode: number, body: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

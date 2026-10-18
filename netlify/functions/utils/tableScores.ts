import { sql } from './db';
import { severityToRotScore, tableRoomHealth } from '../../../shared/plantMap/roomSheet';

/**
 * Table scores: cell-level health events (plant_id IS NULL, a grid position)
 * on rooms tracked by table — bud-rot sheet imports and in-app "Score this
 * table". Unlike plant events they have no plant whose harvest ends them, so
 * their lifecycle is handled here:
 *
 *  - a newer sheet import resolves the previous day's scores (import-room-sheet);
 *  - once a room's plants are all harvested or destroyed, its open table
 *    scores are over (settleTableScoresForRooms, from plant-actions and the
 *    Metrc sync);
 *  - anything still open after TABLE_SCORE_MAX_AGE_DAYS is closed by the
 *    nightly metrics run, since no flower cycle lasts that long.
 */

/** Longer than any flower cycle: a score this old describes plants that are gone. */
export const TABLE_SCORE_MAX_AGE_DAYS = 90;

const TABLE_SCORE = `e.plant_id IS NULL AND e.position_row IS NOT NULL AND e.room_id IS NOT NULL`;

/**
 * Resolve open table scores in rooms that no longer hold live plants.
 *
 * With `roomIds` (an in-app harvest/destroy just ran on plants from those
 * rooms) a room only needs to be empty of live plants. Without it (after a
 * Metrc sync) a room must also hold a plant harvested or destroyed since the
 * score was taken, so a room that is scored by sheet but has no plant rows at
 * all is left to the age cap rather than closed on the first run.
 */
export async function settleTableScoresForRooms(companyId: string, roomIds?: readonly string[]): Promise<number> {
    if (roomIds && roomIds.length === 0) return 0;
    const { rows } = roomIds
        ? await sql`
            UPDATE plant_health_events e
            SET status = 'resolved', resolved_at = NOW()
            WHERE e.company_id = ${companyId} AND e.status = 'active'
              AND e.plant_id IS NULL AND e.position_row IS NOT NULL AND e.room_id IS NOT NULL
              AND e.room_id = ANY(${[...roomIds]}::uuid[])
              AND NOT EXISTS (
                  SELECT 1 FROM plants p
                  WHERE p.company_id = e.company_id AND p.room_id = e.room_id AND p.growth_phase IN ('vegetative', 'flowering')
              )
            RETURNING e.id`
        : await sql`
            UPDATE plant_health_events e
            SET status = 'resolved', resolved_at = NOW()
            WHERE e.company_id = ${companyId} AND e.status = 'active'
              AND e.plant_id IS NULL AND e.position_row IS NOT NULL AND e.room_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM plants p
                  WHERE p.company_id = e.company_id AND p.room_id = e.room_id AND p.growth_phase IN ('vegetative', 'flowering')
              )
              AND EXISTS (
                  SELECT 1 FROM plants p
                  WHERE p.company_id = e.company_id AND p.room_id = e.room_id
                    AND COALESCE(p.harvested_date, p.destroyed_date) >= e.observed_at
              )
            RETURNING e.id`;
    return rows.length;
}

/** Close table scores older than the age cap. Returns how many were closed. */
export async function expireStaleTableScores(companyId: string, maxAgeDays = TABLE_SCORE_MAX_AGE_DAYS): Promise<number> {
    const { rows } = await sql`
        UPDATE plant_health_events e
        SET status = 'resolved', resolved_at = NOW()
        WHERE e.company_id = ${companyId} AND e.status = 'active'
          AND e.plant_id IS NULL AND e.position_row IS NOT NULL AND e.room_id IS NOT NULL
          AND e.observed_at < NOW() - make_interval(days => ${maxAgeDays})
        RETURNING e.id`;
    return rows.length;
}

export interface TableRoomRollup {
    roomId: string;
    roomName: string;
    /** Plant-weighted health from the tables' latest active scores (unscored = 100). */
    health: number;
    plants: number;
    strains: string[];
    scoredTables: number;
    /** Contaminants with an active table score in the room. */
    contaminants: string[];
}

/**
 * Per-room roll-up of room_tables plus each table's latest active score, for
 * the cards view: a table room reads its health from its scores, the way a
 * plant room reads it from plant_health.
 */
export async function tableRoomRollups(companyId: string): Promise<Map<string, TableRoomRollup>> {
    const { rows: tables } = await sql`
        SELECT t.room_id, r.name AS room_name, t.position_row, t.position_col, t.plant_count, t.strains
        FROM room_tables t JOIN rooms r ON r.id = t.room_id
        WHERE t.company_id = ${companyId}
    `;
    if (tables.length === 0) return new Map();
    const { rows: scores } = await sql`
        SELECT DISTINCT ON (room_id, position_row, position_col)
               room_id, position_row, position_col, rot_score, severity, contaminant
        FROM plant_health_events
        WHERE company_id = ${companyId} AND status = 'active'
          AND plant_id IS NULL AND position_row IS NOT NULL AND room_id IS NOT NULL
        ORDER BY room_id, position_row, position_col, observed_at DESC
    `;
    const scoreByCell = new Map<string, { score: number; contaminant: string }>();
    for (const s of scores) {
        const score = s.rot_score != null ? Number(s.rot_score) : severityToRotScore(Number(s.severity));
        scoreByCell.set(`${s.room_id}:${s.position_row}:${s.position_col}`, { score, contaminant: s.contaminant });
    }

    const byRoom = new Map<string, { roomName: string; inputs: Array<{ plantCount: number; score: number | null }>; strains: Set<string>; contaminants: Set<string> }>();
    for (const t of tables) {
        const room = byRoom.get(t.room_id) ?? { roomName: t.room_name, inputs: [], strains: new Set<string>(), contaminants: new Set<string>() };
        const cell = scoreByCell.get(`${t.room_id}:${t.position_row}:${t.position_col}`);
        room.inputs.push({ plantCount: Number(t.plant_count) || 0, score: cell?.score ?? null });
        if (cell) room.contaminants.add(cell.contaminant);
        const strains = typeof t.strains === 'string' ? JSON.parse(t.strains) : t.strains;
        for (const s of Array.isArray(strains) ? strains : []) if (s?.strain) room.strains.add(String(s.strain));
        byRoom.set(t.room_id, room);
    }

    const out = new Map<string, TableRoomRollup>();
    for (const [roomId, room] of byRoom) {
        const h = tableRoomHealth(room.inputs);
        out.set(roomId, { roomId, roomName: room.roomName, health: h.health, plants: h.plants, strains: [...room.strains].sort(), scoredTables: h.scoredTables, contaminants: [...room.contaminants].sort() });
    }
    return out;
}

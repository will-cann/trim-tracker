import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';
import { CONTAMINANT_MAP, normalizeContaminant, clampSeverity, computeHealthFromIssues } from '../../shared/plantMap/health';
import { rotScoreToSeverity, rotScoreLabel } from '../../shared/plantMap/roomSheet';
import { serializeEvent } from './utils/plantMap';

/**
 * Plant health event log.
 *
 *   POST  { plantIds: string[], contaminant, severity?, rotScore?, note?, observedAt?, row?, col? }
 *         Logs one event per plant, snapshotting the plant's room and cell at
 *         observation time, and adds the contaminant to the plant's current
 *         state (plants.contaminants + recomputed plant_health).
 *         Or, for a table-granularity room (no plant ids):
 *         { roomId, row, col, strainName?, contaminant, severity?, rotScore?, note?, observedAt? }
 *         Logs one cell-level event. rotScore (0.5–3, the operator's bud-rot
 *         scale) sets severity when given.
 *   PATCH { eventIds?: string[], plantIds?: string[], contaminant?: string }
 *         Resolves matching active events. When a plant has no more active
 *         events for a contaminant, it's removed from plants.contaminants.
 *   GET   ?roomId=&plantId=&contaminant=&status=&days=&limit=
 *         Lists events, newest first.
 */
export const handler: Handler = async (event) => {
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        if (event.httpMethod === 'GET') {
            const q = event.queryStringParameters ?? {};
            const roomId = q.roomId || null;
            const plantId = q.plantId || null;
            const contaminant = q.contaminant ? normalizeContaminant(q.contaminant) : null;
            const status = q.status === 'active' || q.status === 'resolved' ? q.status : null;
            const days = q.days ? Math.max(1, parseInt(q.days, 10) || 0) : null;
            const limit = Math.min(500, Math.max(1, parseInt(q.limit ?? '200', 10) || 200));

            const { rows } = await sql`
                SELECT e.id, e.plant_id, e.plant_label, e.strain_name, e.room_id, e.room_name,
                       e.position_row, e.position_col, e.contaminant, e.severity, e.note,
                       e.growth_phase, e.flowering_day, e.status, e.rot_score, e.source, e.observed_at, e.resolved_at
                FROM plant_health_events e
                WHERE e.company_id = ${context.companyId}
                  AND (${roomId}::uuid IS NULL OR e.room_id = ${roomId}::uuid)
                  AND (${plantId}::uuid IS NULL OR e.plant_id = ${plantId}::uuid)
                  AND (${contaminant}::text IS NULL OR e.contaminant = ${contaminant}::text)
                  AND (${status}::text IS NULL OR e.status = ${status}::text)
                  AND (${days}::int IS NULL OR e.observed_at >= NOW() - (${days}::int * INTERVAL '1 day'))
                ORDER BY e.observed_at DESC
                LIMIT ${limit}
            `;
            return json(200, rows.map(serializeEvent));
        }

        const denied = authorize(context, 'technician');
        if (denied) return denied;

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const plantIds: string[] = Array.isArray(body.plantIds) ? body.plantIds.filter((x: unknown) => typeof x === 'string') : [];
            const cellMode = plantIds.length === 0 && typeof body.roomId === 'string' && Number.isInteger(body.row) && Number.isInteger(body.col);
            if (plantIds.length === 0 && !cellMode) {
                return json(400, { error: 'plantIds is required (or roomId + row + col for a table cell).' });
            }
            const contaminant = typeof body.contaminant === 'string' ? normalizeContaminant(body.contaminant) : null;
            if (!contaminant) {
                return json(400, { error: `Unknown contaminant. Use one of: ${Object.keys(CONTAMINANT_MAP).join(', ')}` });
            }
            const rotScore = typeof body.rotScore === 'number' && body.rotScore > 0 && body.rotScore <= 3 ? Math.round(body.rotScore * 2) / 2 : null;
            const severity = rotScore != null ? rotScoreToSeverity(rotScore) : clampSeverity(body.severity);
            const rawNote = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
            const note = rotScore != null && contaminant === 'botrytis'
                ? [`Score ${rotScore} — ${rotScoreLabel(rotScore)}`, rawNote].filter(Boolean).join('. ')
                : rawNote;
            const source = body.source === 'ai' ? 'ai' : 'app';
            const observedAt = typeof body.observedAt === 'string' && Number.isFinite(Date.parse(body.observedAt))
                ? new Date(body.observedAt).toISOString()
                : new Date().toISOString();
            // Optional explicit cell (e.g. the issue was spotted on an unplaced plant at a known bench spot).
            const overrideRow = Number.isInteger(body.row) ? body.row : null;
            const overrideCol = Number.isInteger(body.col) ? body.col : null;

            if (cellMode) {
                const { rows: roomRows } = await sql`
                    SELECT r.id, r.name, t.strains
                    FROM rooms r
                    LEFT JOIN room_tables t ON t.room_id = r.id AND t.position_row = ${body.row} AND t.position_col = ${body.col}
                    WHERE r.id = ${body.roomId}::uuid AND r.company_id = ${context.companyId}
                `;
                const room = roomRows[0];
                if (!room) return json(404, { error: 'Room not found.' });
                const tableStrains: Array<{ strain: string }> = Array.isArray(room.strains) ? room.strains : [];
                const strainName = typeof body.strainName === 'string' && body.strainName.trim() ? body.strainName.trim() : (tableStrains[0]?.strain ?? null);
                const label = tableStrains.length ? `${tableStrains.map(s => s.strain).join('/')} table` : `R${body.row + 1}·${body.col + 1}`;
                const { rows: inserted } = await sql`
                    INSERT INTO plant_health_events (
                        company_id, plant_id, plant_label, strain_name, room_id, room_name,
                        position_row, position_col, contaminant, severity, rot_score, note,
                        growth_phase, status, observed_at, source, reported_by
                    ) VALUES (
                        ${context.companyId}, NULL, ${label}, ${strainName}, ${room.id}::uuid, ${room.name},
                        ${body.row}, ${body.col}, ${contaminant}, ${severity}, ${rotScore}, ${note},
                        'flowering', 'active', ${observedAt}::timestamptz, ${source},
                        (SELECT id FROM users WHERE id = ${context.userId}::uuid)
                    )
                    RETURNING *
                `;
                return json(201, { success: true, created: [serializeEvent(inserted[0])], affected: 1 });
            }

            const { rows: plants } = await sql`
                SELECT p.id, p.label, p.strain_name, p.room_id, r.name AS room_name,
                       p.position_row, p.position_col, p.growth_phase,
                       p.flowering_date::text AS flowering_date, p.contaminants
                FROM plants p
                LEFT JOIN rooms r ON r.id = p.room_id
                WHERE p.id = ANY(${plantIds}::uuid[]) AND p.company_id = ${context.companyId}
            `;
            if (plants.length === 0) {
                return json(404, { error: 'No matching plants.' });
            }

            const created: any[] = [];
            for (const p of plants) {
                const floweringDay = p.growth_phase === 'flowering' && p.flowering_date
                    ? Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(p.flowering_date)) / 86_400_000))
                    : null;
                const row = overrideRow ?? p.position_row ?? null;
                const col = overrideCol ?? p.position_col ?? null;
                const { rows: inserted } = await sql`
                    INSERT INTO plant_health_events (
                        company_id, plant_id, plant_label, strain_name, room_id, room_name,
                        position_row, position_col, contaminant, severity, rot_score, note,
                        growth_phase, flowering_day, status, observed_at, source, reported_by
                    ) VALUES (
                        ${context.companyId}, ${p.id}::uuid, ${p.label}, ${p.strain_name}, ${p.room_id}::uuid, ${p.room_name ?? null},
                        ${row}, ${col}, ${contaminant}, ${severity}, ${rotScore}, ${note},
                        ${p.growth_phase}, ${floweringDay}, 'active', ${observedAt}::timestamptz, ${source},
                        (SELECT id FROM users WHERE id = ${context.userId}::uuid)
                    )
                    RETURNING *
                `;
                created.push(serializeEvent(inserted[0]));

                // Keep the plant's current state in step with the log.
                const current: string[] = Array.isArray(p.contaminants) ? p.contaminants : [];
                if (!current.includes(contaminant)) {
                    const next = [...current, contaminant];
                    const { score } = computeHealthFromIssues(next);
                    await sql`
                        UPDATE plants
                        SET contaminants = ${next}::text[],
                            plant_health = LEAST(plant_health, ${score})
                        WHERE id = ${p.id}::uuid AND company_id = ${context.companyId}
                    `;
                }
            }

            return json(201, { success: true, created, affected: created.length });
        }

        if (event.httpMethod === 'PATCH') {
            const body = JSON.parse(event.body || '{}');
            const eventIds: string[] = Array.isArray(body.eventIds) ? body.eventIds.filter((x: unknown) => typeof x === 'string') : [];
            const plantIds: string[] = Array.isArray(body.plantIds) ? body.plantIds.filter((x: unknown) => typeof x === 'string') : [];
            const contaminant = typeof body.contaminant === 'string' ? normalizeContaminant(body.contaminant) : null;
            if (eventIds.length === 0 && plantIds.length === 0) {
                return json(400, { error: 'eventIds or plantIds is required.' });
            }
            if (plantIds.length > 0 && eventIds.length === 0 && !contaminant && body.contaminant) {
                return json(400, { error: 'Unknown contaminant.' });
            }

            const { rows: resolved } = await sql`
                UPDATE plant_health_events
                SET status = 'resolved', resolved_at = NOW()
                WHERE company_id = ${context.companyId}
                  AND status = 'active'
                  AND (
                        (${eventIds.length > 0} AND id = ANY(${eventIds}::uuid[]))
                     OR (${plantIds.length > 0} AND plant_id = ANY(${plantIds}::uuid[])
                         AND (${contaminant}::text IS NULL OR contaminant = ${contaminant}::text))
                  )
                RETURNING *
            `;

            // Drop contaminants that no longer have an active event on the plant.
            const touched = [...new Set(resolved.map((e: any) => e.plant_id).filter(Boolean))] as string[];
            for (const pid of touched) {
                const { rows: still } = await sql`
                    SELECT DISTINCT contaminant FROM plant_health_events
                    WHERE plant_id = ${pid}::uuid AND company_id = ${context.companyId} AND status = 'active'
                `;
                const stillActive = new Set(still.map((r: any) => r.contaminant));
                const resolvedHere = new Set(resolved.filter((e: any) => e.plant_id === pid).map((e: any) => e.contaminant));
                const { rows: [plant] } = await sql`
                    SELECT contaminants FROM plants WHERE id = ${pid}::uuid AND company_id = ${context.companyId}
                `;
                if (!plant) continue;
                const current: string[] = Array.isArray(plant.contaminants) ? plant.contaminants : [];
                const next = current.filter(c => !(resolvedHere.has(c) && !stillActive.has(c)));
                if (next.length !== current.length) {
                    const { score } = computeHealthFromIssues(next);
                    await sql`
                        UPDATE plants SET contaminants = ${next}::text[], plant_health = ${score}
                        WHERE id = ${pid}::uuid AND company_id = ${context.companyId}
                    `;
                }
            }

            return json(200, { success: true, resolved: resolved.map(serializeEvent), affected: resolved.length });
        }

        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error in plant-health-events:', msg);
        return json(500, { error: 'Failed to process plant health event', detail: msg });
    }
};

function json(statusCode: number, body: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * Flat plant list for the plant map's table, schedule and calendar views.
 *
 * A facility synced from Metrc can hold tens of thousands of plants, which
 * no longer fits in one function response (Netlify caps bodies at 6 MB), so
 * this endpoint filters and pages server-side:
 *
 *   ?phases=vegetative,flowering   phases to include (default: nursery, vegetative, flowering;
 *                                  `harvested` only when asked for; destroyed never)
 *   ?phase=flowering               single-phase form, kept for older callers
 *   ?rooms=Veg 1,Veg 2             room names
 *   ?strains=Gelato,Runtz          strain names
 *   ?q=text                        matches label, strain or room
 *   ?limit=500&offset=0            page (limit capped at 2000)
 *   ?group=room_strain_phase       one row per room + strain + phase with a count and the
 *                                  earliest dates — what the schedule and calendar need
 *
 * Responds with the rows as an array (same shape as before) and the total
 * matching count in the X-Total-Count header.
 */

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const PLANT_PHASES = ['vegetative', 'flowering', 'harvested'] as const;

const list = (raw: string | undefined) =>
    (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const qs = event.queryStringParameters || {};
        const requested = qs.phases ? list(qs.phases) : qs.phase ? [qs.phase] : [];
        const phases = requested.length ? requested : ['nursery', 'vegetative', 'flowering'];
        const plantPhases = phases.filter((p): p is typeof PLANT_PHASES[number] => (PLANT_PHASES as readonly string[]).includes(p));
        const includeBatches = phases.includes('nursery');
        const rooms = list(qs.rooms);
        const strains = list(qs.strains);
        const q = (qs.q ?? '').trim() || null;
        const grouped = qs.group === 'room_strain_phase';
        const limit = grouped ? MAX_LIMIT : Math.min(MAX_LIMIT, Math.max(1, parseInt(qs.limit ?? '', 10) || DEFAULT_LIMIT));
        const offset = grouped ? 0 : Math.max(0, parseInt(qs.offset ?? '', 10) || 0);

        // Optional filters are passed as NULL-or-array so one statement serves every combination.
        const roomsArg = rooms.length ? rooms : null;
        const strainsArg = strains.length ? strains : null;
        const like = q ? `%${q}%` : null;

        let plantRows: any[] = [];
        let plantTotal = 0;
        if (plantPhases.length) {
            if (grouped) {
                const result = await sql`
                    SELECT
                        MIN(p.id::text) AS id,
                        p.strain_name,
                        p.growth_phase,
                        r.name AS room_name,
                        ROUND(AVG(p.plant_health))::int AS plant_health,
                        COUNT(*)::int AS batch_count,
                        MIN(p.planted_date)::text AS planted_date,
                        MIN(p.vegetative_date)::text AS vegetative_date,
                        MIN(p.flowering_date)::text AS flowering_date,
                        MIN(p.target_harvest_date)::text AS target_harvest_date,
                        MIN(s.feed_profile) AS feed_profile,
                        MIN(s.default_flowering_days) AS default_flowering_days,
                        MIN(s.stretch_trait) AS stretch_trait
                    FROM plants p
                    LEFT JOIN rooms r ON r.id = p.room_id
                    LEFT JOIN strains s ON s.company_id = p.company_id AND LOWER(s.name) = LOWER(p.strain_name)
                    WHERE p.company_id = ${context.companyId}
                      AND p.growth_phase = ANY(${plantPhases}::text[])
                      AND (${roomsArg}::text[] IS NULL OR r.name = ANY(${roomsArg}::text[]))
                      AND (${strainsArg}::text[] IS NULL OR p.strain_name = ANY(${strainsArg}::text[]))
                      AND (${like}::text IS NULL OR p.label ILIKE ${like} OR p.strain_name ILIKE ${like} OR r.name ILIKE ${like})
                    GROUP BY p.strain_name, p.growth_phase, r.name
                    ORDER BY r.name NULLS LAST, p.strain_name
                    LIMIT ${limit}
                `;
                plantRows = result.rows.map((r: any) => ({
                    id: `group-${r.room_name ?? 'unassigned'}-${r.strain_name}-${r.growth_phase}`,
                    label: `${r.strain_name} × ${r.batch_count}`,
                    strain_name: r.strain_name,
                    growth_phase: r.growth_phase,
                    room_name: r.room_name,
                    plant_health: r.plant_health,
                    contaminants: [],
                    planted_date: r.planted_date,
                    vegetative_date: r.vegetative_date,
                    flowering_date: r.flowering_date,
                    target_harvest_date: r.target_harvest_date,
                    tag_number: null,
                    batch_count: r.batch_count,
                    position_row: null,
                    position_col: null,
                    feed_profile: r.feed_profile,
                    default_flowering_days: r.default_flowering_days,
                    stretch_trait: r.stretch_trait,
                    created_at: null,
                }));
                plantTotal = plantRows.length;
            } else {
                const [result, count] = await Promise.all([
                    sql`
                        SELECT
                            p.id,
                            p.label,
                            p.strain_name,
                            p.growth_phase,
                            r.name AS room_name,
                            p.plant_health,
                            p.contaminants,
                            p.planted_date::text,
                            p.vegetative_date::text,
                            p.flowering_date::text,
                            p.target_harvest_date::text,
                            t.tag_number,
                            p.position_row,
                            p.position_col,
                            s.feed_profile,
                            s.default_flowering_days,
                            s.stretch_trait,
                            p.created_at
                        FROM plants p
                        LEFT JOIN rooms r ON r.id = p.room_id
                        LEFT JOIN tags t ON t.assigned_to_plant_id = p.id AND t.status = 'assigned'
                        LEFT JOIN strains s ON s.company_id = p.company_id AND LOWER(s.name) = LOWER(p.strain_name)
                        WHERE p.company_id = ${context.companyId}
                          AND p.growth_phase = ANY(${plantPhases}::text[])
                          AND (${roomsArg}::text[] IS NULL OR r.name = ANY(${roomsArg}::text[]))
                          AND (${strainsArg}::text[] IS NULL OR p.strain_name = ANY(${strainsArg}::text[]))
                          AND (${like}::text IS NULL OR p.label ILIKE ${like} OR p.strain_name ILIKE ${like} OR r.name ILIKE ${like})
                        ORDER BY COALESCE(p.flowering_date, p.vegetative_date, p.planted_date) DESC NULLS LAST, p.label
                        LIMIT ${limit} OFFSET ${offset}
                    `,
                    sql`
                        SELECT COUNT(*)::int AS n
                        FROM plants p
                        LEFT JOIN rooms r ON r.id = p.room_id
                        WHERE p.company_id = ${context.companyId}
                          AND p.growth_phase = ANY(${plantPhases}::text[])
                          AND (${roomsArg}::text[] IS NULL OR r.name = ANY(${roomsArg}::text[]))
                          AND (${strainsArg}::text[] IS NULL OR p.strain_name = ANY(${strainsArg}::text[]))
                          AND (${like}::text IS NULL OR p.label ILIKE ${like} OR p.strain_name ILIKE ${like} OR r.name ILIKE ${like})
                    `,
                ]);
                plantRows = result.rows;
                plantTotal = count.rows[0]?.n ?? 0;
            }
        }

        // Nursery batches are few; they come whole on the first page.
        let batchRows: any[] = [];
        if (includeBatches && offset === 0) {
            const batchResult = await sql`
                SELECT
                    pb.id,
                    pb.name AS label,
                    pb.strain_name,
                    'nursery' AS growth_phase,
                    r.name AS room_name,
                    pb.plant_health,
                    pb.contaminants,
                    pb.planted_date::text,
                    NULL::text AS vegetative_date,
                    NULL::text AS flowering_date,
                    NULL::text AS target_harvest_date,
                    NULL::text AS tag_number,
                    (pb.untracked_count + pb.tracked_count) AS batch_count,
                    NULL::int AS position_row,
                    NULL::int AS position_col,
                    s.feed_profile,
                    s.default_flowering_days,
                    s.stretch_trait,
                    pb.created_at
                FROM plant_batches pb
                LEFT JOIN rooms r ON r.id = pb.room_id
                LEFT JOIN strains s ON s.company_id = pb.company_id AND LOWER(s.name) = LOWER(pb.strain_name)
                WHERE pb.company_id = ${context.companyId}
                  AND (pb.untracked_count + pb.tracked_count) > 0
                  AND (${roomsArg}::text[] IS NULL OR r.name = ANY(${roomsArg}::text[]))
                  AND (${strainsArg}::text[] IS NULL OR pb.strain_name = ANY(${strainsArg}::text[]))
                  AND (${like}::text IS NULL OR pb.name ILIKE ${like} OR pb.strain_name ILIKE ${like} OR r.name ILIKE ${like})
                ORDER BY pb.planted_date DESC NULLS LAST, pb.name
                LIMIT ${MAX_LIMIT}
            `;
            batchRows = batchResult.rows;
        }
        const batchTotal = includeBatches ? batchRows.length : 0;

        const toItem = (r: any) => ({
            id: r.id,
            label: r.label,
            strainName: r.strain_name,
            growthPhase: r.growth_phase,
            roomName: r.room_name,
            plantHealth: r.plant_health,
            contaminants: r.contaminants || [],
            plantedDate: r.planted_date,
            vegetativeDate: r.vegetative_date,
            floweringDate: r.flowering_date,
            targetHarvestDate: r.target_harvest_date,
            tagNumber: r.tag_number,
            batchCount: r.batch_count ?? null,
            row: r.position_row ?? null,
            col: r.position_col ?? null,
            feedProfile: r.feed_profile || null,
            floweringDays: r.default_flowering_days || null,
            stretchTrait: r.stretch_trait || null,
            createdAt: r.created_at,
        });

        const plants = [...plantRows.map(toItem), ...batchRows.map(toItem)];

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'X-Total-Count': String(plantTotal + batchTotal),
                'Access-Control-Expose-Headers': 'X-Total-Count',
            },
            body: JSON.stringify(plants),
        };
    } catch (error) {
        console.error('Error fetching plants list:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch plants list' }),
        };
    }
};

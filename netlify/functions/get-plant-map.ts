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

        const phase = event.queryStringParameters?.phase;
        if (!phase || !['nursery', 'vegetative', 'flowering'].includes(phase)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid phase. Must be nursery, vegetative, or flowering.' }),
            };
        }

        let rows: any[];

        if (phase === 'nursery') {
            const result = await sql`
                SELECT
                    r.id AS room_id,
                    r.name AS room_name,
                    pb.strain_name,
                    (pb.untracked_count + pb.tracked_count) AS plant_count,
                    pb.plant_health,
                    pb.contaminants,
                    pb.planted_date::text AS phase_date,
                    NULL::text AS harvest_date,
                    CASE WHEN pb.planted_date IS NOT NULL
                        THEN (pb.planted_date + 14)::date::text
                        ELSE NULL
                    END AS flip_date
                FROM rooms r
                JOIN plant_batches pb ON pb.room_id = r.id AND pb.company_id = r.company_id
                LEFT JOIN strains s ON s.company_id = pb.company_id AND LOWER(s.name) = LOWER(pb.strain_name)
                WHERE r.company_id = ${context.companyId}
                    AND r.room_type = 'nursery'
                ORDER BY r.name
            `;
            rows = result.rows;
        } else if (phase === 'vegetative') {
            const result = await sql`
                SELECT
                    r.id AS room_id,
                    r.name AS room_name,
                    p.strain_name,
                    1 AS plant_count,
                    p.plant_health,
                    p.contaminants,
                    p.vegetative_date::text AS phase_date,
                    NULL::text AS harvest_date,
                    CASE WHEN s.veg_length_days IS NOT NULL AND p.vegetative_date IS NOT NULL
                        THEN (p.vegetative_date + s.veg_length_days)::date::text
                        ELSE NULL
                    END AS flip_date
                FROM plants p
                JOIN rooms r ON r.id = p.room_id AND r.company_id = p.company_id
                LEFT JOIN strains s ON s.company_id = p.company_id AND LOWER(s.name) = LOWER(p.strain_name)
                WHERE p.company_id = ${context.companyId}
                    AND p.growth_phase = 'vegetative'
                ORDER BY r.name
            `;
            rows = result.rows;
        } else {
            const result = await sql`
                SELECT
                    r.id AS room_id,
                    r.name AS room_name,
                    p.strain_name,
                    1 AS plant_count,
                    p.plant_health,
                    p.contaminants,
                    p.flowering_date::text AS phase_date,
                    p.target_harvest_date::text AS harvest_date,
                    NULL::text AS flip_date
                FROM plants p
                JOIN rooms r ON r.id = p.room_id AND r.company_id = p.company_id
                WHERE p.company_id = ${context.companyId}
                    AND p.growth_phase = 'flowering'
                ORDER BY r.name
            `;
            rows = result.rows;
        }

        // Aggregate in JS — cleaner than fighting with array unnest in tagged templates
        const roomMap = new Map<string, {
            roomId: string;
            totalPlants: number;
            strains: Set<string>;
            healthSum: number;
            healthCount: number;
            contaminants: Set<string>;
            phaseDates: Set<string>;
            harvestDates: Set<string>;
            flipDates: Set<string>;
        }>();

        for (const row of rows) {
            let room = roomMap.get(row.room_name);
            if (!room) {
                room = {
                    roomId: row.room_id,
                    totalPlants: 0,
                    strains: new Set(),
                    healthSum: 0,
                    healthCount: 0,
                    contaminants: new Set(),
                    phaseDates: new Set(),
                    harvestDates: new Set(),
                    flipDates: new Set(),
                };
                roomMap.set(row.room_name, room);
            }

            room.totalPlants += row.plant_count;
            room.strains.add(row.strain_name);
            room.healthSum += row.plant_health * row.plant_count;
            room.healthCount += row.plant_count;

            if (Array.isArray(row.contaminants)) {
                for (const c of row.contaminants) room.contaminants.add(c);
            }
            if (row.phase_date) room.phaseDates.add(row.phase_date);
            if (row.harvest_date) room.harvestDates.add(row.harvest_date);
            if (row.flip_date) room.flipDates.add(row.flip_date);
        }

        const plantMap: Record<string, any> = {};
        for (const [name, room] of roomMap) {
            plantMap[name] = {
                roomId: room.roomId,
                totalPlants: room.totalPlants,
                totalStrains: room.strains.size,
                strains: [...room.strains].sort(),
                plantHealth: room.healthCount > 0 ? Math.round(room.healthSum / room.healthCount) : 100,
                contaminants: [...room.contaminants].sort(),
                phaseDates: [...room.phaseDates].sort(),
                harvestDates: [...room.harvestDates].sort(),
                flipDates: [...room.flipDates].sort(),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(plantMap),
        };
    } catch (error) {
        console.error('Error fetching plant map:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch plant map' }),
        };
    }
};

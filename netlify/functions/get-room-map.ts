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
        const roomName = event.queryStringParameters?.room;

        if (!phase || !['nursery', 'vegetative', 'flowering'].includes(phase)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid phase. Must be nursery, vegetative, or flowering.' }),
            };
        }
        if (!roomName) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing room parameter.' }),
            };
        }

        let rows: any[];

        if (phase === 'nursery') {
            const result = await sql`
                SELECT
                    pb.id,
                    pb.name AS label,
                    pb.strain_name,
                    (pb.untracked_count + pb.tracked_count) AS plant_count,
                    pb.plant_health,
                    pb.contaminants,
                    pb.planted_date::text AS planted_date,
                    'plantbatches' AS entity_type
                FROM plant_batches pb
                JOIN rooms r ON r.id = pb.room_id AND r.company_id = pb.company_id
                WHERE pb.company_id = ${context.companyId}
                    AND r.name = ${roomName}
                ORDER BY pb.strain_name, pb.planted_date
            `;
            rows = result.rows;
        } else {
            const phaseDateCol = phase === 'vegetative' ? 'p.vegetative_date' : 'p.flowering_date';
            const result = await sql`
                SELECT
                    p.id,
                    p.label,
                    p.strain_name,
                    1 AS plant_count,
                    p.plant_health,
                    p.contaminants,
                    p.planted_date::text AS planted_date,
                    CASE
                        WHEN ${phase} = 'vegetative' THEN p.vegetative_date::text
                        ELSE p.flowering_date::text
                    END AS phase_date,
                    p.target_harvest_date::text AS target_harvest_date,
                    'plants' AS entity_type
                FROM plants p
                JOIN rooms r ON r.id = p.room_id AND r.company_id = p.company_id
                WHERE p.company_id = ${context.companyId}
                    AND r.name = ${roomName}
                    AND p.growth_phase = ${phase}
                ORDER BY p.strain_name, p.planted_date
            `;
            rows = result.rows;
        }

        // Group by strain + phase_date into PlantGroup records
        const groupMap = new Map<string, {
            totalPlants: number;
            plantHealth: number;
            healthSum: number;
            plants: string[];
            contamination: Set<string>;
            plantedDate: string;
            harvestDate: string | null;
            strain: string;
            type: string;
        }>();

        for (const row of rows) {
            const key = `${row.strain_name}::${row.phase_date || row.planted_date}`;
            let group = groupMap.get(key);
            if (!group) {
                group = {
                    totalPlants: 0,
                    plantHealth: 0,
                    healthSum: 0,
                    plants: [],
                    contamination: new Set(),
                    plantedDate: row.planted_date || row.phase_date,
                    harvestDate: row.target_harvest_date || null,
                    strain: row.strain_name,
                    type: row.entity_type,
                };
                groupMap.set(key, group);
            }

            group.totalPlants += row.plant_count;
            group.healthSum += row.plant_health * row.plant_count;
            group.plants.push(row.id);
            // Use earliest harvest date in group
            if (row.target_harvest_date && (!group.harvestDate || row.target_harvest_date < group.harvestDate)) {
                group.harvestDate = row.target_harvest_date;
            }

            if (Array.isArray(row.contaminants)) {
                for (const c of row.contaminants) group.contamination.add(c);
            }
        }

        // Build final response
        const roomMapData: Record<string, any> = {};
        for (const [key, group] of groupMap) {
            roomMapData[key] = {
                totalPlants: group.totalPlants,
                plantHealth: group.totalPlants > 0 ? Math.round(group.healthSum / group.totalPlants) : 100,
                plants: group.plants,
                contamination: [...group.contamination].sort(),
                plantedDate: group.plantedDate,
                harvestDate: group.harvestDate,
                strain: group.strain,
                type: group.type,
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(roomMapData),
        };
    } catch (error) {
        console.error('Error fetching room map:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch room map' }),
        };
    }
};

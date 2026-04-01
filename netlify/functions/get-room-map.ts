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
                    pb.tag,
                    'plantbatches' AS entity_type,
                    NULL::text AS target_harvest_date
                FROM plant_batches pb
                JOIN rooms r ON r.id = pb.room_id AND r.company_id = pb.company_id
                WHERE pb.company_id = ${context.companyId}
                    AND r.name = ${roomName}
                ORDER BY pb.strain_name, pb.planted_date
            `;
            rows = result.rows.map((r: any) => {
                let flip_date = null;
                if (r.planted_date) {
                    const d = new Date(r.planted_date);
                    d.setDate(d.getDate() + 14);
                    flip_date = d.toISOString().split('T')[0];
                }
                return { ...r, flip_date };
            });
        } else if (phase === 'vegetative') {
            const result = await sql`
                SELECT
                    p.id,
                    p.label,
                    p.strain_name,
                    1 AS plant_count,
                    p.plant_health,
                    p.contaminants,
                    p.planted_date::text AS planted_date,
                    p.vegetative_date::text AS phase_date,
                    NULL::text AS target_harvest_date,
                    p.tag,
                    'plants' AS entity_type
                FROM plants p
                JOIN rooms r ON r.id = p.room_id AND r.company_id = p.company_id
                WHERE p.company_id = ${context.companyId}
                    AND r.name = ${roomName}
                    AND p.growth_phase = 'vegetative'
                ORDER BY p.strain_name, p.planted_date
            `;
            // Compute flip dates from strain veg_length_days
            const { rows: strainRows } = await sql`
                SELECT LOWER(name) AS name, veg_length_days
                FROM strains
                WHERE company_id = ${context.companyId} AND veg_length_days IS NOT NULL
            `;
            const vegLengthMap = new Map(strainRows.map((s: any) => [s.name, s.veg_length_days]));
            rows = result.rows.map((r: any) => {
                const vegDays = vegLengthMap.get(r.strain_name?.toLowerCase());
                let flip_date = null;
                if (vegDays && r.phase_date) {
                    const d = new Date(r.phase_date);
                    d.setDate(d.getDate() + vegDays);
                    flip_date = d.toISOString().split('T')[0];
                }
                return { ...r, flip_date };
            });
        } else {
            const result = await sql`
                SELECT
                    p.id,
                    p.label,
                    p.strain_name,
                    1 AS plant_count,
                    p.plant_health,
                    p.contaminants,
                    p.planted_date::text AS planted_date,
                    p.flowering_date::text AS phase_date,
                    p.target_harvest_date::text AS target_harvest_date,
                    p.tag,
                    'plants' AS entity_type
                FROM plants p
                JOIN rooms r ON r.id = p.room_id AND r.company_id = p.company_id
                WHERE p.company_id = ${context.companyId}
                    AND r.name = ${roomName}
                    AND p.growth_phase = 'flowering'
                ORDER BY p.strain_name, p.planted_date
            `;
            rows = result.rows.map((r: any) => ({ ...r, flip_date: null }));
        }

        // Group by strain + phase_date into PlantGroup records
        const groupMap = new Map<string, {
            totalPlants: number;
            plantHealth: number;
            healthSum: number;
            plants: string[];
            contamination: Set<string>;
            plantedDate: string;
            phaseDate: string | null;
            harvestDate: string | null;
            flipDate: string | null;
            strain: string;
            type: string;
            tags: string[];
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
                    phaseDate: row.phase_date || row.planted_date,
                    harvestDate: row.target_harvest_date || null,
                    flipDate: row.flip_date || null,
                    strain: row.strain_name,
                    type: row.entity_type,
                    tags: [],
                };
                groupMap.set(key, group);
            }

            group.totalPlants += row.plant_count;
            group.healthSum += row.plant_health * row.plant_count;
            group.plants.push(row.id);
            if (row.tag) group.tags.push(row.tag);
            // Use earliest harvest date in group
            if (row.target_harvest_date && (!group.harvestDate || row.target_harvest_date < group.harvestDate)) {
                group.harvestDate = row.target_harvest_date;
            }
            // Use earliest flip date in group
            if (row.flip_date && (!group.flipDate || row.flip_date < group.flipDate)) {
                group.flipDate = row.flip_date;
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
                phaseDate: group.phaseDate,
                harvestDate: group.harvestDate,
                flipDate: group.flipDate,
                strain: group.strain,
                type: group.type,
                tags: group.tags,
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

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

        const phase = event.queryStringParameters?.phase || null;

        // Individual plants (veg/flowering/harvested)
        const plantsResult = await sql`
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
                p.created_at
            FROM plants p
            LEFT JOIN rooms r ON r.id = p.room_id
            LEFT JOIN tags t ON t.assigned_to_plant_id = p.id AND t.status = 'assigned'
            WHERE p.company_id = ${context.companyId}
              AND p.growth_phase != 'destroyed'
              AND (${phase}::text IS NULL OR p.growth_phase = ${phase})
            ORDER BY p.created_at DESC
        `;

        // Plant batches (nursery) — only include if phase is null or 'nursery'
        let batchRows: any[] = [];
        if (!phase || phase === 'nursery') {
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
                    pb.created_at
                FROM plant_batches pb
                LEFT JOIN rooms r ON r.id = pb.room_id
                WHERE pb.company_id = ${context.companyId}
                ORDER BY pb.created_at DESC
            `;
            batchRows = batchResult.rows;
        }

        const plants = [
            ...plantsResult.rows.map((r: any) => ({
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
                batchCount: null,
                createdAt: r.created_at,
            })),
            ...batchRows.map((r: any) => ({
                id: r.id,
                label: r.label,
                strainName: r.strain_name,
                growthPhase: r.growth_phase,
                roomName: r.room_name,
                plantHealth: r.plant_health,
                contaminants: r.contaminants || [],
                plantedDate: r.planted_date,
                vegetativeDate: null,
                floweringDate: null,
                targetHarvestDate: null,
                tagNumber: null,
                batchCount: r.batch_count,
                createdAt: r.created_at,
            })),
        ];

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
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

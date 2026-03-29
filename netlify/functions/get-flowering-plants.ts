import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
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

        // Get all flowering plants that haven't been harvested yet, grouped by batch
        const { rows } = await pool.query(`
            SELECT
                p.id,
                p.label,
                p.strain_name,
                p.plant_batch_id,
                p.flowering_date,
                p.target_harvest_date,
                p.plant_health,
                p.contaminants,
                p.harvest_id,
                r.id AS room_id,
                r.name AS room_name,
                pb.name AS batch_name
            FROM plants p
            JOIN rooms r ON r.id = p.room_id
            LEFT JOIN plant_batches pb ON pb.id = p.plant_batch_id
            WHERE p.company_id = $1
                AND p.growth_phase = 'flowering'
                AND p.harvest_id IS NULL
            ORDER BY r.name, pb.name, p.label
        `, [context.companyId]);

        // Group by batch
        const batchMap = new Map<string, any>();

        for (const row of rows) {
            const batchKey = row.plant_batch_id || `unbatched-${row.room_id}`;
            if (!batchMap.has(batchKey)) {
                batchMap.set(batchKey, {
                    batchId: row.plant_batch_id || null,
                    batchName: row.batch_name || 'Unbatched Plants',
                    strainName: row.strain_name,
                    roomId: row.room_id,
                    roomName: row.room_name,
                    plants: [],
                    targetHarvestDate: null,
                    healthSum: 0,
                });
            }

            const batch = batchMap.get(batchKey);
            batch.plants.push({
                id: row.id,
                label: row.label,
                strainName: row.strain_name,
                roomName: row.room_name,
                plantBatchId: row.plant_batch_id,
                plantBatchName: row.batch_name || 'Unbatched',
                floweringDate: row.flowering_date,
                targetHarvestDate: row.target_harvest_date,
                plantHealth: row.plant_health,
                contaminants: row.contaminants || [],
                harvestId: row.harvest_id,
            });
            batch.healthSum += (row.plant_health || 100);
            if (row.target_harvest_date && !batch.targetHarvestDate) {
                batch.targetHarvestDate = row.target_harvest_date;
            }
        }

        const groups = Array.from(batchMap.values()).map((b: any) => ({
            batchId: b.batchId,
            batchName: b.batchName,
            strainName: b.strainName,
            roomId: b.roomId,
            roomName: b.roomName,
            plants: b.plants,
            targetHarvestDate: b.targetHarvestDate,
            avgHealth: b.plants.length > 0 ? Math.round(b.healthSum / b.plants.length) : 100,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(groups),
        };
    } catch (error) {
        console.error('Error fetching flowering plants:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch flowering plants' }),
        };
    }
};

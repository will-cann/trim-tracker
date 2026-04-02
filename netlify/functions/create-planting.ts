import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'lead');
        if (denied) return denied;

        const payload = JSON.parse(event.body || '{}');
        const { type } = payload;

        if (type === 'batch') {
            return await createBatch(payload, context.companyId);
        } else if (type === 'plant') {
            return await createPlants(payload, context.companyId);
        } else {
            return { statusCode: 400, body: JSON.stringify({ error: 'type must be "batch" or "plant"' }) };
        }
    } catch (error: any) {
        console.error('Error in create-planting:', error);
        // Handle unique constraint violations
        if (error.code === '23505') {
            const detail = error.detail || '';
            return {
                statusCode: 409,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: `Duplicate entry: ${detail}` }),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create planting' }),
        };
    }
};

async function createBatch(
    payload: {
        name: string;
        batchType: string;
        strainId: string;
        strainName: string;
        roomId: string;
        untrackedCount: number;
        plantedDate?: string;
    },
    companyId: string,
) {
    const { name, batchType, strainId, strainName, roomId, untrackedCount, plantedDate } = payload;

    if (!name?.trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Batch name is required' }) };
    }
    if (!strainId || !strainName) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Strain is required' }) };
    }
    if (!roomId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Room is required' }) };
    }
    if (!untrackedCount || untrackedCount < 1) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Count must be at least 1' }) };
    }
    if (!['clone', 'seed', 'tissue_culture'].includes(batchType)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid batch type' }) };
    }

    // Verify room belongs to company
    const roomCheck = await sql`SELECT id FROM rooms WHERE id = ${roomId} AND company_id = ${companyId}`;
    if (roomCheck.rows.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Room not found' }) };
    }

    const result = await sql`
        INSERT INTO plant_batches (id, company_id, name, batch_type, strain_id, strain_name, room_id, untracked_count, tracked_count, planted_date, plant_health)
        VALUES (gen_random_uuid(), ${companyId}, ${name.trim()}, ${batchType}, ${strainId}::uuid, ${strainName}, ${roomId}::uuid, ${untrackedCount}, 0, ${plantedDate || new Date().toISOString().slice(0, 10)}, 100)
        RETURNING *
    `;

    const row = result.rows[0];
    return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            success: true,
            created: {
                id: row.id,
                name: row.name,
                batchType: row.batch_type,
                strainName: row.strain_name,
                untrackedCount: row.untracked_count,
                roomId: row.room_id,
                plantedDate: row.planted_date,
            },
        }),
    };
}

async function createPlants(
    payload: {
        plants: Array<{ label: string; strainId: string; strainName: string; roomId: string }>;
        growthPhase?: string;
        plantedDate?: string;
        plantBatchId?: string;
    },
    companyId: string,
) {
    const { plants, growthPhase = 'vegetative', plantedDate, plantBatchId } = payload;

    if (!plants?.length) {
        return { statusCode: 400, body: JSON.stringify({ error: 'At least one plant is required' }) };
    }
    if (!['vegetative', 'flowering'].includes(growthPhase)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Growth phase must be vegetative or flowering' }) };
    }

    for (const p of plants) {
        if (!p.label?.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'All plants must have a label' }) };
        }
        if (!p.strainId || !p.strainName) {
            return { statusCode: 400, body: JSON.stringify({ error: 'All plants must have a strain' }) };
        }
        if (!p.roomId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'All plants must have a room' }) };
        }
    }

    // Verify all rooms belong to company
    const uniqueRoomIds = [...new Set(plants.map(p => p.roomId))];
    for (const rid of uniqueRoomIds) {
        const roomCheck = await sql`SELECT id FROM rooms WHERE id = ${rid} AND company_id = ${companyId}`;
        if (roomCheck.rows.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: `Room ${rid} not found` }) };
        }
    }

    const dateVal = plantedDate || new Date().toISOString().slice(0, 10);
    const isFlowering = growthPhase === 'flowering';

    const created = [];
    for (const p of plants) {
        const result = isFlowering
            ? await sql`
                INSERT INTO plants (id, company_id, label, strain_id, strain_name, room_id, growth_phase, planted_date, flowering_date, plant_batch_id, plant_health)
                VALUES (gen_random_uuid(), ${companyId}, ${p.label.trim()}, ${p.strainId}::uuid, ${p.strainName}, ${p.roomId}::uuid, ${growthPhase}, ${dateVal}, ${dateVal}, ${plantBatchId || null}, 100)
                RETURNING id, label, strain_name, growth_phase, room_id
            `
            : await sql`
                INSERT INTO plants (id, company_id, label, strain_id, strain_name, room_id, growth_phase, planted_date, vegetative_date, plant_batch_id, plant_health)
                VALUES (gen_random_uuid(), ${companyId}, ${p.label.trim()}, ${p.strainId}::uuid, ${p.strainName}, ${p.roomId}::uuid, ${growthPhase}, ${dateVal}, ${dateVal}, ${plantBatchId || null}, 100)
                RETURNING id, label, strain_name, growth_phase, room_id
            `;
        created.push(result.rows[0]);
    }

    return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            success: true,
            created: created.map(r => ({
                id: r.id,
                label: r.label,
                strainName: r.strain_name,
                growthPhase: r.growth_phase,
                roomId: r.room_id,
            })),
        }),
    };
}

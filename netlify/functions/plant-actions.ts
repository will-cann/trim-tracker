import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

type ActionType = 'destroy' | 'change-phase' | 'change-room' | 'plant-health';

interface ActionPayload {
    action: ActionType;
    plantIds: string[];
    entityType: 'plants' | 'plantbatches';
    // change-phase
    targetPhase?: string;
    // change-room
    targetRoomId?: string;
    // plant-health
    health?: number;
    contaminants?: string[];
    note?: string;
}

const VALID_PHASES = ['vegetative', 'flowering', 'harvested', 'destroyed'];

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const payload: ActionPayload = JSON.parse(event.body || '{}');
        const { action, plantIds, entityType } = payload;

        if (!action || !plantIds?.length || !entityType) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing action, plantIds, or entityType.' }),
            };
        }

        const isPlants = entityType === 'plants';
        let affectedCount = 0;

        switch (action) {
            case 'destroy': {
                if (isPlants) {
                    const result = await sql`
                        UPDATE plants
                        SET growth_phase = 'destroyed',
                            destroyed_date = NOW()
                        WHERE id = ANY(${plantIds}::uuid[])
                            AND company_id = ${context.companyId}
                            AND growth_phase != 'destroyed'
                    `;
                    affectedCount = result.rows.length || plantIds.length;
                } else {
                    // For plant batches, just delete them
                    const result = await sql`
                        DELETE FROM plant_batches
                        WHERE id = ANY(${plantIds}::uuid[])
                            AND company_id = ${context.companyId}
                    `;
                    affectedCount = result.rows.length || plantIds.length;
                }
                break;
            }

            case 'change-phase': {
                const { targetPhase } = payload;
                if (!targetPhase || !VALID_PHASES.includes(targetPhase)) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error: `Invalid targetPhase. Must be one of: ${VALID_PHASES.join(', ')}` }),
                    };
                }

                if (!isPlants) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error: 'Phase changes are only supported for individual plants, not batches.' }),
                    };
                }

                // Neon tagged template doesn't support dynamic column names,
                // so we use separate queries per phase
                if (targetPhase === 'vegetative') {
                    await sql`
                        UPDATE plants SET growth_phase = 'vegetative', vegetative_date = NOW()
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else if (targetPhase === 'flowering') {
                    await sql`
                        UPDATE plants SET growth_phase = 'flowering', flowering_date = NOW()
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else if (targetPhase === 'harvested') {
                    await sql`
                        UPDATE plants SET growth_phase = 'harvested', harvested_date = NOW()
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else {
                    await sql`
                        UPDATE plants SET growth_phase = 'destroyed', destroyed_date = NOW()
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                }
                affectedCount = plantIds.length;
                break;
            }

            case 'change-room': {
                const { targetRoomId } = payload;
                if (!targetRoomId) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error: 'Missing targetRoomId.' }),
                    };
                }

                // Verify room belongs to company
                const { rows: roomRows } = await sql`
                    SELECT id FROM rooms WHERE id = ${targetRoomId} AND company_id = ${context.companyId}
                `;
                if (roomRows.length === 0) {
                    return {
                        statusCode: 404,
                        body: JSON.stringify({ error: 'Target room not found.' }),
                    };
                }

                if (isPlants) {
                    await sql`
                        UPDATE plants SET room_id = ${targetRoomId}
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else {
                    await sql`
                        UPDATE plant_batches SET room_id = ${targetRoomId}
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                }
                affectedCount = plantIds.length;
                break;
            }

            case 'plant-health': {
                const { health, contaminants } = payload;
                if (health === undefined || health < 0 || health > 100) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error: 'Health must be between 0 and 100.' }),
                    };
                }

                const contaminantArray = contaminants || [];

                if (isPlants) {
                    await sql`
                        UPDATE plants
                        SET plant_health = ${health},
                            contaminants = ${contaminantArray}::text[]
                        WHERE id = ANY(${plantIds}::uuid[])
                            AND company_id = ${context.companyId}
                    `;
                } else {
                    await sql`
                        UPDATE plant_batches
                        SET plant_health = ${health},
                            contaminants = ${contaminantArray}::text[]
                        WHERE id = ANY(${plantIds}::uuid[])
                            AND company_id = ${context.companyId}
                    `;
                }
                affectedCount = plantIds.length;
                break;
            }

            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: `Unknown action: ${action}` }),
                };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, action, affected: affectedCount }),
        };
    } catch (error) {
        console.error('Error executing plant action:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to execute plant action' }),
        };
    }
};

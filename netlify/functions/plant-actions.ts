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
    targetHarvestDate?: string; // YYYY-MM-DD, set when moving to flowering
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

                // Optionally move to a new room and/or set harvest date
                const { targetRoomId, targetHarvestDate } = payload;
                const harvestDate = targetHarvestDate || null;
                if (targetRoomId) {
                    const { rows: roomRows } = await sql`
                        SELECT id FROM rooms WHERE id = ${targetRoomId} AND company_id = ${context.companyId}
                    `;
                    if (roomRows.length === 0) {
                        return {
                            statusCode: 404,
                            body: JSON.stringify({ error: 'Target room not found.' }),
                        };
                    }
                }

                // Phase change queries
                if (targetPhase === 'vegetative') {
                    await sql`
                        UPDATE plants
                        SET growth_phase = 'vegetative',
                            vegetative_date = NOW(),
                            room_id = COALESCE(${targetRoomId || null}::uuid, room_id)
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else if (targetPhase === 'flowering') {
                    await sql`
                        UPDATE plants
                        SET growth_phase = 'flowering',
                            flowering_date = NOW(),
                            target_harvest_date = COALESCE(${harvestDate}::date, target_harvest_date),
                            room_id = COALESCE(${targetRoomId || null}::uuid, room_id)
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else if (targetPhase === 'harvested') {
                    await sql`
                        UPDATE plants
                        SET growth_phase = 'harvested',
                            harvested_date = NOW(),
                            room_id = COALESCE(${targetRoomId || null}::uuid, room_id)
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else {
                    await sql`
                        UPDATE plants
                        SET growth_phase = 'destroyed',
                            destroyed_date = NOW(),
                            room_id = COALESCE(${targetRoomId || null}::uuid, room_id)
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                }
                affectedCount = plantIds.length;

                // ── Automatic tag assignment ──
                // Check if this transition should assign tags
                const { rows: settingsRows } = await sql`
                    SELECT * FROM tag_settings WHERE company_id = ${context.companyId}
                `;
                const tagSettings = settingsRows[0];

                if (tagSettings?.use_tags) {
                    const shouldTag =
                        (tagSettings.tag_on_phase === 'nursery_to_veg' && targetPhase === 'vegetative') ||
                        (tagSettings.tag_on_phase === 'veg_to_flower' && targetPhase === 'flowering');

                    if (shouldTag) {
                        // Only tag plants that don't already have a tag
                        const { rows: untagged } = await sql`
                            SELECT id FROM plants
                            WHERE id = ANY(${plantIds}::uuid[])
                                AND company_id = ${context.companyId}
                                AND tag IS NULL
                        `;
                        const untaggedIds = untagged.map(r => r.id);

                        if (untaggedIds.length > 0) {
                            const assignedTags: string[] = [];

                            if (tagSettings.tag_source === 'auto') {
                                // Auto-generate sequential tags
                                let counter = tagSettings.auto_tag_counter || 0;
                                const prefix = tagSettings.auto_tag_prefix || 'PLT';

                                for (const pid of untaggedIds) {
                                    counter++;
                                    const tagNumber = `${prefix}-${String(counter).padStart(6, '0')}`;
                                    // Create tag record
                                    await sql`
                                        INSERT INTO tags (company_id, tag_number, tag_type, status, assigned_to_plant_id, assigned_at)
                                        VALUES (${context.companyId}, ${tagNumber}, 'plant', 'assigned', ${pid}::uuid, NOW())
                                    `;
                                    // Update plant
                                    await sql`UPDATE plants SET tag = ${tagNumber} WHERE id = ${pid}::uuid`;
                                    assignedTags.push(tagNumber);
                                }

                                // Update counter
                                await sql`
                                    UPDATE tag_settings SET auto_tag_counter = ${counter}
                                    WHERE company_id = ${context.companyId}
                                `;
                            } else {
                                // Upload mode: pull from available pool
                                const { rows: available } = await sql`
                                    SELECT id, tag_number FROM tags
                                    WHERE company_id = ${context.companyId}
                                        AND status = 'available'
                                        AND tag_type = 'plant'
                                    ORDER BY created_at ASC
                                    LIMIT ${untaggedIds.length}
                                `;

                                for (let i = 0; i < Math.min(available.length, untaggedIds.length); i++) {
                                    const tag = available[i];
                                    const pid = untaggedIds[i];
                                    await sql`
                                        UPDATE tags SET status = 'assigned', assigned_to_plant_id = ${pid}::uuid, assigned_at = NOW()
                                        WHERE id = ${tag.id}::uuid
                                    `;
                                    await sql`UPDATE plants SET tag = ${tag.tag_number} WHERE id = ${pid}::uuid`;
                                    assignedTags.push(tag.tag_number);
                                }

                                if (available.length < untaggedIds.length) {
                                    // Not enough tags — partial assignment, note in response
                                    return {
                                        statusCode: 200,
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            success: true,
                                            action,
                                            affected: affectedCount,
                                            tagsAssigned: assignedTags.length,
                                            tagsNeeded: untaggedIds.length,
                                            warning: `Only ${available.length} tags available in pool. ${untaggedIds.length - available.length} plants were not tagged.`,
                                        }),
                                    };
                                }
                            }
                        }
                    }
                }
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

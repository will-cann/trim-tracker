import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { captureError } from './utils/sentry';
import { resolveContext, authorize } from './utils/auth';
import { settleTableScoresForRooms } from './utils/tableScores';

type ActionType = 'destroy' | 'change-phase' | 'change-room' | 'plant-health';

interface ActionPayload {
    action: ActionType;
    plantIds: string[];
    entityType: 'plants' | 'plantbatches';
    // change-phase
    targetPhase?: string;
    targetHarvestDate?: string; // YYYY-MM-DD, set when moving to flowering
    uppotCount?: number;        // nursery → veg: how many plants to keep (rest culled)
    // change-room
    targetRoomId?: string;
    /** Optional grid cells in the target room (from the move planner). */
    placements?: Array<{ plantId: string; row: number; col: number }>;
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

        const denied = authorize(context, 'technician');
        if (denied) return denied;

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
                    const leavingRooms = await roomsOf(context.companyId, plantIds);
                    const result = await sql`
                        UPDATE plants
                        SET growth_phase = 'destroyed',
                            destroyed_date = NOW()
                        WHERE id = ANY(${plantIds}::uuid[])
                            AND company_id = ${context.companyId}
                            AND growth_phase != 'destroyed'
                    `;
                    affectedCount = result.rows.length || plantIds.length;
                    await settleQuietly(context.companyId, leavingRooms);
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

                // ── Plant batches: convert to individual plants (uppotting) ──
                if (!isPlants) {
                    if (targetPhase !== 'vegetative') {
                        return {
                            statusCode: 400,
                            body: JSON.stringify({ error: 'Plant batches can only be moved to vegetative phase.' }),
                        };
                    }

                    // Fetch the batch details
                    const { rows: batches } = await sql`
                        SELECT id, name, strain_name, strain_id, room_id, untracked_count, tracked_count,
                               planted_date, plant_health, contaminants
                        FROM plant_batches
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;

                    const destRoomId = targetRoomId || null;
                    const requestedCount = payload.uppotCount;
                    let totalCreated = 0;

                    for (const batch of batches) {
                        const batchTotal = (batch.untracked_count || 0) + (batch.tracked_count || 0);
                        if (batchTotal <= 0) continue;
                        // Use requested count if provided, capped to batch size
                        const count = requestedCount ? Math.min(requestedCount, batchTotal) : batchTotal;

                        // Generate labels: STRAIN-V-001, STRAIN-V-002, ...
                        const prefix = batch.strain_name.replace(/\s+/g, '').substring(0, 6).toUpperCase();

                        // Find the highest existing label number for this prefix
                        const { rows: [maxRow] } = await sql`
                            SELECT label FROM plants
                            WHERE company_id = ${context.companyId}
                                AND label LIKE ${prefix + '-V-%'}
                            ORDER BY label DESC LIMIT 1
                        `;
                        let counter = 0;
                        if (maxRow?.label) {
                            const match = maxRow.label.match(/-(\d+)$/);
                            if (match) counter = parseInt(match[1], 10);
                        }

                        // Insert individual plants
                        for (let i = 0; i < count; i++) {
                            counter++;
                            const label = `${prefix}-V-${String(counter).padStart(3, '0')}`;
                            await sql`
                                INSERT INTO plants (
                                    company_id, label, strain_name, strain_id,
                                    room_id, growth_phase, planted_date, vegetative_date,
                                    plant_batch_id, plant_health, contaminants
                                ) VALUES (
                                    ${context.companyId}, ${label}, ${batch.strain_name}, ${batch.strain_id},
                                    COALESCE(${destRoomId}::uuid, ${batch.room_id}::uuid),
                                    'vegetative', ${batch.planted_date}, NOW()::date,
                                    ${batch.id}::uuid, ${batch.plant_health}, ${batch.contaminants}::text[]
                                )
                            `;
                        }
                        totalCreated += count;

                        // Remove the batch
                        await sql`
                            DELETE FROM plant_batches
                            WHERE id = ${batch.id}::uuid AND company_id = ${context.companyId}
                        `;
                    }

                    affectedCount = totalCreated;
                    break;
                }

                // ── Individual plants: phase change queries ──
                // A grid position belongs to a room: moving rooms clears it.
                const clearPos = !!targetRoomId;
                const leavingRooms = targetPhase === 'harvested' || targetPhase === 'destroyed' ? await roomsOf(context.companyId, plantIds) : [];
                if (targetPhase === 'vegetative') {
                    await sql`
                        UPDATE plants
                        SET growth_phase = 'vegetative',
                            vegetative_date = NOW(),
                            room_id = COALESCE(${targetRoomId || null}::uuid, room_id),
                            position_row = CASE WHEN ${clearPos} THEN NULL ELSE position_row END,
                            position_col = CASE WHEN ${clearPos} THEN NULL ELSE position_col END
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                } else if (targetPhase === 'flowering') {
                    await sql`
                        UPDATE plants
                        SET growth_phase = 'flowering',
                            flowering_date = NOW(),
                            target_harvest_date = COALESCE(${harvestDate}::date, target_harvest_date),
                            room_id = COALESCE(${targetRoomId || null}::uuid, room_id),
                            position_row = CASE WHEN ${clearPos} THEN NULL ELSE position_row END,
                            position_col = CASE WHEN ${clearPos} THEN NULL ELSE position_col END
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
                await settleQuietly(context.companyId, leavingRooms);

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
                    // Positions are per-room, so a move clears them unless the
                    // caller supplied cells in the destination grid.
                    await sql`
                        UPDATE plants SET room_id = ${targetRoomId}, position_row = NULL, position_col = NULL
                        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${context.companyId}
                    `;
                    const placements = (payload.placements ?? []).filter(p =>
                        plantIds.includes(p.plantId) && Number.isInteger(p.row) && Number.isInteger(p.col) && p.row >= 0 && p.col >= 0);
                    for (const p of placements) {
                        // Bump whoever is on the cell, then take it. Out-of-grid cells are ignored.
                        await sql`
                            UPDATE plants SET position_row = NULL, position_col = NULL
                            WHERE company_id = ${context.companyId} AND room_id = ${targetRoomId}
                              AND position_row = ${p.row} AND position_col = ${p.col}
                              AND growth_phase IN ('vegetative', 'flowering') AND id != ${p.plantId}::uuid
                        `;
                        await sql`
                            UPDATE plants p SET position_row = ${p.row}, position_col = ${p.col}
                            FROM rooms r
                            WHERE p.id = ${p.plantId}::uuid AND p.company_id = ${context.companyId}
                              AND r.id = p.room_id
                              AND r.layout_rows > ${p.row} AND r.layout_cols > ${p.col}
                        `;
                    }
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

/** Rooms the given plants are in right now (before an update moves or ends them). */
async function roomsOf(companyId: string, plantIds: string[]): Promise<string[]> {
    const { rows } = await sql`
        SELECT DISTINCT room_id FROM plants
        WHERE id = ANY(${plantIds}::uuid[]) AND company_id = ${companyId} AND room_id IS NOT NULL
    `;
    return rows.map((r: any) => r.room_id);
}

/**
 * Harvested or destroyed plants may have emptied a room tracked by table; its
 * open bud-rot scores are then over. Never fails the action itself.
 */
async function settleQuietly(companyId: string, roomIds: string[]): Promise<void> {
    if (!roomIds.length) return;
    try {
        await settleTableScoresForRooms(companyId, roomIds);
    } catch (err) {
        console.warn('[plant-actions] could not settle table scores', err);
    }
}

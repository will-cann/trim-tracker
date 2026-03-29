import type { ProposedAction } from '../types/definitions';
import { apiService } from './apiService';

/** Resolve plant IDs from strain + room name via the room map API */
async function resolvePlantIds(
    strain?: string,
    roomName?: string,
): Promise<{ plantIds: string[]; entityType: 'plants' | 'plantbatches' } | null> {
    if (!roomName) return null;
    for (const phase of ['vegetative', 'flowering', 'nursery'] as const) {
        const roomData = await apiService.getRoomMap(phase, roomName);
        for (const [, group] of Object.entries(roomData)) {
            const g = group as any;
            if (g.plants?.length && (!strain || g.strain?.toLowerCase().includes(strain.toLowerCase()))) {
                return {
                    plantIds: g.plants,
                    entityType: g.type === 'plantbatches' ? 'plantbatches' : 'plants',
                };
            }
        }
    }
    return null;
}

/**
 * Execute a single ProposedAction against the API.
 * Extracted from useAIChat so both the chat confirm flow
 * and the task list can share the same execution logic.
 */
export async function executeAction(action: ProposedAction): Promise<void> {
    switch (action.type) {
        case 'add_trimmer_profile':
            await apiService.addTrimmerProfile(action.data.name);
            break;
        case 'create_session':
            await apiService.createSession({
                harvestName: action.data.harvestName,
                strain: action.data.strain,
                licenseNumber: action.data.licenseNumber,
                startWeight: action.data.startWeight,
                status: 'active',
            });
            break;
        case 'add_batch':
            await apiService.addBatch({
                harvestName: action.data.harvestName,
                strain: action.data.strain,
                licenseNumber: action.data.licenseNumber,
                startWeight: action.data.startWeight,
                status: action.data.status || 'upcoming',
            });
            break;
        case 'assign_trimmer':
            if (action.data.entryId) {
                await apiService.addTrimmer(action.data.entryId, {
                    name: action.data.name,
                    profileId: action.data.profileId || undefined,
                    startTime: action.data.startTime,
                    tool: action.data.tool || 'scissors',
                    flowerWeight: 0,
                    shakeWeight: 0,
                    trimWeight: 0,
                    wasteWeight: 0,
                });
            }
            break;
        case 'create_harvest':
            await apiService.createHarvest({
                strain: action.data.strain,
                licenseNumber: action.data.licenseNumber || '',
                allocation: action.data.allocation || 'Flower',
                name: action.data.name,
                plantCount: action.data.plantCount,
                dryingLocation: action.data.dryingLocation,
                targetWeight: action.data.targetWeight,
            });
            break;
        case 'record_wet_weight':
            if (action.data.harvestId) {
                await apiService.recordWetWeight(action.data.harvestId, action.data.weight);
            }
            break;
        case 'allocate_harvest':
            if (action.data.harvestId) {
                await apiService.allocateHarvest(action.data.harvestId, action.data.allocations);
            }
            break;
        case 'record_harvest_waste':
            if (action.data.harvestId) {
                await apiService.recordHarvestWaste(action.data.harvestId, action.data.wasteType, action.data.weight);
            }
            break;
        case 'move_harvest':
            if (action.data.harvestId) {
                await apiService.updateHarvest(action.data.harvestId, { dryingLocation: action.data.dryingLocation });
            }
            break;
        case 'delete_harvest':
            if (action.data.harvestId) {
                await apiService.deleteHarvest(action.data.harvestId);
            }
            break;
        case 'update_harvest':
            if (action.data.harvestId) {
                const { harvestId, harvestName, ...updates } = action.data;
                await apiService.updateHarvest(harvestId, updates);
            }
            break;
        case 'delete_batch':
            if (action.data.entryId) {
                await apiService.deleteBatch(action.data.entryId);
            }
            break;
        case 'change_batch_status':
            if (action.data.entryId) {
                const status = action.data.newStatus;
                if (status === 'active') await apiService.startBatch(action.data.entryId);
                else if (status === 'submitted') await apiService.submitBatch(action.data.entryId);
                else if (status === 'upcoming') await apiService.revertBatch(action.data.entryId);
            }
            break;
        case 'submit_session':
            await apiService.submitSession();
            break;
        case 'remove_trimmer':
            if (action.data.entryId) {
                // Resolve trimmerId from name by looking up the session
                let trimmerId = action.data.trimmerId;
                if (!trimmerId && action.data.trimmerName) {
                    const session = await apiService.getSession();
                    const entry = session?.entries.find(e => e.id === action.data.entryId);
                    const trimmer = entry?.trimmers.find(
                        t => t.name.toLowerCase().includes(action.data.trimmerName.toLowerCase())
                    );
                    trimmerId = trimmer?.id;
                }
                if (trimmerId) {
                    await apiService.removeTrimmer(action.data.entryId, trimmerId);
                }
            }
            break;
        case 'delete_trimmer_profile':
            if (action.data.profileId) {
                await apiService.deleteTrimmerProfile(action.data.profileId);
            }
            break;
        case 'update_trimmer':
            if (action.data.entryId && action.data.trimmerId) {
                await apiService.updateTrimmer(action.data.entryId, action.data.trimmerId, action.data.updates);
            }
            break;
        case 'update_plant_health': {
            let plantIds = action.data.plantIds as string[];
            let entityType = action.data.entityType as 'plants' | 'plantbatches';
            // If no plantIds were resolved client-side, look them up by room + strain
            if (!plantIds?.length && action.data.roomName) {
                // Try all phases to find the matching plants
                for (const phase of ['vegetative', 'flowering', 'nursery'] as const) {
                    const roomData = await apiService.getRoomMap(phase, action.data.roomName);
                    // Find matching strain group
                    for (const [, group] of Object.entries(roomData)) {
                        const g = group as any;
                        if (g.plants?.length && (!action.data.strain || g.strain?.toLowerCase().includes(action.data.strain.toLowerCase()))) {
                            plantIds = g.plants;
                            entityType = g.type === 'plantbatches' ? 'plantbatches' : 'plants';
                            break;
                        }
                    }
                    if (plantIds?.length) break;
                }
            }
            if (plantIds?.length) {
                await apiService.executePlantAction({
                    action: 'plant-health',
                    plantIds,
                    entityType,
                    health: action.data.health,
                    contaminants: action.data.contaminants,
                    note: action.data.note,
                });
            }
            break;
        }
        case 'create_planting': {
            // Resolve strain and room by name
            const strains = await apiService.getStrains();
            const rooms = await apiService.getRooms();
            const strain = strains.find(s => s.name.toLowerCase() === action.data.strainName?.toLowerCase());
            const room = rooms.find((r: any) => r.name.toLowerCase() === action.data.roomName?.toLowerCase());
            if (!strain || !room) break;

            if (action.data.plantingType === 'batch') {
                const batchName = action.data.batchName || `${strain.name}-${action.data.batchType || 'Clone'}-${new Date().toISOString().slice(0, 10)}`;
                await apiService.createPlanting({
                    type: 'batch',
                    name: batchName,
                    batchType: action.data.batchType || 'clone',
                    strainId: strain.id,
                    strainName: strain.name,
                    roomId: (room as any).id,
                    untrackedCount: action.data.count,
                });
            } else {
                const prefix = action.data.labelPrefix || strain.name.replace(/\s+/g, '').slice(0, 6).toUpperCase() + '-V';
                const plants = Array.from({ length: action.data.count }, (_, i) => ({
                    label: `${prefix}-${String(i + 1).padStart(3, '0')}`,
                    strainId: strain.id,
                    strainName: strain.name,
                    roomId: (room as any).id,
                }));
                await apiService.createPlanting({
                    type: 'plant',
                    plants,
                    growthPhase: action.data.growthPhase || 'vegetative',
                });
            }
            break;
        }
        case 'move_plants': {
            let plantIds = action.data.plantIds as string[];
            let entityType = action.data.entityType as 'plants' | 'plantbatches';
            // Resolve by strain + room if no IDs
            if (!plantIds?.length && (action.data.strain || action.data.sourceRoomName)) {
                const resolved = await resolvePlantIds(action.data.strain, action.data.sourceRoomName);
                if (resolved) { plantIds = resolved.plantIds; entityType = resolved.entityType; }
            }
            // Resolve target room
            const allRooms = await apiService.getRooms();
            const targetRoom = allRooms.find((r: any) => r.name.toLowerCase() === action.data.targetRoomName?.toLowerCase());
            if (plantIds?.length && targetRoom) {
                await apiService.executePlantAction({
                    action: 'change-room',
                    plantIds,
                    entityType,
                    targetRoomId: (targetRoom as any).id,
                });
            }
            break;
        }
        case 'change_plant_phase': {
            let plantIds = action.data.plantIds as string[];
            const entityType = 'plants' as const; // Phase changes only for individual plants
            if (!plantIds?.length && (action.data.strain || action.data.sourceRoomName)) {
                const resolved = await resolvePlantIds(action.data.strain, action.data.sourceRoomName);
                if (resolved) { plantIds = resolved.plantIds; }
            }
            let targetRoomId: string | undefined;
            if (action.data.targetRoomName) {
                const allRooms = await apiService.getRooms();
                const targetRoom = allRooms.find((r: any) => r.name.toLowerCase() === action.data.targetRoomName?.toLowerCase());
                if (targetRoom) targetRoomId = (targetRoom as any).id;
            }
            if (plantIds?.length) {
                await apiService.executePlantAction({
                    action: 'change-phase',
                    plantIds,
                    entityType,
                    targetPhase: action.data.targetPhase,
                    targetRoomId,
                });
            }
            break;
        }
        case 'destroy_plants': {
            let plantIds = action.data.plantIds as string[];
            let entityType = action.data.entityType as 'plants' | 'plantbatches';
            if (!plantIds?.length && (action.data.strain || action.data.roomName)) {
                const resolved = await resolvePlantIds(action.data.strain, action.data.roomName);
                if (resolved) { plantIds = resolved.plantIds; entityType = resolved.entityType; }
            }
            if (plantIds?.length) {
                await apiService.executePlantAction({
                    action: 'destroy',
                    plantIds,
                    entityType,
                });
            }
            break;
        }
        case 'convert_to_trim':
            if (action.data.allocationId) {
                await apiService.convertToTrim(action.data.allocationId);
            }
            break;
        case 'create_strain':
            await apiService.upsertStrain(action.data.name);
            break;
        case 'delete_strain': {
            let strainId = action.data.strainId;
            if (!strainId && action.data.strainName) {
                const allStrains = await apiService.getStrains();
                const match = allStrains.find(s => s.name.toLowerCase() === action.data.strainName.toLowerCase());
                strainId = match?.id;
            }
            if (strainId) await apiService.deleteStrain(strainId);
            break;
        }
        case 'create_license':
            await apiService.createLicense(action.data.licenseNumber, action.data.label);
            break;
        case 'delete_license': {
            let licenseId = action.data.licenseId;
            if (!licenseId && action.data.licenseNumber) {
                const allLicenses = await apiService.getAllLicenses();
                const match = allLicenses.find(l => l.licenseNumber === action.data.licenseNumber);
                licenseId = match?.id;
            }
            if (licenseId) await apiService.deleteLicense(licenseId);
            break;
        }
        case 'import_tags':
            await apiService.importTags(action.data.tagNumbers, action.data.tagType || 'plant');
            break;
        case 'assign_tag': {
            // Find tag by number, then find plant to assign to
            const allTags = await apiService.getTags({ status: 'available' });
            const tag = allTags.find(t => t.tagNumber === action.data.tagNumber);
            if (tag && action.data.plantIdentifier) {
                const resolved = await resolvePlantIds(action.data.plantIdentifier, action.data.roomName);
                if (resolved && resolved.plantIds.length > 0) {
                    if (resolved.entityType === 'plants') {
                        await apiService.assignTag(tag.id, resolved.plantIds[0]);
                    } else {
                        await apiService.assignTag(tag.id, undefined, resolved.plantIds[0]);
                    }
                }
            }
            break;
        }
        case 'auto_assign_tags': {
            const resolved = await resolvePlantIds(action.data.strain, action.data.roomName);
            if (resolved) {
                const availTags = await apiService.getTags({ status: 'available', type: resolved.entityType === 'plants' ? 'plant' : 'batch' });
                const count = action.data.count || resolved.plantIds.length;
                for (let i = 0; i < Math.min(count, availTags.length, resolved.plantIds.length); i++) {
                    if (resolved.entityType === 'plants') {
                        await apiService.assignTag(availTags[i].id, resolved.plantIds[i]);
                    } else {
                        await apiService.assignTag(availTags[i].id, undefined, resolved.plantIds[i]);
                    }
                }
            }
            break;
        }
        case 'create_package':
            await apiService.createPackage(action.data as any);
            break;
        case 'update_package':
            if (action.data.packageId) {
                const { packageId, ...updates } = action.data;
                await apiService.updatePackage(packageId, updates);
            }
            break;
        case 'finish_package':
            if (action.data.packageId) {
                await apiService.updatePackage(action.data.packageId, { status: 'finished' } as any);
            }
            break;
        case 'delete_package':
            if (action.data.packageId) {
                await apiService.deletePackage(action.data.packageId);
            }
            break;
        case 'create_room':
            await apiService.createRoom({
                name: action.data.name,
                roomType: action.data.roomType,
                capacity: action.data.capacity,
                squareFootage: action.data.squareFootage,
                notes: action.data.notes,
            });
            break;
        case 'update_room': {
            const allRooms = await apiService.getRooms();
            const room = allRooms.find(r => r.name.toLowerCase() === action.data.roomName?.toLowerCase());
            if (room) {
                const { roomName: _rn, ...updates } = action.data;
                await apiService.updateRoom(room.id, updates);
            }
            break;
        }
        case 'delete_room': {
            const allRooms = await apiService.getRooms();
            const room = allRooms.find(r => r.name.toLowerCase() === action.data.roomName?.toLowerCase());
            if (room) await apiService.deleteRoom(room.id);
            break;
        }
        case 'create_human_task':
            // Human tasks are handled separately via useHumanTasks hook — no-op here
            break;
        case 'update_human_task':
            // Handled separately via useAIChat confirmActions — no-op here
            break;
        case 'delete_human_task':
            // Handled separately via useAIChat confirmActions — no-op here
            break;
    }
}

export interface ExecutionResult {
    succeeded: number;
    failed: Array<{ action: ProposedAction; error: string }>;
}

/**
 * Execute multiple actions sequentially, collecting results.
 */
export async function executeActions(actions: ProposedAction[]): Promise<ExecutionResult> {
    const result: ExecutionResult = { succeeded: 0, failed: [] };

    for (const action of actions) {
        try {
            await executeAction(action);
            result.succeeded++;
        } catch (error) {
            result.failed.push({
                action,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return result;
}

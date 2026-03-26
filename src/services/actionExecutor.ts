import type { ProposedAction } from '../types/definitions';
import { apiService } from './apiService';

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

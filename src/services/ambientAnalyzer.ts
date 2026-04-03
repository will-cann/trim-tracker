import type { ProposedAction } from '../types/definitions';
import { apiService } from './apiService';
import { executeAction } from './actionExecutor';

export interface ActionItemState {
    label: string;
    status: 'pending' | 'done' | 'skipped' | 'error';
    detail?: string;
}

export interface AmbientResult {
    status: 'created' | 'partial' | 'no_action' | 'error';
}

/** Generate a short human-readable label for an action */
function actionLabel(action: ProposedAction): string {
    const d = action.data;
    switch (action.type) {
        case 'create_session': return `Start session${d.strain ? ` — ${d.strain}` : ''}`;
        case 'add_batch': return `Add batch${d.strain ? ` — ${d.strain}` : ''}`;
        case 'assign_trimmer': return `Assign ${d.name || 'trimmer'}`;
        case 'add_trimmer_profile': return `Add ${d.name} to roster`;
        case 'create_harvest': return `Create harvest${d.strain ? ` — ${d.strain}` : ''}`;
        case 'record_wet_weight': return `Record weight${d.weight ? ` — ${d.weight}g` : ''}`;
        case 'allocate_harvest': return `Allocate harvest`;
        case 'record_harvest_waste': return `Record waste${d.wasteType ? ` — ${d.wasteType}` : ''}`;
        case 'record_plant_weight': return `Record ${d.weights?.length || ''} plant weight(s)`;
        case 'flag_contamination': return `Flag contamination`;
        case 'move_harvest': return `Move harvest${d.dryingLocation ? ` → ${d.dryingLocation}` : ''}`;
        case 'delete_harvest': return `Delete harvest`;
        case 'update_harvest': return `Update harvest`;
        case 'delete_batch': return `Delete batch`;
        case 'change_batch_status': return `Change status → ${d.newStatus || ''}`;
        case 'update_batch_weight': return `Update ${d.weightType || ''} weight${d.value ? ` → ${d.value}g` : ''}`;
        case 'submit_session': return `Submit session`;
        case 'remove_trimmer': return `Remove ${d.trimmerName || 'trimmer'}`;
        case 'delete_trimmer_profile': return `Remove profile`;
        case 'update_trimmer_profile': return `Update profile${d.name ? ` → ${d.name}` : ''}`;
        case 'update_trimmer': return `Update ${d.trimmerName || 'trimmer'}`;
        case 'update_plant_health': return `Health ${d.strain || d.plantIdentifier || d.roomName || ''}${d.health != null ? ` → ${d.health}%` : ''}`;
        case 'create_planting': return `Create ${d.count || ''} ${d.plantingType || 'planting'}${d.strainName ? ` — ${d.strainName}` : ''}`;
        case 'move_plants': return `Move plants${d.targetRoomName ? ` → ${d.targetRoomName}` : ''}`;
        case 'change_plant_phase': return `Change phase → ${d.targetPhase || ''}`;
        case 'destroy_plants': return `Destroy plants${d.strain ? ` — ${d.strain}` : ''}`;
        case 'convert_to_trim': return `Convert to trim`;
        case 'create_strain': return `Create strain — ${d.name || ''}`;
        case 'delete_strain': return `Delete strain`;
        case 'create_license': return `Create license`;
        case 'delete_license': return `Delete license`;
        case 'update_license': return `Update license${d.label ? ` → "${d.label}"` : ''}`;
        case 'import_tags': return `Import tags`;
        case 'assign_tag': return `Assign tag`;
        case 'auto_assign_tags': return `Auto-assign tags`;
        case 'record_extraction': return `Extraction${d.strain ? ` — ${d.strain}` : ''}${d.outputPackageType ? ` → ${d.outputPackageType.replace('_', ' ')}` : ''}`;
        case 'create_package': return `Create package`;
        case 'update_package': return `Update package`;
        case 'finish_package': return `Finish package`;
        case 'delete_package': return `Delete package`;
        case 'create_room': return `Create room — ${d.name || ''}`;
        case 'update_room': return `Update room`;
        case 'delete_room': return `Delete room`;
        case 'create_human_task': return `Task: ${d.title || 'new task'}`;
        default: return action.type.replace(/_/g, ' ');
    }
}

/**
 * Analyze an ambient transcript chunk with live progress updates.
 * Calls onProgress after each action so the UI can show a live checklist.
 */
type AiParseContext = Parameters<typeof apiService.aiParse>[0]['context'];
type HumanTaskData = { title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string };

export async function analyzeAmbientChunk(
    text: string,
    context: AiParseContext,
    callbacks: {
        onCreateHumanTasks?: (tasks: HumanTaskData[]) => Promise<void>;
        onSessionUpdate: () => Promise<void>;
        onProgress?: (items: ActionItemState[]) => void;
        onInterceptAction?: (action: ProposedAction) => boolean;
    },
    recentTranscriptHistory?: string[],
): Promise<AmbientResult> {
    const result = await apiService.aiParse({
        transcriptChunks: [text],
        context,
        recentTranscriptHistory,
    });

    if (result.actions.length === 0) {
        return { status: 'no_action' };
    }

    // Build the action items list — all start as pending
    const items: ActionItemState[] = result.actions.map(a => ({
        label: actionLabel(a),
        status: 'pending' as const,
    }));

    // Report initial pending state
    callbacks.onProgress?.(structuredClone(items));

    let anyAutoExecuted = false;
    let anyExecuted = false;
    let anySkipped = false;

    for (let i = 0; i < result.actions.length; i++) {
        const action = result.actions[i];

        if (action.type === 'create_human_task') {
            // Handle task creation
            if (callbacks.onCreateHumanTasks) {
                try {
                    await callbacks.onCreateHumanTasks([action.data as HumanTaskData]);
                    items[i] = { ...items[i], status: 'done' };
                    anyExecuted = true;
                } catch (e) {
                    items[i] = { ...items[i], status: 'error', detail: e instanceof Error ? e.message : 'Failed' };
                    anySkipped = true;
                }
            } else {
                items[i] = { ...items[i], status: 'skipped', detail: 'No task handler' };
                anySkipped = true;
            }
        } else if (callbacks.onInterceptAction?.(action)) {
            // Action intercepted (e.g., extraction routed to card)
            items[i] = { ...items[i], status: 'done', detail: 'Added to extraction card' };
            anyExecuted = true;
        } else {
            // Execute automated action
            try {
                const outcome = await executeAction(action);
                if (outcome.executed) {
                    items[i] = { ...items[i], status: 'done' };
                    anyExecuted = true;
                    anyAutoExecuted = true;
                } else {
                    items[i] = { ...items[i], status: 'skipped', detail: outcome.label };
                    anySkipped = true;
                }
            } catch (e) {
                items[i] = { ...items[i], status: 'error', detail: e instanceof Error ? e.message : 'Failed' };
                anySkipped = true;
            }
        }

        // Report progress after each action
        callbacks.onProgress?.(structuredClone(items));
    }

    // Refresh session data if any automated actions executed
    if (anyAutoExecuted) {
        await callbacks.onSessionUpdate();
    }

    if (!anyExecuted && anySkipped) {
        return { status: 'partial' };
    }
    if (anySkipped) {
        return { status: 'partial' };
    }
    return { status: 'created' };
}

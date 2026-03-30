import type { ProposedAction } from '../types/definitions';
import { apiService } from './apiService';
import { executeAction } from './actionExecutor';
import type { ActionOutcome } from './actionExecutor';

export interface AmbientResult {
    status: 'created' | 'partial' | 'no_action' | 'error';
    /** Human-readable summary of what happened */
    summary?: string;
}

/**
 * Analyze an ambient transcript chunk: call AI parse, execute any automated
 * actions, and create human tasks. Returns the final status with details.
 */
export async function analyzeAmbientChunk(
    text: string,
    context: Record<string, unknown>,
    callbacks: {
        onCreateHumanTasks?: (tasks: Array<Record<string, unknown>>) => Promise<void>;
        onSessionUpdate: () => Promise<void>;
    },
): Promise<AmbientResult> {
    const result = await apiService.aiParse({
        transcriptChunks: [text],
        context,
    });

    if (result.actions.length === 0) {
        return { status: 'no_action' };
    }

    // Split actions by type
    const taskActions: ProposedAction[] = [];
    const automatedActions: ProposedAction[] = [];
    for (const action of result.actions) {
        if (action.type === 'create_human_task') {
            taskActions.push(action);
        } else {
            automatedActions.push(action);
        }
    }

    // Execute automated actions and collect outcomes
    const outcomes: ActionOutcome[] = [];
    for (const action of automatedActions) {
        outcomes.push(await executeAction(action));
    }

    const executed = outcomes.filter(o => o.executed).length;
    const skipped = outcomes.filter(o => !o.executed);

    // Create human tasks
    let tasksCreated = 0;
    if (taskActions.length > 0 && callbacks.onCreateHumanTasks) {
        await callbacks.onCreateHumanTasks(taskActions.map(a => a.data as Record<string, unknown>));
        tasksCreated = taskActions.length;
    }

    // Refresh session data if any automated actions executed
    if (executed > 0) {
        await callbacks.onSessionUpdate();
    }

    // Build summary
    const total = executed + tasksCreated;
    const parts: string[] = [];
    if (executed > 0) {
        const labels = outcomes.filter(o => o.executed).map(o => o.label);
        parts.push(labels.join(', '));
    }
    if (tasksCreated > 0) {
        parts.push(`${tasksCreated} task${tasksCreated > 1 ? 's' : ''} created`);
    }
    if (skipped.length > 0) {
        const reasons = skipped.map(o => o.label);
        parts.push(reasons.join('; '));
    }

    if (total === 0 && skipped.length > 0) {
        return {
            status: 'partial',
            summary: skipped.map(o => o.label).join('; '),
        };
    }

    if (skipped.length > 0 && total > 0) {
        return {
            status: 'partial',
            summary: parts.join(' · '),
        };
    }

    return {
        status: 'created',
        summary: parts.join(' · '),
    };
}

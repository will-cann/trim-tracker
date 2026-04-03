import { useState, useCallback, useEffect, useRef } from 'react';
import type { TrimSession, TrimmerProfile, ProposedAction, ChatMessage, Harvest, ActionResultItem } from '../types/definitions';
import { apiService } from '../services/apiService';
import { executeAction } from '../services/actionExecutor';

const ACTION_WORDS: Record<string, string> = {
    start: 'Start', starting: 'Start', begin: 'Start', create: 'New', 'new': 'New',
    add: 'Add', adding: 'Add', assign: 'Assign', assigning: 'Assign',
    record: 'Record', recording: 'Record', log: 'Log',
    move: 'Move', moving: 'Move', transfer: 'Transfer',
    upload: 'Upload CSV', uploaded: 'Upload CSV',
    remove: 'Remove', delete: 'Delete',
    track: 'Track', tracking: 'Track',
    weigh: 'Weigh', weight: 'Weight',
    allocate: 'Allocate', harvest: 'Harvest',
};

const FILLER = new Set([
    'a', 'an', 'the', 'to', 'for', 'with', 'of', 'in', 'on', 'at', 'and', 'or',
    'my', 'our', 'this', 'that', 'some', 'please', 'can', 'you', 'i', 'we',
    'want', 'need', 'would', 'like', 'today', 'now', 'also', 'me', 'it', 'is',
    'am', 'are', 'was', 'do', 'does', 'did', 'have', 'has', 'just', 'go', 'gonna',
]);

function summarizeMessage(text: string): string {
    // Handle CSV uploads
    if (text.includes('CSV') || text.includes('csv')) return 'CSV upload';

    const words = text.replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'New conversation';

    // Find the action word
    let action = '';
    let actionIdx = -1;
    for (let i = 0; i < words.length; i++) {
        if (ACTION_WORDS[words[i]]) {
            action = ACTION_WORDS[words[i]];
            actionIdx = i;
            break;
        }
    }

    // Collect meaningful subject words (skip filler)
    const subjectWords: string[] = [];
    const startFrom = actionIdx >= 0 ? actionIdx + 1 : 0;
    for (let i = startFrom; i < words.length && subjectWords.length < 4; i++) {
        if (!FILLER.has(words[i]) && !ACTION_WORDS[words[i]]) {
            subjectWords.push(words[i]);
        }
    }

    // Capitalize subject
    const subject = subjectWords
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    if (action && subject) return `${action} ${subject}`;
    if (action) return action;
    if (subject) return subject;

    // Fallback: first 40 chars
    return text.slice(0, 40) + (text.length > 40 ? '...' : '');
}

interface UseAIChatOptions {
    session: TrimSession | null;
    trimmerProfiles: TrimmerProfile[];
    harvests?: Harvest[];
    onSessionUpdate: () => Promise<void>;
    conversationId?: string | null;
    onSaveConversation?: (id: string, title: string, messages: ChatMessage[]) => Promise<void>;
    activeLicense?: string | null;
    onCreateHumanTasks?: (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => Promise<void>;
    onUpdateHumanTask?: (id: string, updates: Record<string, any>) => Promise<void>;
    onDeleteHumanTask?: (id: string) => Promise<void>;
    humanTasks?: Array<{ id: string; title: string; status: string; priority: string; category: string; assignee?: string; location?: string }>;
    plantMapSummary?: Array<{ roomName: string; roomId: string; strains: string[]; plantIds: string[]; entityType: 'plants' | 'plantbatches'; plantHealth: number; contaminants: string[] }>;
    screenContext?: string;
    onInterceptAction?: (action: ProposedAction) => boolean;
}

export const useAIChat = ({
    session,
    trimmerProfiles,
    harvests,
    onSessionUpdate,
    conversationId,
    onSaveConversation,
    activeLicense,
    onCreateHumanTasks,
    onUpdateHumanTask,
    onDeleteHumanTask,
    humanTasks,
    plantMapSummary,
    screenContext,
    onInterceptAction,
}: UseAIChatOptions) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pendingActions, setPendingActions] = useState<ProposedAction[] | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    // Track effective conversationId via ref so it's available immediately after creation
    const conversationIdRef = useRef(conversationId);
    conversationIdRef.current = conversationId;

    const setConversationId = useCallback((id: string) => {
        conversationIdRef.current = id;
    }, []);

    // Persist to Dexie when messages change (only for conversation-backed chats)
    useEffect(() => {
        const effectiveId = conversationIdRef.current;
        if (effectiveId && onSaveConversation && messages.length > 0) {
            const firstUserMsg = messages.find(m => m.role === 'user');
            const title = firstUserMsg
                ? summarizeMessage(firstUserMsg.content)
                : 'New conversation';
            onSaveConversation(effectiveId, title, messages);
        }
    }, [messages, onSaveConversation]);

    const loadMessages = useCallback((msgs: ChatMessage[]) => {
        // Clear stale pending status
        const cleaned = msgs.map(m => m.status === 'pending' ? { ...m, status: 'cancelled' as const } : m);
        setMessages(cleaned);
        setPendingActions(null);
    }, []);

    const buildContext = useCallback(() => ({
        hasActiveSession: !!session,
        sessionId: session?.id,
        trimmerProfiles: trimmerProfiles.map(p => ({ id: p.id, name: p.name })),
        existingEntries: (session?.entries || []).map(e => ({
            id: e.id,
            harvestName: e.harvestName,
            strain: e.strain,
            status: e.status,
            trimmers: e.trimmers?.map(t => ({
                id: t.id,
                name: t.name,
                startTime: t.startTime,
                endTime: t.endTime,
                tool: t.tool,
            })),
        })),
        harvests: (harvests || []).map(h => ({
            id: h.id,
            batchId: h.batchId,
            strain: h.strain,
            status: h.status,
        })),
        activeLicenseNumber: activeLicense || undefined,
        humanTasks: (humanTasks || []).map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            category: t.category,
            assignee: t.assignee,
            location: t.location,
        })),
        plantMapSummary: plantMapSummary || undefined,
        screenContext: screenContext || undefined,
    }), [session, trimmerProfiles, harvests, activeLicense, humanTasks, plantMapSummary, screenContext]);

    const addMessage = useCallback((role: 'user' | 'assistant', content: string, extra?: { actions?: ProposedAction[]; results?: ActionResultItem[] }) => {
        const msg: ChatMessage = {
            id: crypto.randomUUID(),
            role,
            content,
            actions: extra?.actions,
            results: extra?.results,
            status: extra?.actions?.length ? 'pending' : undefined,
        };
        setMessages(prev => [...prev, msg]);
        return msg;
    }, []);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isLoading) return;

        addMessage('user', text);
        setIsLoading(true);

        try {
            // Send full conversation history for multi-turn context
            const history = [...messagesRef.current.map(m => ({
                role: m.role,
                content: m.content,
            })), { role: 'user' as const, content: text }];

            const result = await apiService.aiParse({
                message: text,
                history,
                context: buildContext(),
            });

            // Route interceptable actions (e.g., extraction) to their card
            const intercepted: ProposedAction[] = [];
            const remaining: ProposedAction[] = [];
            for (const action of result.actions) {
                if (onInterceptAction?.(action)) {
                    intercepted.push(action);
                } else {
                    remaining.push(action);
                }
            }

            addMessage('assistant', result.message, { actions: result.actions });

            if (remaining.length > 0) {
                setPendingActions(remaining);
            } else if (intercepted.length > 0) {
                // All actions were intercepted — auto-switch to tasks tab
                setPendingActions(null);
            }
        } catch (error) {
            const isNetworkError = error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'));
            const hint = isNetworkError
                ? 'It looks like there was a connection issue. Check your network and try again.'
                : 'I had trouble understanding that. Try rephrasing, or use one of these examples:';
            addMessage('assistant', `${hint}\n\n` +
                '- **Trim sessions** — "Start a session with OG Kush, 500g"\n' +
                '- **Batches** — "Add 3 batches of Blue Dream at 750g each"\n' +
                '- **Harvests** — "New harvest for Gelato, 12 plants"\n' +
                '- **Trimmers** — "Assign Maria to the active batch at 8am"\n' +
                '- **Tasks** — "Remind me to check dry room humidity tomorrow"\n' +
                '- **Plant map** — "Update room A health to 85"\n' +
                '- **Reports** — "How did the team do last week?"');
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, addMessage, buildContext]);

    const sendCSV = useCallback(async (csvText: string) => {
        if (isLoading) return;

        addMessage('user', '\u{1F4CE} Uploaded CSV file');
        setIsLoading(true);

        try {
            const result = await apiService.aiParse({
                csvData: csvText,
                context: buildContext(),
            });

            const csvIntercepted: ProposedAction[] = [];
            const csvRemaining: ProposedAction[] = [];
            for (const action of result.actions) {
                if (onInterceptAction?.(action)) {
                    csvIntercepted.push(action);
                } else {
                    csvRemaining.push(action);
                }
            }

            addMessage('assistant', result.message, { actions: result.actions });

            if (csvRemaining.length > 0) {
                setPendingActions(csvRemaining);
            } else if (csvIntercepted.length > 0) {
                setPendingActions(null);
            }
        } catch (error) {
            addMessage('assistant', 'I couldn\'t parse that CSV. Here are a few tips:\n\n' +
                '- Include columns for **harvest name**, **strain**, **license number**, and **start weight**\n' +
                '- Column names don\'t need to match exactly — I\'ll figure out the mapping\n' +
                '- Make sure the file is saved as `.csv` (not `.xlsx`)\n' +
                '- Check for empty rows or special characters that might break the format');
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, addMessage, buildContext]);

    const confirmActions = useCallback(async () => {
        if (!pendingActions || isExecuting) return;

        setIsExecuting(true);
        try {
            // Split by handler type
            const humanTaskCreates = pendingActions.filter(a => a.type === 'create_human_task');
            const humanTaskUpdates = pendingActions.filter(a => a.type === 'update_human_task');
            const humanTaskDeletes = pendingActions.filter(a => a.type === 'delete_human_task');
            const automatedActions = pendingActions.filter(a =>
                a.type !== 'create_human_task' && a.type !== 'update_human_task' && a.type !== 'delete_human_task'
            );

            for (const action of automatedActions) {
                await executeAction(action);
            }

            // Create human tasks
            if (humanTaskCreates.length > 0 && onCreateHumanTasks) {
                await onCreateHumanTasks(humanTaskCreates.map(a => a.data as any));
            }

            // Update human tasks
            if (onUpdateHumanTask) {
                for (const action of humanTaskUpdates) {
                    const { taskId, taskTitle, ...updates } = action.data;
                    if (taskId) await onUpdateHumanTask(taskId, updates);
                }
            }

            // Delete human tasks
            if (onDeleteHumanTask) {
                for (const action of humanTaskDeletes) {
                    if (action.data.taskId) await onDeleteHumanTask(action.data.taskId);
                }
            }

            setMessages(prev => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].status === 'pending') {
                        updated[i] = { ...updated[i], status: 'confirmed' };
                        break;
                    }
                }
                return updated;
            });

            setPendingActions(null);
            await onSessionUpdate();

            // Build structured results with navigation links
            const results: ActionResultItem[] = pendingActions.map(action => {
                const d = action.data;
                switch (action.type) {
                    case 'create_session':
                        return { type: action.type, label: 'Session started', summary: [d.strain, d.harvestName].filter(Boolean).join(' · '), navigateTo: 'dashboard' as const };
                    case 'add_batch':
                        return { type: action.type, label: 'Batch added', summary: [d.strain, d.startWeight && `${d.startWeight}g`].filter(Boolean).join(' · '), navigateTo: 'dashboard' as const };
                    case 'assign_trimmer':
                        return { type: action.type, label: 'Trimmer assigned', summary: [d.name, d.entryName].filter(Boolean).join(' → '), navigateTo: 'dashboard' as const };
                    case 'add_trimmer_profile':
                        return { type: action.type, label: 'Added to roster', summary: d.name || '' };
                    case 'create_harvest':
                        return { type: action.type, label: 'Harvest created', summary: [d.strain, d.plantCount && `${d.plantCount} plants`].filter(Boolean).join(' · '), navigateTo: 'harvests' as const };
                    case 'record_wet_weight':
                        return { type: action.type, label: 'Weight recorded', summary: [d.harvestIdentifier, d.weight && `${d.weight}g`].filter(Boolean).join(' · '), navigateTo: 'harvests' as const };
                    case 'allocate_harvest':
                        return { type: action.type, label: 'Harvest allocated', summary: d.harvestIdentifier || '', navigateTo: 'harvests' as const };
                    case 'record_harvest_waste':
                        return { type: action.type, label: 'Waste recorded', summary: [d.wasteType, d.weight && `${d.weight}g`].filter(Boolean).join(' · '), navigateTo: 'harvests' as const };
                    case 'move_harvest':
                        return { type: action.type, label: 'Harvest moved', summary: [d.harvestIdentifier, d.dryingLocation].filter(Boolean).join(' → '), navigateTo: 'harvests' as const };
                    case 'create_human_task':
                        return { type: action.type, label: 'Task created', summary: d.title || '', navigateTo: 'tasks' as const };
                    case 'update_human_task':
                        return { type: action.type, label: 'Task updated', summary: d.taskTitle || '', navigateTo: 'tasks' as const };
                    case 'delete_human_task':
                        return { type: action.type, label: 'Task deleted', summary: d.taskTitle || '', navigateTo: 'tasks' as const };
                    case 'delete_harvest':
                        return { type: action.type, label: 'Harvest deleted', summary: d.harvestName || '', navigateTo: 'harvests' as const };
                    case 'update_harvest':
                        return { type: action.type, label: 'Harvest updated', summary: d.harvestName || '', navigateTo: 'harvests' as const };
                    case 'delete_batch':
                        return { type: action.type, label: 'Batch deleted', summary: d.entryName || '', navigateTo: 'dashboard' as const };
                    case 'change_batch_status':
                        return { type: action.type, label: 'Status changed', summary: [d.entryName, d.newStatus].filter(Boolean).join(' → '), navigateTo: 'dashboard' as const };
                    case 'submit_session':
                        return { type: action.type, label: 'Session submitted', summary: '', navigateTo: 'dashboard' as const };
                    case 'remove_trimmer':
                        return { type: action.type, label: 'Trimmer removed', summary: [d.trimmerName, d.entryName].filter(Boolean).join(' from '), navigateTo: 'dashboard' as const };
                    case 'delete_trimmer_profile':
                        return { type: action.type, label: 'Removed from roster', summary: d.profileName || '' };
                    case 'update_trimmer':
                        return { type: action.type, label: 'Trimmer updated', summary: [d.trimmerName, d.entryName].filter(Boolean).join(' on '), navigateTo: 'dashboard' as const };
                    case 'update_plant_health':
                        return { type: action.type, label: 'Plant health updated', summary: [d.strain, d.health !== undefined && `health: ${d.health}`].filter(Boolean).join(' · '), navigateTo: 'plant-map' as const };
                    case 'create_planting':
                        return { type: action.type, label: 'Planting created', summary: [d.strainName, d.count && `${d.count} plants`].filter(Boolean).join(' · '), navigateTo: 'plant-map' as const };
                    case 'move_plants':
                        return { type: action.type, label: 'Plants moved', summary: [d.strain, d.targetRoomName].filter(Boolean).join(' → '), navigateTo: 'plant-map' as const };
                    case 'change_plant_phase':
                        return { type: action.type, label: 'Phase changed', summary: [d.strain, d.targetPhase].filter(Boolean).join(' → '), navigateTo: 'plant-map' as const };
                    case 'destroy_plants':
                        return { type: action.type, label: 'Plants destroyed', summary: d.strain || '', navigateTo: 'plant-map' as const };
                    case 'record_extraction':
                        return { type: action.type, label: 'Extraction recorded', summary: [d.strain, d.inputPackageType?.replace('_', ' '), '→', d.outputPackageType?.replace('_', ' ')].filter(Boolean).join(' '), navigateTo: 'extractions' as const };
                    case 'create_package':
                        return { type: action.type, label: 'Package created', summary: [d.strain, d.packageType?.replace('_', ' ')].filter(Boolean).join(' · '), navigateTo: 'packages' as const };
                    case 'update_package':
                        return { type: action.type, label: 'Package updated', summary: d.label || '', navigateTo: 'packages' as const };
                    case 'finish_package':
                        return { type: action.type, label: 'Package finished', summary: d.label || '', navigateTo: 'packages' as const };
                    case 'delete_package':
                        return { type: action.type, label: 'Package deleted', summary: d.label || '', navigateTo: 'packages' as const };
                    case 'record_plant_weight':
                        return { type: action.type, label: 'Weight recorded', summary: `${d.weights?.length || 0} plant(s)`, navigateTo: 'harvests' as const };
                    case 'flag_contamination':
                        return { type: action.type, label: 'Contamination flagged', summary: d.contaminants?.join(', ') || '', navigateTo: 'harvests' as const };
                    case 'create_strain':
                        return { type: action.type, label: 'Strain created', summary: d.name || '', navigateTo: 'settings' as const };
                    case 'delete_strain':
                        return { type: action.type, label: 'Strain deleted', summary: d.strainName || '', navigateTo: 'settings' as const };
                    case 'create_license':
                        return { type: action.type, label: 'License created', summary: d.licenseNumber || '', navigateTo: 'settings' as const };
                    case 'update_license':
                        return { type: action.type, label: 'License updated', summary: [d.licenseNumber, d.label].filter(Boolean).join(' → '), navigateTo: 'settings' as const };
                    case 'import_tags':
                        return { type: action.type, label: 'Tags imported', summary: `${d.tagNumbers?.length || 0} tag(s)`, navigateTo: 'tag-list' as const };
                    case 'assign_tag':
                        return { type: action.type, label: 'Tag assigned', summary: d.tagNumber || '', navigateTo: 'tag-list' as const };
                    case 'auto_assign_tags':
                        return { type: action.type, label: 'Tags auto-assigned', summary: [d.strain, d.count && `${d.count} tags`].filter(Boolean).join(' · '), navigateTo: 'tag-list' as const };
                    case 'create_room':
                        return { type: action.type, label: 'Room created', summary: d.name || '', navigateTo: 'settings' as const };
                    case 'update_room':
                        return { type: action.type, label: 'Room updated', summary: d.roomName || '', navigateTo: 'settings' as const };
                    case 'delete_room':
                        return { type: action.type, label: 'Room deleted', summary: d.roomName || '', navigateTo: 'settings' as const };
                    case 'convert_to_trim':
                        return { type: action.type, label: 'Converted to trim', summary: '', navigateTo: 'dashboard' as const };
                    case 'update_trimmer_profile':
                        return { type: action.type, label: 'Profile updated', summary: d.name || '', navigateTo: 'dashboard' as const };
                    case 'update_batch_weight':
                        return { type: action.type, label: 'Weight updated', summary: [d.weightType, d.value && `${d.value}g`].filter(Boolean).join(' → '), navigateTo: 'dashboard' as const };
                    default:
                        return { type: action.type, label: 'Action applied', summary: '' };
                }
            });

            addMessage('assistant', `${results.length} action${results.length !== 1 ? 's' : ''} applied.`, { results });
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            addMessage('assistant', `Some actions failed: **${errMsg}**\n\n` +
                'Any actions that completed before the error are already saved. You can:\n' +
                '- Say **"retry"** to attempt the remaining actions again\n' +
                '- Rephrase what you need and I\'ll create fresh actions\n' +
                '- Check the dashboard to see what was already applied');
        } finally {
            setIsExecuting(false);
        }
    }, [pendingActions, isExecuting, onSessionUpdate, addMessage]);

    const cancelActions = useCallback(() => {
        setMessages(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].status === 'pending') {
                    updated[i] = { ...updated[i], status: 'cancelled' };
                    break;
                }
            }
            return updated;
        });
        setPendingActions(null);
    }, []);

    const editAction = useCallback((index: number, updatedData: Record<string, any>) => {
        setPendingActions(prev => {
            if (!prev) return prev;
            const updated = [...prev];
            updated[index] = { ...updated[index], data: { ...updated[index].data, ...updatedData } };
            return updated;
        });
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setPendingActions(null);
    }, []);

    const editMessage = useCallback((messageId: string): string | null => {
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1 || messages[idx].role !== 'user') return null;
        const text = messages[idx].content;
        // Remove this message and everything after it
        setMessages(prev => prev.slice(0, idx));
        setPendingActions(null);
        return text;
    }, [messages]);

    return {
        messages,
        isLoading,
        pendingActions,
        isExecuting,
        sendMessage,
        sendCSV,
        confirmActions,
        cancelActions,
        editAction,
        editMessage,
        clearMessages,
        loadMessages,
        setConversationId,
    };
};

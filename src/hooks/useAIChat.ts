import { useState, useCallback, useEffect, useRef } from 'react';
import type { TrimSession, TrimmerProfile, ProposedAction, ChatMessage, Harvest } from '../types/definitions';
import { apiService } from '../services/apiService';

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
}

export const useAIChat = ({
    session,
    trimmerProfiles,
    harvests,
    onSessionUpdate,
    conversationId,
    onSaveConversation,
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
        })),
        harvests: (harvests || []).map(h => ({
            id: h.id,
            batchId: h.batchId,
            strain: h.strain,
            status: h.status,
        })),
    }), [session, trimmerProfiles, harvests]);

    const addMessage = useCallback((role: 'user' | 'assistant', content: string, actions?: ProposedAction[]) => {
        const msg: ChatMessage = {
            id: crypto.randomUUID(),
            role,
            content,
            actions,
            status: actions?.length ? 'pending' : undefined,
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

            addMessage('assistant', result.message, result.actions);

            if (result.actions.length > 0) {
                setPendingActions(result.actions);
            }
        } catch (error) {
            addMessage('assistant', 'Sorry, I had trouble understanding that. Could you try rephrasing?');
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

            addMessage('assistant', result.message, result.actions);

            if (result.actions.length > 0) {
                setPendingActions(result.actions);
            }
        } catch (error) {
            addMessage('assistant', 'Sorry, I had trouble parsing that CSV. Please check the format and try again.');
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, addMessage, buildContext]);

    const confirmActions = useCallback(async () => {
        if (!pendingActions || isExecuting) return;

        setIsExecuting(true);
        try {
            for (const action of pendingActions) {
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

            addMessage('assistant', 'Done! All actions have been applied.');
        } catch (error) {
            addMessage('assistant', `Something went wrong while applying actions: ${error instanceof Error ? error.message : 'Unknown error'}. Some actions may have been partially applied.`);
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

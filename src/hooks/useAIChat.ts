import { useState, useCallback, useEffect, useRef } from 'react';
import type { TrimSession, TrimmerProfile, ProposedAction, ChatMessage, Harvest } from '../types/definitions';
import { apiService } from '../services/apiService';

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

    // Persist to Dexie when messages change (only for conversation-backed chats)
    useEffect(() => {
        if (conversationId && onSaveConversation && messages.length > 0) {
            const firstUserMsg = messages.find(m => m.role === 'user');
            const title = firstUserMsg
                ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
                : 'New conversation';
            onSaveConversation(conversationId, title, messages);
        }
    }, [messages, conversationId, onSaveConversation]);

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
            const result = await apiService.aiParse({
                message: text,
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
        clearMessages,
        loadMessages,
    };
};

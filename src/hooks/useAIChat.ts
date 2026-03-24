import { useState, useCallback, useEffect } from 'react';
import type { TrimSession, TrimmerProfile, ProposedAction, ChatMessage } from '../types/definitions';
import { apiService } from '../services/apiService';

const CHAT_STORAGE_KEY = 'trim-tracker-chat-messages';

const loadMessages = (): ChatMessage[] => {
    try {
        const stored = sessionStorage.getItem(CHAT_STORAGE_KEY);
        if (!stored) return [];
        const msgs: ChatMessage[] = JSON.parse(stored);
        // Clear any stale pending status on reload — those actions are lost
        return msgs.map(m => m.status === 'pending' ? { ...m, status: 'cancelled' as const } : m);
    } catch {
        return [];
    }
};

const saveMessages = (messages: ChatMessage[]) => {
    try {
        sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch { /* quota exceeded — ignore */ }
};

interface UseAIChatOptions {
    session: TrimSession | null;
    trimmerProfiles: TrimmerProfile[];
    onSessionUpdate: () => Promise<void>;
}

export const useAIChat = ({ session, trimmerProfiles, onSessionUpdate }: UseAIChatOptions) => {
    const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
    const [isLoading, setIsLoading] = useState(false);
    const [pendingActions, setPendingActions] = useState<ProposedAction[] | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);

    useEffect(() => {
        saveMessages(messages);
    }, [messages]);

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
    }), [session, trimmerProfiles]);

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

        addMessage('user', '📎 Uploaded CSV file');
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
                }
            }

            // Update the last assistant message status
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
        sessionStorage.removeItem(CHAT_STORAGE_KEY);
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
    };
};

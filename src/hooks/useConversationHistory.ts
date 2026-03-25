import { useState, useEffect, useCallback } from 'react';
import { chatDb } from '../services/chatDb';
import type { ChatMessage, ConversationSummary } from '../types/definitions';

export const useConversationHistory = () => {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);

    const loadConversations = useCallback(async () => {
        const records = await chatDb.conversations
            .orderBy('createdAt')
            .reverse()
            .toArray();
        setConversations(records.map(r => ({
            id: r.id,
            title: r.title,
            updatedAt: r.updatedAt,
        })));
    }, []);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    const createConversation = useCallback((): string => {
        return crypto.randomUUID();
    }, []);

    const saveConversation = useCallback(async (id: string, title: string, messages: ChatMessage[]) => {
        const now = new Date().toISOString();
        const existing = await chatDb.conversations.get(id);
        if (existing) {
            await chatDb.conversations.update(id, { title, messages, updatedAt: now });
        } else {
            await chatDb.conversations.add({ id, title, messages, createdAt: now, updatedAt: now });
        }
        await loadConversations();
    }, [loadConversations]);

    const loadConversation = useCallback(async (id: string): Promise<ChatMessage[]> => {
        const record = await chatDb.conversations.get(id);
        return record?.messages || [];
    }, []);

    const deleteConversation = useCallback(async (id: string) => {
        await chatDb.conversations.delete(id);
        await loadConversations();
    }, [loadConversations]);

    return {
        conversations,
        createConversation,
        saveConversation,
        loadConversation,
        deleteConversation,
    };
};

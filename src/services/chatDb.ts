import Dexie, { type Table } from 'dexie';
import type { ChatMessage } from '../types/definitions';

interface ConversationRecord {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}

class ChatDatabase extends Dexie {
    conversations!: Table<ConversationRecord, string>;

    constructor() {
        super('TrimTrackerChatDB');
        this.version(1).stores({
            conversations: 'id, updatedAt',
        });
    }
}

export const chatDb = new ChatDatabase();
export type { ConversationRecord };

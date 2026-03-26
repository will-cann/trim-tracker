import Dexie, { type Table } from 'dexie';
import type { ChatMessage, Task } from '../types/definitions';

interface ConversationRecord {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}

interface TaskRecord {
    id: string;
    conversationId: string;
    task: Task;
    createdAt: string;
    updatedAt: string;
}

class ChatDatabase extends Dexie {
    conversations!: Table<ConversationRecord, string>;
    tasks!: Table<TaskRecord, string>;

    constructor() {
        super('TrimTrackerChatDB');
        this.version(1).stores({
            conversations: 'id, updatedAt',
        });
        this.version(2).stores({
            conversations: 'id, updatedAt, createdAt',
        });
        this.version(3).stores({
            conversations: 'id, updatedAt, createdAt',
            tasks: 'id, conversationId, createdAt, updatedAt',
        });
    }
}

export const chatDb = new ChatDatabase();
export type { ConversationRecord, TaskRecord };

import Dexie, { type Table } from 'dexie';
import type { TrimSession, TrimmerProfile } from '../types/definitions';

export interface CompletedSession extends TrimSession {
    completedAt: string; // ISO timestamp when session was submitted
}

export class TrimTrackerDB extends Dexie {
    sessions!: Table<CompletedSession>;
    trimmerProfiles!: Table<TrimmerProfile>;

    constructor() {
        super('TrimTrackerDB');

        this.version(1).stores({
            sessions: 'id, completedAt, startTime', // indexed fields
            trimmerProfiles: 'id, name, status'
        });
    }
}

export const db = new TrimTrackerDB();

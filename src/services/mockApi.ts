import type { TrimSession, CreateTrimSessionDTO, TrimEntry, Trimmer, TrimmerProfile } from '../types/definitions';

const STORAGE_KEY = 'trim_session_mvp';

export const getSession = (): TrimSession | null => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return null;
        
        const session = JSON.parse(data);
        
        // Migrate existing data to include status field
        if (session.entries) {
            session.entries.forEach((entry: any) => {
                if (!entry.status) {
                    entry.status = 'active';
                }
            });
        }
        
        return session;
    } catch (e) {
        console.error("Error reading session", e);
        return null;
    }
};

const saveSession = (session: TrimSession): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const createSession = (data: CreateTrimSessionDTO): TrimSession => {
    const newEntry: TrimEntry = {
        id: crypto.randomUUID(),
        harvestName: data.harvestName,
        licenseNumber: data.licenseNumber,
        strain: data.strain,
        startWeight: Number(data.startWeight),
        flowerWeight: 0,
        shakeWeight: 0,
        trimWeight: 0,
        wasteWeight: 0,
        trimmers: [],
        status: 'active'
    };

    const newSession: TrimSession = {
        id: crypto.randomUUID(),
        startTime: new Date().toISOString(),
        entries: [newEntry],
        totalFlower: 0,
        totalShake: 0,
        totalTrim: 0,
        totalWaste: 0
    };

    saveSession(newSession);
    return newSession;
};

export const submitSession = (): void => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    localStorage.removeItem(STORAGE_KEY);
};

export const addBatch = (data: CreateTrimSessionDTO): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    const newEntry: TrimEntry = {
        id: crypto.randomUUID(),
        harvestName: data.harvestName,
        licenseNumber: data.licenseNumber,
        strain: data.strain,
        startWeight: Number(data.startWeight),
        flowerWeight: 0,
        shakeWeight: 0,
        trimWeight: 0,
        wasteWeight: 0,
        trimmers: [],
        status: 'active'
    };

    session.entries.push(newEntry);

    // Recalculate totals
    session.totalFlower = session.entries.reduce((sum, e) => sum + Number(e.flowerWeight), 0);
    session.totalShake = session.entries.reduce((sum, e) => sum + Number(e.shakeWeight), 0);
    session.totalTrim = session.entries.reduce((sum, e) => sum + Number(e.trimWeight), 0);
    session.totalWaste = session.entries.reduce((sum, e) => sum + Number(e.wasteWeight), 0);

    saveSession(session);
    return session;
};

export const updateEntryStrain = (entryId: string, strain: string): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    const entryIndex = session.entries.findIndex(e => e.id === entryId);
    if (entryIndex === -1) throw new Error('Entry not found');

    session.entries[entryIndex].strain = strain;
    saveSession(session);
    return session;
};

// Trimmer Management

const recalculateEntryFromTrimmers = (entry: TrimEntry) => {
    if (entry.trimmers && entry.trimmers.length > 0) {
        entry.flowerWeight = entry.trimmers.reduce((sum, t) => sum + Number(t.flowerWeight), 0);
        entry.shakeWeight = entry.trimmers.reduce((sum, t) => sum + Number(t.shakeWeight), 0);
        entry.trimWeight = entry.trimmers.reduce((sum, t) => sum + Number(t.trimWeight), 0);
        entry.wasteWeight = entry.trimmers.reduce((sum, t) => sum + Number(t.wasteWeight), 0);
    } else {
        entry.flowerWeight = 0;
        entry.shakeWeight = 0;
        entry.trimWeight = 0;
        entry.wasteWeight = 0;
    }
};

export const updateEntryWeight = (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', value: number): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    const entry = session.entries.find(e => e.id === entryId);
    if (!entry) throw new Error('Entry not found');

    // If trimmers exist, we shouldn't be manually updating weights directly, 
    // but for now we'll allow it if the UI permits (UI should handle read-only state)
    if (type === 'flower') entry.flowerWeight = value;
    if (type === 'shake') entry.shakeWeight = value;
    if (type === 'trim') entry.trimWeight = value;
    if (type === 'waste') entry.wasteWeight = value;

    // Recalculate totals
    session.totalFlower = session.entries.reduce((sum, e) => sum + Number(e.flowerWeight), 0);
    session.totalShake = session.entries.reduce((sum, e) => sum + Number(e.shakeWeight), 0);
    session.totalTrim = session.entries.reduce((sum, e) => sum + Number(e.trimWeight), 0);
    session.totalWaste = session.entries.reduce((sum, e) => sum + Number(e.wasteWeight), 0);

    saveSession(session);
    return session;
};

export const addTrimmer = (entryId: string, trimmer: Omit<Trimmer, 'id'>): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    const entry = session.entries.find(e => e.id === entryId);
    if (!entry) throw new Error('Entry not found');

    const newTrimmer: Trimmer = {
        ...trimmer,
        id: crypto.randomUUID()
    };

    if (!entry.trimmers) entry.trimmers = [];
    entry.trimmers.push(newTrimmer);

    recalculateEntryFromTrimmers(entry);

    // Update session totals
    session.totalFlower = session.entries.reduce((sum, e) => sum + Number(e.flowerWeight), 0);
    session.totalShake = session.entries.reduce((sum, e) => sum + Number(e.shakeWeight), 0);
    session.totalTrim = session.entries.reduce((sum, e) => sum + Number(e.trimWeight), 0);
    session.totalWaste = session.entries.reduce((sum, e) => sum + Number(e.wasteWeight), 0);

    saveSession(session);
    return session;
};

export const updateTrimmer = (entryId: string, trimmerId: string, updates: Partial<Trimmer>): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    const entry = session.entries.find(e => e.id === entryId);
    if (!entry) throw new Error('Entry not found');

    const trimmerIndex = entry.trimmers.findIndex(t => t.id === trimmerId);
    if (trimmerIndex === -1) throw new Error('Trimmer not found');

    entry.trimmers[trimmerIndex] = { ...entry.trimmers[trimmerIndex], ...updates };

    recalculateEntryFromTrimmers(entry);

    // Update session totals
    session.totalFlower = session.entries.reduce((sum, e) => sum + Number(e.flowerWeight), 0);
    session.totalShake = session.entries.reduce((sum, e) => sum + Number(e.shakeWeight), 0);
    session.totalTrim = session.entries.reduce((sum, e) => sum + Number(e.trimWeight), 0);
    session.totalWaste = session.entries.reduce((sum, e) => sum + Number(e.wasteWeight), 0);

    saveSession(session);
    return session;
};

export const removeTrimmer = (entryId: string, trimmerId: string): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    const entry = session.entries.find(e => e.id === entryId);
    if (!entry) throw new Error('Entry not found');

    entry.trimmers = entry.trimmers.filter(t => t.id !== trimmerId);

    recalculateEntryFromTrimmers(entry);

    // Update session totals
    session.totalFlower = session.entries.reduce((sum, e) => sum + Number(e.flowerWeight), 0);
    session.totalShake = session.entries.reduce((sum, e) => sum + Number(e.shakeWeight), 0);
    session.totalTrim = session.entries.reduce((sum, e) => sum + Number(e.trimWeight), 0);
    session.totalWaste = session.entries.reduce((sum, e) => sum + Number(e.wasteWeight), 0);

    saveSession(session);
    return session;
};

// Roster Management
const ROSTER_KEY = 'trim_tracker_roster';

export const getTrimmerProfiles = (): TrimmerProfile[] => {
    try {
        const data = localStorage.getItem(ROSTER_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("Error reading roster", e);
        return [];
    }
};

export const addTrimmerProfile = (name: string): TrimmerProfile[] => {
    const profiles = getTrimmerProfiles();
    const newProfile: TrimmerProfile = {
        id: crypto.randomUUID(),
        name,
        status: 'active'
    };
    profiles.push(newProfile);
    localStorage.setItem(ROSTER_KEY, JSON.stringify(profiles));
    return profiles;
};

export const deleteTrimmerProfile = (id: string): TrimmerProfile[] => {
    let profiles = getTrimmerProfiles();
    profiles = profiles.filter(p => p.id !== id);
    localStorage.setItem(ROSTER_KEY, JSON.stringify(profiles));
    return profiles;
};

export const deleteBatch = (entryId: string): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    session.entries = session.entries.filter(e => e.id !== entryId);

    // Recalculate totals
    session.totalFlower = session.entries.reduce((sum, e) => sum + Number(e.flowerWeight), 0);
    session.totalShake = session.entries.reduce((sum, e) => sum + Number(e.shakeWeight), 0);
    session.totalTrim = session.entries.reduce((sum, e) => sum + Number(e.trimWeight), 0);
    session.totalWaste = session.entries.reduce((sum, e) => sum + Number(e.wasteWeight), 0);

    saveSession(session);
    return session;
};

export const submitBatch = (entryId: string): TrimSession => {
    const session = getSession();
    if (!session) throw new Error('No active session');

    const entry = session.entries.find(e => e.id === entryId);
    if (!entry) throw new Error('Entry not found');

    entry.status = 'submitted';

    saveSession(session);
    return session;
};

export const mockApi = {
    getSession,
    createSession,
    submitSession,
    addBatch,
    updateEntryStrain,
    updateEntryWeight,
    addTrimmer,
    updateTrimmer,
    removeTrimmer,
    getTrimmerProfiles,
    addTrimmerProfile,
    deleteTrimmerProfile,
    deleteBatch,
    submitBatch
};

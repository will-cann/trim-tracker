import type { TrimSession, CreateTrimSessionDTO, Trimmer, TrimmerProfile } from '../types/definitions';
import netlifyIdentity from 'netlify-identity-widget';

const API_BASE = '/.netlify/functions';

/**
 * Helper to get the auth header for requests
 */
const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const user = netlifyIdentity.currentUser();
    if (!user) return {};
    try {
        // use any cast to avoid type issues with netlify-identity-widget types
        const token = await (user as any).jwt();
        return { 'Authorization': `Bearer ${token}` };
    } catch (error) {
        return {};
    }
};

/**
 * Generic fetch wrapper to handle auth headers
 */
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const authHeaders = await getAuthHeaders();
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers as Record<string, string>,
            ...authHeaders,
        }
    });
};

export const getSession = async (): Promise<TrimSession | null> => {
    const response = await fetchWithAuth(`${API_BASE}/get-active-session`);
    if (!response.ok) return null;
    return await response.json();
};

export const createSession = async (data: CreateTrimSessionDTO): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create session');
    return await response.json();
};

export const submitSession = async (): Promise<void> => {
    const session = await getSession();
    if (!session) throw new Error('No active session');

    const response = await fetchWithAuth(`${API_BASE}/submit-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
    });
    if (!response.ok) throw new Error('Failed to submit session');
};

export const addBatch = async (data: any): Promise<TrimSession> => {
    const session = await getSession();
    if (!session) throw new Error('No active session');

    const response = await fetchWithAuth(`${API_BASE}/add-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, sessionId: session.id }),
    });
    if (!response.ok) throw new Error('Failed to add batch');

    return await getSession() as TrimSession;
};

export const updateEntryStrain = async (entryId: string, strain: string): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/update-entry-strain`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, strain }),
    });
    if (!response.ok) throw new Error('Failed to update strain');
    return await getSession() as TrimSession;
};

export const updateEntryWeight = async (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', value: number): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/update-entry-weight`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, type, value }),
    });
    if (!response.ok) throw new Error('Failed to update weight');
    return await getSession() as TrimSession;
};

export const addTrimmer = async (entryId: string, trimmer: Omit<Trimmer, 'id'>): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/add-trimmer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, ...trimmer, startTime: trimmer.startTime }),
    });
    if (!response.ok) throw new Error('Failed to add trimmer');
    return await getSession() as TrimSession;
};

export const updateTrimmer = async (entryId: string, trimmerId: string, updates: Partial<Trimmer>): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/update-trimmer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, trimmerId, updates }),
    });
    if (!response.ok) throw new Error('Failed to update trimmer');
    return await getSession() as TrimSession;
};

export const removeTrimmer = async (entryId: string, trimmerId: string): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/remove-trimmer?entryId=${entryId}&trimmerId=${trimmerId}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to remove trimmer');
    return await getSession() as TrimSession;
};

export const getTrimmerProfiles = async (): Promise<TrimmerProfile[]> => {
    const response = await fetchWithAuth(`${API_BASE}/get-trimmer-profiles`);
    if (!response.ok) return [];
    return await response.json();
};

export const addTrimmerProfile = async (name: string): Promise<TrimmerProfile[]> => {
    const response = await fetchWithAuth(`${API_BASE}/add-trimmer-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to add profile');
    return await getTrimmerProfiles();
};

export const deleteTrimmerProfile = async (id: string): Promise<TrimmerProfile[]> => {
    const response = await fetchWithAuth(`${API_BASE}/delete-trimmer-profile?id=${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete profile');
    return await getTrimmerProfiles();
};

export const deleteBatch = async (entryId: string): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/delete-batch?id=${entryId}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete batch');
    return await getSession() as TrimSession;
};

export const submitBatch = async (entryId: string): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/update-entry-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, status: 'submitted' }),
    });
    if (!response.ok) throw new Error('Failed to submit batch');
    return await getSession() as TrimSession;
};

export const startBatch = async (entryId: string): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/update-entry-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, status: 'active' }),
    });
    if (!response.ok) throw new Error('Failed to start batch');
    return await getSession() as TrimSession;
};

export const revertBatch = async (entryId: string): Promise<TrimSession> => {
    const response = await fetchWithAuth(`${API_BASE}/update-entry-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, status: 'upcoming' }),
    });
    if (!response.ok) throw new Error('Failed to revert batch');
    return await getSession() as TrimSession;
};

export const getCompletedSessions = async (): Promise<TrimSession[]> => {
    const response = await fetchWithAuth(`${API_BASE}/get-completed-sessions`);
    if (!response.ok) return [];
    return await response.json();
};

export const apiService = {
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
    submitBatch,
    startBatch,
    revertBatch,
    getCompletedSessions,
};

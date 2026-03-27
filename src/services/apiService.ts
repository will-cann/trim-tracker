import type { TrimSession, CreateTrimSessionDTO, Trimmer, TrimmerProfile, ProposedAction, Harvest, CreateHarvestDTO, HarvestWasteType, HarvestAllocation, Strain, License, SpeechMode, HumanTask, TeamRole } from '../types/definitions';

const API_BASE = '/.netlify/functions';

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
    authToken = token;
};

const getAuthHeaders = (): Record<string, string> => {
    if (!authToken) return {};
    return { 'Authorization': `Bearer ${authToken}` };
};

/**
 * Generic fetch wrapper to handle auth headers
 */
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const authHeaders = getAuthHeaders();
    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers as Record<string, string>,
            ...authHeaders,
        }
    });
    return response;
};

export const getSession = async (): Promise<TrimSession | null> => {
    try {
        const response = await fetchWithAuth(`${API_BASE}/get-active-session`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
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

export const submitSession = async (): Promise<{ success: boolean; rolledOver: number }> => {
    const session = await getSession();
    if (!session) throw new Error('No active session');

    const response = await fetchWithAuth(`${API_BASE}/submit-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
    });
    if (!response.ok) throw new Error('Failed to submit session');
    return await response.json();
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

export const addTrimmerProfile = async (name: string, role?: TeamRole, email?: string): Promise<TrimmerProfile[]> => {
    const response = await fetchWithAuth(`${API_BASE}/add-trimmer-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, email }),
    });
    if (!response.ok) throw new Error('Failed to add profile');
    return await getTrimmerProfiles();
};

export const updateTrimmerProfile = async (profileId: string, updates: { name?: string; role?: TeamRole; email?: string; status?: string }): Promise<TrimmerProfile> => {
    const response = await fetchWithAuth(`${API_BASE}/update-trimmer-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, ...updates }),
    });
    if (!response.ok) throw new Error('Failed to update profile');
    return await response.json();
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

export const aiParse = async (request: {
    message?: string;
    csvData?: string;
    transcriptChunks?: string[];
    history?: Array<{ role: string; content: string }>;
    context: {
        hasActiveSession: boolean;
        sessionId?: string;
        trimmerProfiles: Array<{ id: string; name: string }>;
        existingEntries: Array<{ id: string; harvestName: string; strain: string; status: string }>;
        harvests?: Array<{ id: string; batchId: string; strain: string; status: string }>;
        humanTasks?: Array<{ id: string; title: string; status: string; priority: string; category: string; assignee?: string; location?: string }>;
        activeLicenseNumber?: string;
    };
}): Promise<{ actions: ProposedAction[]; message: string }> => {
    const response = await fetchWithAuth(`${API_BASE}/ai-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error('AI parsing failed');
    return await response.json();
};

export const getDeepgramToken = async (mode: SpeechMode): Promise<{ key: string }> => {
    const response = await fetchWithAuth(`${API_BASE}/deepgram-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
    });
    if (!response.ok) throw new Error('Failed to get speech token');
    return await response.json();
};

export const getCompletedSessions = async (): Promise<TrimSession[]> => {
    const response = await fetchWithAuth(`${API_BASE}/get-completed-sessions`);
    if (!response.ok) return [];
    return await response.json();
};

// ============================================================================
// HARVEST API
// ============================================================================

export const getHarvests = async (status?: string): Promise<Harvest[]> => {
    const url = status
        ? `${API_BASE}/get-harvests?status=${status}`
        : `${API_BASE}/get-harvests`;
    const response = await fetchWithAuth(url);
    if (!response.ok) return [];
    return await response.json();
};

export const createHarvest = async (data: CreateHarvestDTO): Promise<Harvest> => {
    const response = await fetchWithAuth(`${API_BASE}/create-harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to create harvest' }));
        throw new Error(err.error);
    }
    return await response.json();
};

export const updateHarvest = async (harvestId: string, updates: Record<string, any>): Promise<Harvest> => {
    const response = await fetchWithAuth(`${API_BASE}/update-harvest`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harvestId, ...updates }),
    });
    if (!response.ok) throw new Error('Failed to update harvest');
    return await response.json();
};

export const recordWetWeight = async (harvestId: string, weight: number): Promise<any> => {
    const response = await fetchWithAuth(`${API_BASE}/record-wet-weight`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harvestId, weight }),
    });
    if (!response.ok) throw new Error('Failed to record wet weight');
    return await response.json();
};

export const allocateHarvest = async (harvestId: string, allocations: Array<{ type: string; targetWeight: number }>): Promise<{ allocations: HarvestAllocation[] }> => {
    const response = await fetchWithAuth(`${API_BASE}/allocate-harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harvestId, allocations }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to allocate' }));
        throw new Error(err.error);
    }
    return await response.json();
};

export const recordHarvestWaste = async (harvestId: string, wasteType: HarvestWasteType, weight: number): Promise<any> => {
    const response = await fetchWithAuth(`${API_BASE}/record-harvest-waste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harvestId, wasteType, weight }),
    });
    if (!response.ok) throw new Error('Failed to record waste');
    return await response.json();
};

export const convertToTrim = async (allocationId: string): Promise<any> => {
    const response = await fetchWithAuth(`${API_BASE}/convert-to-trim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocationId }),
    });
    if (!response.ok) throw new Error('Failed to convert to trim');
    return await response.json();
};

export const deleteHarvest = async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${API_BASE}/delete-harvest?id=${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete harvest');
};

// ============================================================================
// LICENSES
// ============================================================================

export const getMyLicenses = async (): Promise<License[]> => {
    const response = await fetchWithAuth(`${API_BASE}/get-licenses?mine=true`);
    if (!response.ok) return [];
    return await response.json();
};

export const getAllLicenses = async (): Promise<License[]> => {
    const response = await fetchWithAuth(`${API_BASE}/get-licenses`);
    if (!response.ok) return [];
    return await response.json();
};

export const createLicense = async (licenseNumber: string, label?: string): Promise<License> => {
    const response = await fetchWithAuth(`${API_BASE}/manage-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseNumber, label }),
    });
    if (!response.ok) throw new Error('Failed to create license');
    return await response.json();
};

export const updateLicenseLabel = async (id: string, label: string): Promise<License> => {
    const response = await fetchWithAuth(`${API_BASE}/manage-license`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, label }),
    });
    if (!response.ok) throw new Error('Failed to update license');
    return await response.json();
};

export const deleteLicense = async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${API_BASE}/manage-license?id=${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete license');
};

// ============================================================================
// STRAINS
// ============================================================================

export const getStrains = async (): Promise<Strain[]> => {
    const response = await fetchWithAuth(`${API_BASE}/get-strains`);
    if (!response.ok) return [];
    return await response.json();
};

export const upsertStrain = async (name: string): Promise<Strain> => {
    const response = await fetchWithAuth(`${API_BASE}/upsert-strain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to create strain');
    return await response.json();
};

export const deleteStrain = async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${API_BASE}/delete-strain?id=${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete strain');
};

// ============================================================================
// HUMAN TASKS API
// ============================================================================

export const getTasks = async (filters?: { status?: string; category?: string; priority?: string }): Promise<HumanTask[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.priority) params.set('priority', filters.priority);
    const qs = params.toString();
    const url = `${API_BASE}/get-tasks${qs ? `?${qs}` : ''}`;

    // Retry once on failure (Neon cold starts can cause first-request timeouts)
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetchWithAuth(url);
            if (!response.ok) {
                const msg = await response.text().catch(() => response.statusText);
                throw new Error(`getTasks failed (${response.status}): ${msg}`);
            }
            return await response.json();
        } catch (err) {
            if (attempt === 0) {
                console.warn('[getTasks] First attempt failed, retrying...', err);
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
            throw err;
        }
    }
    return []; // unreachable, but satisfies TS
};

export const createTask = async (task: Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<HumanTask> => {
    const response = await fetchWithAuth(`${API_BASE}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
    });
    if (!response.ok) throw new Error('Failed to create task');
    return await response.json();
};

export const createTasks = async (tasks: Array<Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>>): Promise<HumanTask[]> => {
    const response = await fetchWithAuth(`${API_BASE}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
    });
    if (!response.ok) throw new Error('Failed to create tasks');
    const result = await response.json();
    return Array.isArray(result) ? result : [result];
};

export const updateTask = async (taskId: string, updates: Partial<HumanTask>): Promise<HumanTask> => {
    const response = await fetchWithAuth(`${API_BASE}/update-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, ...updates }),
    });
    if (!response.ok) throw new Error('Failed to update task');
    return await response.json();
};

export const deleteTask = async (taskId: string): Promise<void> => {
    const response = await fetchWithAuth(`${API_BASE}/delete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
    });
    if (!response.ok) throw new Error('Failed to delete task');
};

// ============================================================================
// PLANT MAP
// ============================================================================

export const getPlantMap = async (phase: string): Promise<Record<string, any>> => {
    try {
        const response = await fetchWithAuth(`${API_BASE}/get-plant-map?phase=${phase}`);
        if (!response.ok) return {};
        return await response.json();
    } catch {
        return {};
    }
};

export const apiService = {
    setAuthToken,
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
    updateTrimmerProfile,
    deleteTrimmerProfile,
    deleteBatch,
    submitBatch,
    startBatch,
    revertBatch,
    getCompletedSessions,
    aiParse,
    getDeepgramToken,
    // Harvest
    getHarvests,
    createHarvest,
    updateHarvest,
    recordWetWeight,
    allocateHarvest,
    recordHarvestWaste,
    convertToTrim,
    deleteHarvest,
    // Licenses
    getMyLicenses,
    getAllLicenses,
    createLicense,
    updateLicenseLabel,
    deleteLicense,
    // Strains
    getStrains,
    upsertStrain,
    deleteStrain,
    // Human Tasks
    getTasks,
    createTask,
    createTasks,
    updateTask,
    deleteTask,
    // Plant Map
    getPlantMap,
};

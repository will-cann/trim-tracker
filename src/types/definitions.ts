export interface TrimmerProfile {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface Trimmer {
  id: string;
  profileId?: string;
  name: string;
  startTime: string; // HH:mm
  endTime?: string;  // HH:mm
  tool?: string;
  flowerWeight: number;
  shakeWeight: number;
  trimWeight: number;
  wasteWeight: number;
}

export interface TrimEntry {
  id: string;
  harvestName: string;
  licenseNumber: string;
  strain: string;
  startWeight: number;
  flowerWeight: number;
  shakeWeight: number;
  trimWeight: number;
  wasteWeight: number;
  trimmers: Trimmer[];
  status: 'active' | 'submitted' | 'upcoming';
  plannedTrimDate?: string;
  plannedMethod?: 'machine' | 'scissors';
}

export interface TrimSession {
  id: string;
  startTime: string;
  endTime?: string;
  completedAt?: string;
  entries: TrimEntry[];
  totalFlower: number;
  totalShake: number;
  totalTrim: number;
  totalWaste: number;
}

export interface CreateTrimSessionDTO {
  harvestName: string;
  licenseNumber: string;
  strain: string;
  startWeight: number;
  status?: 'active' | 'upcoming';
  plannedTrimDate?: string;
  plannedMethod?: 'machine' | 'scissors';
}

export interface ProposedAction {
  type: 'create_session' | 'add_batch' | 'assign_trimmer' | 'add_trimmer_profile';
  data: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ProposedAction[];
  status?: 'pending' | 'confirmed' | 'cancelled';
}

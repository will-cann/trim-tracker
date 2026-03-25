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

// ============================================================================
// HARVEST TYPES
// ============================================================================

export type HarvestStatus = 'planning' | 'active' | 'drying' | 'ready' | 'completed';
export type AllocationType = 'flower' | 'frozen';
export type AllocationStatus = 'pending' | 'in_progress' | 'completed';
export type AllocationChoice = 'Flower' | 'Frozen' | 'Both';

export type HarvestWasteType =
  | 'powdery_mildew' | 'bud_rot' | 'insects' | 'other'  // contamination
  | 'stems' | 'leaves'                                    // biomass
  | 'plant_material' | 'fibrous' | 'root_ball';           // post-harvest/metrc

export interface HarvestAllocation {
  id: string;
  harvestId: string;
  allocationType: AllocationType;
  targetWeight: number;
  actualWeight: number;
  trimEntryId?: string;
  status: AllocationStatus;
}

export interface HarvestWasteEntry {
  id: string;
  harvestId: string;
  wasteType: HarvestWasteType;
  weight: number;
  recordedBy: string;
  createdAt: string;
}

export interface Harvest {
  id: string;
  batchId: string;
  name?: string;
  licenseNumber: string;
  strain: string;
  plantCount: number;
  totalWetWeight: number;
  totalWasteWeight: number;
  dryingLocation?: string;
  manicureLocation?: string;
  status: HarvestStatus;
  isOnHold: boolean;
  harvestStartDate?: string;
  harvestEndDate?: string;
  allocations: HarvestAllocation[];
  waste: HarvestWasteEntry[];
  createdAt: string;
}

export interface CreateHarvestDTO {
  name?: string;
  licenseNumber: string;
  strain: string;
  plantCount?: number;
  dryingLocation?: string;
  allocation: AllocationChoice;
  targetWeight?: number;       // required when allocation is 'Both'
  manicureLocation?: string;   // required when allocation is 'Both'
}

// ============================================================================
// AI / CHAT TYPES
// ============================================================================

export interface ProposedAction {
  type: 'create_session' | 'add_batch' | 'assign_trimmer' | 'add_trimmer_profile'
    | 'create_harvest' | 'record_wet_weight' | 'allocate_harvest' | 'record_harvest_waste' | 'move_harvest' | 'convert_to_trim';
  data: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ProposedAction[];
  status?: 'pending' | 'confirmed' | 'cancelled';
}

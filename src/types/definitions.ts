export type TeamRole = 'admin' | 'manager' | 'lead' | 'worker';

export interface TrimmerProfile {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  role: TeamRole;
  email?: string;
  userId?: string;
  createdAt?: string;
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
// LICENSE TYPES
// ============================================================================

export interface License {
  id: string;
  licenseNumber: string;
  label?: string;
  createdAt: string;
}

// ============================================================================
// STRAIN TYPES
// ============================================================================

export interface Strain {
  id: string;
  name: string;
  defaultFloweringDays: number | null;
  harvestCount: number;
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// AI / CHAT TYPES
// ============================================================================

export type ProposedActionType =
  | 'create_session' | 'add_batch' | 'assign_trimmer' | 'add_trimmer_profile'
  | 'create_harvest' | 'record_wet_weight' | 'allocate_harvest' | 'record_harvest_waste'
  | 'move_harvest' | 'convert_to_trim' | 'create_human_task' | 'update_human_task' | 'delete_human_task'
  | 'delete_harvest' | 'update_harvest' | 'delete_batch' | 'change_batch_status'
  | 'submit_session' | 'remove_trimmer' | 'delete_trimmer_profile'
  | 'update_trimmer' | 'update_plant_health';

export interface ProposedAction {
  type: ProposedActionType;
  data: Record<string, any>;
}

// ============================================================================
// TASK / VOICE TYPES
// ============================================================================

export type TaskStatus = 'pending' | 'edited' | 'executing' | 'completed' | 'failed' | 'skipped';
export type SpeechMode = 'ambient' | 'action';

export interface Task {
  id: string;
  action: ProposedAction;
  status: TaskStatus;
  source: SpeechMode;
  sourceText: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================================================
// HUMAN TASK TYPES
// ============================================================================

export type HumanTaskStatus = 'pending' | 'in_progress' | 'completed';
export type HumanTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type HumanTaskCategory =
  | 'drying_curing' | 'ipm' | 'compliance' | 'equipment'
  | 'environmental' | 'packaging' | 'qc_testing' | 'inventory'
  | 'transportation' | 'sanitation' | 'training' | 'trim' | 'harvest' | 'cultivation' | 'other';

export interface HumanTask {
  id: string;
  title: string;
  description?: string;
  priority: HumanTaskPriority;
  category: HumanTaskCategory;
  status: HumanTaskStatus;
  dueDate?: string;
  assignee?: string;
  location?: string;
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: string;
  isFinal: boolean;
  processed: boolean;
}

export interface ActionResultItem {
  type: string;
  label: string;
  summary: string;
  navigateTo?: 'dashboard' | 'harvests' | 'reports' | 'tasks' | 'plant-map';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ProposedAction[];
  status?: 'pending' | 'confirmed' | 'cancelled';
  results?: ActionResultItem[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

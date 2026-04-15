export type TeamRole = 'admin' | 'director' | 'department_manager' | 'technician';
export type Department = 'cultivation' | 'extraction' | 'post_harvest' | 'trim' | 'procurement' | 'lab' | 'compliance';
export type InviteStatus = 'none' | 'pending' | 'accepted';

export interface TrimmerProfile {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  role: TeamRole;
  email?: string;
  departments?: Department[];
  userId?: string;
  invitedAt?: string;
  inviteStatus: InviteStatus;
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
  wetWeight?: number;
  moistureLoss: number;
  flowerWeight: number;
  shakeWeight: number;
  trimWeight: number;
  wasteWeight: number;
  trimmers: Trimmer[];
  status: 'active' | 'submitted' | 'upcoming';
  plannedTrimDate?: string;
  plannedMethod?: 'machine' | 'scissors';
  harvestId?: string;
  binId?: string;
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
  harvestId?: string;
}

// ============================================================================
// HARVEST TYPES
// ============================================================================

export type HarvestStatus = 'planning' | 'active' | 'submitted' | 'drying' | 'ready' | 'completed'
    | 'cutting' | 'hanging' | 'bucking';
export type ContaminantFlag = 'powdery_mildew' | 'bud_rot' | 'insects' | 'other';
export type AllocationType = 'flower' | 'frozen';
export type AllocationStatus = 'pending' | 'in_progress' | 'completed';

export type HarvestPathway = 'dry' | 'frozen' | 'mixed';

export const getHarvestPathway = (allocations: { allocationType: AllocationType }[]): HarvestPathway => {
    if (allocations.length === 0) return 'dry';
    const hasFlower = allocations.some(a => a.allocationType === 'flower');
    const hasFrozen = allocations.some(a => a.allocationType === 'frozen');
    if (hasFlower && hasFrozen) return 'mixed';
    if (hasFrozen) return 'frozen';
    return 'dry';
};
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
  contaminants: ContaminantFlag[];
  dryWeight?: number;
  moistureLossPct: number;
  sourceBatchId?: string;
  harvestStartDate?: string;
  harvestEndDate?: string;
  submittedAt?: string;
  approvedAt?: string;
  allocations: HarvestAllocation[];
  waste: HarvestWasteEntry[];
  bins: HarvestBin[];
  createdAt: string;
}

export interface HarvestPlantWeight {
  id: string;
  harvestId: string;
  plantNumber: number;
  weight: number;
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
  plantIds?: string[];          // flowering plant IDs to plan for harvest
  sourceBatchId?: string;       // source plant batch ID
  plannedHarvestDate?: string;  // ISO date for planned harvest
}

// ── Bins ──────────────────────────────────────────────────────────────────────

export type BinStatus = 'curing' | 'ready' | 'in_trim' | 'completed';
export type CureAction = 'burp' | 'aerate' | 'inspect' | 'note';

export interface HarvestBin {
  id: string;
  harvestId: string;
  harvestBatchId?: string;
  binNumber: number;
  strain: string;
  licenseNumber?: string;
  weight: number | null;
  status: BinStatus;
  location?: string;
  buckedAt: string;
  readyAt?: string;
  trimEntryId?: string;
  createdAt: string;
  updatedAt?: string;
  nextActionAt?: string | null;
  lastCureAt?: string | null;
}

export interface BinCureLog {
  id: string;
  binId: string;
  action: CureAction;
  notes?: string;
  moistureReading?: number | null;
  recordedBy?: string;
  recordedByName?: string;
  nextActionAt?: string | null;
  createdAt: string;
}

export interface CreateBinDTO {
  weight?: number;
  location?: string;
  strain?: string;
  licenseNumber?: string;
}

export interface FloweringPlant {
  id: string;
  label: string;
  strainName: string;
  roomName: string;
  plantBatchId: string;
  plantBatchName: string;
  floweringDate?: string;
  targetHarvestDate?: string;
  plantHealth: number;
  contaminants: string[];
  harvestId?: string;
  harvestBatchId?: string | null;
  harvestStatus?: string | null;
}

export interface FloweringBatchGroup {
  batchId: string;
  batchName: string;
  strainName: string;
  roomId: string;
  roomName: string;
  plants: FloweringPlant[];
  targetHarvestDate?: string;
  avgHealth: number;
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

export type StretchTrait = 'low' | 'medium' | 'high';

export type Phenotype = 'sativa' | 'indica' | 'hybrid';

/**
 * Canonical terpene taxonomy for the variety planner. Nine buckets chosen
 * to roughly span what operators care about when balancing a mixed menu.
 * Strains can carry up to 3 tags (enforced app-side by upsert-strain).
 * Kept as string literal values that persist to Postgres as text[] — no
 * enum CHECK so new buckets can be added without a schema change.
 */
export const TERPENE_TAGS = [
  'gassy',
  'citrus',
  'floral',
  'sweet_dessert',
  'earthy_pine',
  'creamy',
  'fruit',
  'spicy_herbal',
  'candy',
] as const;
export type TerpeneTag = typeof TERPENE_TAGS[number];

/** Display labels for terpene tag values. */
export const TERPENE_TAG_LABELS: Record<TerpeneTag, string> = {
  gassy: 'Gassy / Diesel',
  citrus: 'Citrus',
  floral: 'Floral',
  sweet_dessert: 'Sweet / Dessert',
  earthy_pine: 'Earthy / Pine',
  creamy: 'Creamy',
  fruit: 'Fruit',
  spicy_herbal: 'Spicy / Herbal',
  candy: 'Candy',
};

export const MAX_TERPENE_TAGS = 3;

export interface Strain {
  id: string;
  name: string;
  defaultVegDays: number | null;
  defaultFloweringDays: number | null;
  stretchTrait: StretchTrait | null;
  notes: string | null;
  // Variety-planner attributes (migration 063). All nullable — legacy
  // strains work with no data and the planner degrades gracefully.
  // Cost intentionally NOT on strains — it varies by product form
  // (fresh frozen vs flower vs trim) and supplier, so it's aggregated
  // from vendor_products at query time rather than stored here.
  phenotype: Phenotype | null;
  terpeneTags: TerpeneTag[] | null;
  expectedYieldPct: number | null;
  harvestCount: number;
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// TAG TYPES
// ============================================================================

export type TagStatus = 'available' | 'assigned' | 'voided';
export type TagType = 'plant' | 'batch';
export type TagSource = 'auto' | 'upload';
export type TagOnPhase = 'nursery_to_veg' | 'veg_to_flower';

export interface Tag {
  id: string;
  tagNumber: string;
  tagType: TagType;
  status: TagStatus;
  assignedToPlantId?: string;
  assignedToBatchId?: string;
  assignedTo?: string;
  assignedAt?: string;
  createdAt: string;
}

export interface TagSettings {
  useTags: boolean;
  tagSource: TagSource;
  tagOnPhase: TagOnPhase;
  requireBatchTag: boolean;
  autoTagPrefix: string;
  autoTagCounter: number;
}

export interface TagStats {
  total: number;
  available: number;
  assigned: number;
  voided: number;
}

// ============================================================================
// PACKAGE TYPES
// ============================================================================

/**
 * @deprecated Use `ProductType.name` from the company-scoped catalog instead.
 * This type is kept as a loose hint for legacy code but `packages.package_type`
 * is now a freeform varchar validated against the `product_types` catalog at
 * the application layer (not a DB-level enum). Any string is technically
 * valid; prefer loading `getProductTypes()` and using catalog names.
 */
export type PackageType = string;

// ── Product Type Catalog (migration 046) ────────────────────────────────────

export type ProductCategory = 'biomass' | 'intermediate' | 'finished' | 'additive';

export interface ProductType {
  id: string;
  name: string;              // snake_case machine name, e.g. "live_rosin"
  displayName: string;       // human label, e.g. "Live Rosin"
  category: ProductCategory;
  defaultUnit: string;       // 'g' | 'each' | 'ml' | 'trays' | ...
  gramWeight: number | null; // grams of input material per each-unit (carts, pens). Null for bulk products.
  isCannabis: boolean;       // false for botanical terpenes, butane, etc.
  processTypes: string[];    // which extraction pathways (solventless, bho, distillate, custom). Empty = universal.
  metrcItemCategory: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PackageStatus = 'active' | 'on_hold' | 'finished' | 'archived';
export type LabTestingState = 'not_submitted' | 'submitted' | 'passed' | 'failed';
export type ExtractionType = 'ice_water' | 'rosin_press' | 'cart_fill' | 'other';
export type AdjustmentReason = 'Waste' | 'Moisture Loss' | 'Processing Loss' | 'Theft' | 'Reconciliation';

export interface PackageAdjustment {
  id: string;
  packageId: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityDelta: number;
  reason: AdjustmentReason;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ExtractionLog {
  id: string;
  sourcePackageId: string | null;
  sourceLabel: string | null;
  inputPackageType: string;
  inputQuantity: number | null;
  outputPackageId: string | null;
  outputLabel: string | null;
  outputPackageType: string;
  outputQuantity: number | null;
  strain: string;
  licenseNumber: string | null;
  extractionType: ExtractionType;
  yieldPercentage: number | null;
  wasteWeight: number;
  notes: string | null;
  createdAt: string;
}

export type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'retired';
export type ProcessType = 'solventless' | 'bho' | 'distillate' | 'custom';

export interface ExtractionEquipment {
  id: string;
  name: string;
  equipmentType: string;
  capacityGrams: number | null;
  capacityUnit: string;
  notes: string | null;
  status: EquipmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type SOPTrack = 'feeding' | 'ipm' | 'training' | 'environment' | 'milestone';
export type SOPPhase = 'nursery' | 'vegetative' | 'flowering' | 'drying';
export type SOPDomain = 'extraction' | 'cultivation' | 'processing' | 'compliance' | 'facility';

export interface ProcessStep {
  id: string;
  templateId: string;
  stepOrder: number;
  name: string;
  description: string | null;
  inputType: string | null;
  outputType: string | null;
  equipmentType: string | null;
  expectedYieldPct: number | null;
  estDurationHours: number | null;
  estHandsOnHours: number | null;
  isOptional: boolean;
  // Composable step requirements (migration 047) — schedule-driven run model.
  // Optional so existing code that constructs bare ProcessStep objects (empty
  // templates, SOP builders, test fixtures) doesn't need to fill them in;
  // the DB has NOT NULL DEFAULT false so server reads always populate them.
  requiresWeight?: boolean;
  weightUnit?: string | null; // 'g' | 'kg' | 'ml' | 'each' | 'trays' | ... only meaningful when requiresWeight=true
  requiresTimestamp?: boolean;
  // Cultivation SOP fields
  track: SOPTrack | null;
  phase: SOPPhase | null;
  phaseWeek: number | null;
  phaseDay: number | null;
  isSpan: boolean;
  spanEndWeek: number | null;
  envTargets: Record<string, any> | null;
  taskCategory: string | null;
  onCompleteAction: { type: string; data: Record<string, any> } | null;
  requiresSupplies: string[] | null;
  isCritical: boolean;
  recurrence: { everyWeeks?: number } | null;
  // Structured supply requirements (step_supply_requirements join table)
  supplyRequirements?: StepSupplyRequirement[];
}

export interface StepSupplyRequirement {
  supplyItemId: string;
  quantityPer: number;
  scalesWithOutput?: boolean; // legacy — use scalingMode instead
  scalingMode?: 'fixed' | 'per_output' | 'per_cycle';
  supplyName?: string;
  supplyUnit?: string;
}

export interface YieldAverage {
  strain: string;
  inputType: string;
  outputType: string;
  avgYieldPct: number;
  minYieldPct: number;
  maxYieldPct: number;
  sampleCount: number;
  lastRunDate: string;
}

// ── Demand-Backward Planning ────────────────────────────────────────────────

/**
 * Variety-blend target spec. When present on a PlanTargetInput, the total
 * quantity is distributed across `strainCount` strains chosen from the
 * company catalog to match the optional phenotype mix. The client-side
 * variety solver expands a variety target into N single-strain targets
 * BEFORE hitting plan-backward, so the backend engine stays unchanged.
 *
 * Balance is 'even' only for now — every chosen strain gets `quantity / N`.
 * Weighted balance (e.g. double-weight the most-in-stock strain) is a
 * follow-up.
 *
 * Future fields (documented now to pin semantics before δ.2/δ.3):
 *   - terpeneFilterAny?: TerpeneTag[]   // ANY-match: strains containing at
 *                                          least one of these tags pass
 *   - yieldMinPct?: number              // drop strains with lower historical
 *                                          expectedYieldPct
 *   - costMaxPerG?: number              // δ.2 — once get-strain-pricing lands
 */
export interface VarietySpec {
  strainCount: number;
  /**
   * Per-phenotype quotas. Sum may be <= strainCount; the remainder gets
   * filled from any matching strain. If sum > strainCount, the surplus
   * is truncated and a warning is emitted.
   */
  phenotypeMix?: {
    sativa?: number;
    indica?: number;
    hybrid?: number;
  };
  balance: 'even';
}

export interface PlanTargetInput {
  outputType: string;
  quantity: number;
  unit?: string;
  strain?: string | null;
  /**
   * When set, `strain` is ignored and the target is expanded client-side
   * into `variety.strainCount` single-strain targets before planning.
   */
  variety?: VarietySpec;
}

export interface ResolvedPlanTarget extends PlanTargetInput {
  displayName: string;
  resolvedUnit: string;
  strain: string | null;
}

export interface PlanStage {
  key: string; // `${templateId}::${strain || 'any'}`
  stepName: string;
  templateId: string;
  templateName: string;
  strain: string | null;
  inputType: string;
  inputDisplayName: string;
  inputQty: number;
  inputUnit: string;
  outputType: string;
  outputDisplayName: string;
  outputQty: number;
  outputUnit: string;
  yieldPct: number;
  yieldSource: 'historical_avg' | 'template_default' | 'assumed' | 'manual_override';
  sampleCount?: number;
  contributingTargets: number[];
}

export interface StrainYieldOverride {
  id: string;
  companyId: string;
  strain: string;
  templateId: string;
  templateName?: string;
  inputType: string;
  outputType: string;
  yieldPct: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestedSupplier {
  vendorId: string;
  name: string;
  contactEmail: string | null;
  lastContactedAt: string | null;
  isSpecificMatch: boolean;
}

export interface BiomassBucket {
  type: string;
  displayName: string;
  strain: string | null;
  quantity: number;
  unit: string;
  /** Stock already on hand, in grams. Only set on `biomassRequired` rows. */
  onHandGrams?: number;
  /** max(0, quantityGrams - onHandGrams). Only set on `biomassRequired` rows. */
  shortfallGrams?: number;
  /** Vendor suggestions for the shortfall. Only set on `biomassRequired` rows. */
  suggestedSuppliers?: SuggestedSupplier[];
}

export interface BiomassOnHandBucket {
  type: string;
  strain: string | null;
  quantity: number;
  unit: string;
  packages: { id: string; label: string; strain: string | null; quantity: number }[];
}

export interface BackwardPlan {
  targets: ResolvedPlanTarget[];
  stages: PlanStage[];
  biomassRequired: BiomassBucket[];
  biomassOnHand: BiomassOnHandBucket[];
  biomassGap: BiomassBucket[];
  suppliesNeeded: { name: string; unit: string; needed: number; onHand: number; gap: number }[];
  warnings: string[];
}

export type PlanningSessionStatus = 'draft' | 'scheduled' | 'archived';

export interface PlanningSession {
  id: string;
  companyId: string;
  name: string;
  targets: PlanTargetInput[];
  plan: BackwardPlan | null;
  status: PlanningSessionStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessTemplate {
  id: string;
  name: string;
  description: string | null;
  processType: ProcessType;
  domain: SOPDomain;
  phaseDurations: Record<string, number> | null;
  acceptedInputs: string[];
  producibleOutputs: string[];
  standardBatchSizeG: number | null;
  isPreset: boolean;
  isActive: boolean;
  steps: ProcessStep[];
  createdAt: string;
  updatedAt: string;
}

// ── Extraction Runs ─────────────────────────────────────────────────────────

export type RunStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type RunStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export interface ExtractionRunStep {
  id: string;
  runId: string;
  templateStepId: string | null;
  stepOrder: number;
  name: string;
  status: RunStepStatus;
  inputWeightG: number | null;
  outputWeightG: number | null;
  yieldPct: number | null;
  equipmentId: string | null;
  isOptional: boolean;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  description: string | null;
  // Composable step requirements (migration 047) — cached from template at run time
  requiresWeight?: boolean;
  weightUnit?: string | null;
  requiresTimestamp?: boolean;
  estDurationHours?: number | null;
  equipmentType?: string | null;
  // Runtime check-in values — written as the operator enters data
  checkInValue: number | null;
  checkInUnit: string | null;
  timestampCapturedAt: string | null;
}

export interface ExtractionRunOutput {
  id: string;
  runId: string;
  packageId: string;
  sequence: number;
  createdAt: string;
  // Optionally denormalized for UI display — populated by get-extraction-runs if joined
  packageLabel?: string;
  packageType?: string;
  quantity?: number;
  unit?: string;
}

export interface RunSourcePackage {
  packageId: string;
  label: string;
  packageType: string;
  strain: string;
  quantity: number | null;
  unit: string;
  quantityUsed: number | null;
}

export interface ExtractionRun {
  id: string;
  companyId: string;
  templateId: string | null;
  templateName?: string;
  processType?: ProcessType;
  name: string;
  strain: string | null;
  inputMaterial: string | null;
  targetProduct: string | null;
  status: RunStatus;
  sourcePackageId: string | null;
  sourcePackages: RunSourcePackage[];
  parentRunId: string | null;
  plannedStart: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sourcesConsumedAt: string | null; // migration 047 — set by completion hook, idempotency gate
  notes: string | null;
  steps: ExtractionRunStep[];
  outputs?: ExtractionRunOutput[]; // populated post-completion via extraction_run_outputs join
  createdAt: string;
  updatedAt: string;
}

export interface MetrcItem {
  id: string;
  licenseNumber: string;
  name: string;
  category: string;
  strain?: string;
  unitOfMeasure: string;
  packageType?: PackageType;
  metrcId?: number;
  metrcSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Package {
  id: string;
  harvestId?: string;
  trimEntryId?: string;
  tagId?: string;
  tagNumber?: string;
  sourcePackageId?: string;
  metrcItemId?: string;
  label: string;
  packageType: PackageType;
  itemName?: string;
  strain: string;
  licenseNumber: string;
  quantity: number;
  inputQuantity?: number;
  unit: string;
  wasteWeight: number;
  location?: string;
  notes?: string;
  status: PackageStatus;
  contaminants?: string[];
  labTestingState: LabTestingState;
  isProductionBatch: boolean;
  isTradeSample: boolean;
  isDonation: boolean;
  sourceHarvestNames?: string[];
  sourcePackageLabels?: string[];
  metrcSyncedAt?: string;
  packagedDate: string;
  finishedDate?: string;
  createdAt: string;
}

export interface CreatePackageDTO {
  harvestId?: string;
  trimEntryId?: string;
  tagId?: string;
  sourcePackageId?: string;
  metrcItemId?: string;
  label: string;
  packageType: PackageType;
  itemName?: string;
  strain: string;
  licenseNumber: string;
  quantity: number;
  inputQuantity?: number;
  wasteWeight?: number;
  location?: string;
  notes?: string;
  isProductionBatch?: boolean;
  isTradeSample?: boolean;
  isDonation?: boolean;
  sourceHarvestNames?: string[];
  sourcePackageLabels?: string[];
  packagedDate?: string;
}

// ============================================================================
// ORDERING / VENDOR TYPES
// ============================================================================

export type VendorType = 'consumables' | 'biomass' | 'both';
export type VendorChannel = 'email' | 'sms';

export interface Vendor {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  leadTimeDays: number;
  orderCadenceDays: number;
  notes: string | null;
  isActive: boolean;
  vendorType: VendorType;
  strainsGrown: string[] | null;
  lastContactedAt: string | null;
  qualityNotes: string | null;
  preferredUnits: string | null;
  licenseNumber: string | null;
  preferredChannel: VendorChannel;
  productCount: number;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
  // P4 CRM — supplier outreach cadence (Unit 9). Nullable until migration/cron populate.
  outreachCadenceDays?: number | null;
  nextReminderAt?: string | null;
}

export interface VendorProduct {
  id: string;
  vendorId: string;
  vendorName?: string;
  menuId: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  unitSize: string | null;
  caseSize: number | null;
  unitPrice: number | null;
  casePrice: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  name: string;
  posStoreId: string | null;
  address: string | null;
  vaultCapacityNotes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'draft' | 'submitted' | 'confirmed' | 'delivered' | 'cancelled';

export interface PurchaseOrderLine {
  id: string;
  storeId: string;
  storeName: string;
  vendorProductId: string;
  productName: string;
  brand: string | null;
  sku: string | null;
  category: string | null;
  unitSize?: string | null;
  caseSize?: number | null;
  autoSuggestedQty: number;
  finalQty: number;
  unitPrice: number | null;
  lineTotal: number;
  notes: string | null;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  vendorName: string;
  status: OrderStatus;
  submittedAt: string | null;
  expectedDelivery: string | null;
  deliveredAt: string | null;
  totalUnits: number;
  totalCost: number;
  notes: string | null;
  lines?: PurchaseOrderLine[];
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
  | 'update_trimmer' | 'update_trimmer_profile' | 'update_batch_weight' | 'update_plant_health'
  | 'create_planting' | 'move_plants' | 'change_plant_phase' | 'destroy_plants'
  | 'create_strain' | 'update_strain' | 'delete_strain' | 'create_license' | 'delete_license' | 'update_license'
  | 'import_tags' | 'assign_tag' | 'auto_assign_tags'
  | 'create_package' | 'update_package' | 'finish_package' | 'delete_package'
  | 'record_extraction' | 'start_extraction_run' | 'amend_extraction_run_inputs' | 'cancel_extraction_run'
  | 'find_plants_result'
  | 'create_room' | 'update_room' | 'delete_room'
  | 'record_plant_weight' | 'flag_contamination' | 'submit_harvest_batch' | 'approve_harvest_day'
  | 'create_vendor' | 'update_vendor' | 'delete_vendor'
  | 'create_store' | 'update_store'
  | 'create_order' | 'update_order'
  | 'add_vendor_product'
  | 'create_bins' | 'update_bin' | 'log_bin_cure' | 'mark_bin_ready' | 'send_bin_to_trim'
  | 'compose_supplier_email';

/**
 * Data shape for the `compose_supplier_email` proposed action.
 *
 * Emitted when the AI drafts a B2B email to a biomass/flower vendor
 * (e.g. "ask Mike if he has Blue Dream frozen"). The user sees the
 * draft in the preview card with fully editable subject and body
 * before it sends — `reason` is advisory-only (shown as muted copy).
 */
export interface ComposeSupplierEmailData {
  vendorId: string;
  vendorName: string;
  subject: string;
  bodyText: string;
  reason: string;
}

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
  assignedToUserId?: string;
  location?: string;
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Action to execute when this task is marked completed (e.g. create_planting) */
  onCompleteAction?: ProposedAction;
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
  navigateTo?: 'dashboard' | 'harvests' | 'reports' | 'tasks' | 'plant-map' | 'packages' | 'extractions' | 'ordering' | 'settings' | 'tag-list';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ProposedAction[];
  status?: 'pending' | 'confirmed' | 'cancelled';
  results?: ActionResultItem[];
}

export type ConversationKind = 'chat' | 'ambient';

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  kind?: ConversationKind; // defaults to 'chat' when absent
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  kind?: ConversationKind;
}

// ============================================================================
// REPORT BUILDER TYPES
// ============================================================================

export type ReportVisualization = 'bar' | 'line' | 'area' | 'composed' | 'pie' | 'table' | 'metric';

export interface ReportQueryColumn {
  expr: string;
  alias: string;
  agg?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export interface ReportQueryFilter {
  column: string;
  op: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'between';
  value: any;
}

export interface ReportSpec {
  title: string;
  description: string;
  visualization: ReportVisualization;
  query: {
    from: string;
    joins?: { table: string; on: [string, string] }[];
    columns: ReportQueryColumn[];
    filters?: ReportQueryFilter[];
    groupBy?: string[];
    orderBy?: { column: string; dir: 'asc' | 'desc' }[];
    limit?: number;
  };
  chart: {
    xAxis: string;
    yAxis: string[];
    colorBy?: string;
    stacked?: boolean;
  };
}

export interface SavedReport {
  id: string;
  title: string;
  description: string | null;
  spec: ReportSpec;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SAVED TASK VIEWS
// ============================================================================

export interface TaskViewSpec {
  filters: {
    status: HumanTaskStatus[] | 'all';
    category: HumanTaskCategory | 'all';
    priority: HumanTaskPriority | 'all';
    assignees: string[] | 'all';
  };
  sortField: string | null;
  sortDir: 'asc' | 'desc';
  viewMode: string;
}

export interface SavedTaskView {
  id: string;
  title: string;
  spec: TaskViewSpec;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SUPPLY INVENTORY TYPES
// ============================================================================

export type SupplyPoolSlug = 'extraction' | 'cultivation' | 'facility';
export type SupplyChangeType = 'receive' | 'consume' | 'adjust' | 'waste';

export interface SupplyPool {
  id: string;
  slug: SupplyPoolSlug;
  label: string;
  createdAt: string;
}

export interface SupplyItem {
  id: string;
  poolId: string;
  poolSlug: SupplyPoolSlug;
  poolLabel?: string;
  name: string;
  description?: string;
  category?: string;
  unit: string;
  quantityOnHand: number;
  parLevel?: number;
  reorderQty?: number;
  vendorName?: string;
  sku?: string;
  unitCost?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplyLedgerEntry {
  id: string;
  supplyItemId: string;
  itemName?: string;
  changeType: SupplyChangeType;
  quantityDelta: number;
  quantityAfter: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  performedBy?: string;
  createdAt: string;
}

// ============================================================================
// CONTACT THREADS (vendor communication — email now, SMS later)
// ============================================================================

export type ContactChannel = 'email' | 'sms';
export type ContactDirection = 'outbound' | 'inbound';

export interface ContactMessage {
  id: string;
  threadId: string;
  companyId: string;
  channel: ContactChannel;
  direction: ContactDirection;
  fromAddress: string;
  toAddress: string;
  subject?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  rawHeaders?: Record<string, unknown> | null;
  messageIdHeader?: string | null;
  inReplyToHeader?: string | null;
  providerEventId?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  parsedAs?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ContactThread {
  id: string;
  companyId: string;
  vendorId?: string | null;
  channel: ContactChannel;
  subject?: string | null;
  status: string;
  lastActivityAt: string;
  createdAt: string;
  messageCount?: number;
  lastInboundAt?: string | null;
  messages?: ContactMessage[];
}

import type { ProposedAction } from '../types/definitions';
import { apiService } from './apiService';

export interface ActionOutcome {
    executed: boolean;
    /** Short human label, e.g. "Health updated" or "Skipped — no plants found" */
    label: string;
}

const SKIPPED = (reason: string): ActionOutcome => ({ executed: false, label: `Skipped — ${reason}` });
const OK = (label: string): ActionOutcome => ({ executed: true, label });

/** Resolve plant IDs from strain + room name via the room map API */
async function resolvePlantIds(
    strain?: string,
    roomName?: string,
): Promise<{ plantIds: string[]; entityType: 'plants' | 'plantbatches' } | null> {
    if (!roomName) return null;
    for (const phase of ['vegetative', 'flowering', 'nursery'] as const) {
        const roomData = await apiService.getRoomMap(phase, roomName);
        for (const [, group] of Object.entries(roomData)) {
            const g = group as any;
            if (g.plants?.length && (!strain || g.strain?.toLowerCase().includes(strain.toLowerCase()))) {
                return {
                    plantIds: g.plants,
                    entityType: g.type === 'plantbatches' ? 'plantbatches' : 'plants',
                };
            }
        }
    }
    return null;
}

/**
 * Execute a single ProposedAction against the API.
 * Returns an outcome indicating whether the action was actually executed
 * or silently skipped due to missing data.
 */
export async function executeAction(action: ProposedAction): Promise<ActionOutcome> {
    switch (action.type) {
        case 'add_trimmer_profile':
            await apiService.addTrimmerProfile(action.data.name);
            return OK('Profile added');
        case 'create_session':
            await apiService.createSession({
                harvestName: action.data.harvestName,
                strain: action.data.strain,
                licenseNumber: action.data.licenseNumber,
                startWeight: action.data.startWeight,
                status: 'active',
            });
            return OK('Session created');
        case 'add_batch':
            await apiService.addBatch({
                harvestName: action.data.harvestName,
                strain: action.data.strain,
                licenseNumber: action.data.licenseNumber,
                startWeight: action.data.startWeight,
                status: action.data.status || 'upcoming',
            });
            return OK('Batch added');
        case 'assign_trimmer':
            if (!action.data.entryId) return SKIPPED('no batch ID');
            await apiService.addTrimmer(action.data.entryId, {
                name: action.data.name,
                profileId: action.data.profileId || undefined,
                startTime: action.data.startTime,
                tool: action.data.tool || 'scissors',
                flowerWeight: 0,
                shakeWeight: 0,
                trimWeight: 0,
                wasteWeight: 0,
            });
            return OK('Trimmer assigned');
        case 'create_harvest':
            await apiService.createHarvest({
                strain: action.data.strain,
                licenseNumber: action.data.licenseNumber || '',
                allocation: action.data.allocation || 'Flower',
                name: action.data.name,
                plantCount: action.data.plantCount,
                dryingLocation: action.data.dryingLocation,
                targetWeight: action.data.targetWeight,
            });
            return OK('Harvest created');
        case 'record_wet_weight':
            if (!action.data.harvestId) return SKIPPED('no harvest ID');
            await apiService.recordWetWeight(action.data.harvestId, action.data.weight);
            return OK('Weight recorded');
        case 'allocate_harvest':
            if (!action.data.harvestId) return SKIPPED('no harvest ID');
            await apiService.allocateHarvest(action.data.harvestId, action.data.allocations);
            return OK('Harvest allocated');
        case 'record_harvest_waste':
            if (!action.data.harvestId) return SKIPPED('no harvest ID');
            await apiService.recordHarvestWaste(action.data.harvestId, action.data.wasteType, action.data.weight);
            return OK('Waste recorded');
        case 'record_plant_weight':
            if (!action.data.harvestId || !action.data.weights) return SKIPPED('no harvest ID or weights');
            for (const w of action.data.weights) {
                await apiService.recordPlantWeight(action.data.harvestId, w.plantNumber, w.weight);
            }
            return OK(`${action.data.weights.length} weight(s) recorded`);
        case 'flag_contamination':
            if (!action.data.harvestId || !action.data.contaminants) return SKIPPED('no harvest ID');
            await apiService.updateHarvest(action.data.harvestId, { contaminants: action.data.contaminants });
            return OK('Contamination flagged');
        case 'move_harvest':
            if (!action.data.harvestId) return SKIPPED('no harvest ID');
            await apiService.updateHarvest(action.data.harvestId, { dryingLocation: action.data.dryingLocation });
            return OK('Harvest moved');
        case 'delete_harvest':
            if (!action.data.harvestId) return SKIPPED('no harvest ID');
            await apiService.deleteHarvest(action.data.harvestId);
            return OK('Harvest deleted');
        case 'update_harvest':
            if (!action.data.harvestId) return SKIPPED('no harvest ID');
            {
                const { harvestId, harvestName, ...updates } = action.data;
                await apiService.updateHarvest(harvestId, updates);
            }
            return OK('Harvest updated');
        case 'delete_batch':
            if (!action.data.entryId) return SKIPPED('no batch ID');
            await apiService.deleteBatch(action.data.entryId);
            return OK('Batch deleted');
        case 'change_batch_status':
            if (!action.data.entryId) return SKIPPED('no batch ID');
            {
                const status = action.data.newStatus;
                if (status === 'active') await apiService.startBatch(action.data.entryId);
                else if (status === 'submitted') await apiService.submitBatch(action.data.entryId);
                else if (status === 'upcoming') await apiService.revertBatch(action.data.entryId);
            }
            return OK('Status changed');
        case 'update_batch_weight':
            if (!action.data.entryId) return SKIPPED('no batch ID');
            await apiService.updateEntryWeight(action.data.entryId, action.data.weightType, action.data.value);
            return OK(`${action.data.weightType} weight → ${action.data.value}g`);
        case 'submit_session':
            await apiService.submitSession();
            return OK('Session submitted');
        case 'remove_trimmer':
            if (!action.data.entryId) return SKIPPED('no batch ID');
            {
                let trimmerId = action.data.trimmerId;
                if (!trimmerId && action.data.trimmerName) {
                    const session = await apiService.getSession();
                    const entry = session?.entries.find(e => e.id === action.data.entryId);
                    const trimmer = entry?.trimmers.find(
                        t => t.name.toLowerCase().includes(action.data.trimmerName.toLowerCase())
                    );
                    trimmerId = trimmer?.id;
                }
                if (!trimmerId) return SKIPPED('trimmer not found');
                await apiService.removeTrimmer(action.data.entryId, trimmerId);
            }
            return OK('Trimmer removed');
        case 'delete_trimmer_profile':
            return SKIPPED('Deleting team members is admin-only — use Settings');
        case 'update_trimmer_profile':
            if (!action.data.profileId) return SKIPPED('no profile ID');
            await apiService.updateTrimmerProfile(action.data.profileId, {
                name: action.data.name,
                role: action.data.role,
                email: action.data.email,
                status: action.data.status,
            });
            return OK(`Profile updated${action.data.name ? ` → ${action.data.name}` : ''}`);
        case 'update_trimmer':
            if (!action.data.entryId || !action.data.trimmerId) return SKIPPED('no batch or trimmer ID');
            await apiService.updateTrimmer(action.data.entryId, action.data.trimmerId, action.data.updates);
            return OK('Trimmer updated');
        case 'update_plant_health': {
            let plantIds = action.data.plantIds as string[];
            let entityType = action.data.entityType as 'plants' | 'plantbatches';
            if (!plantIds?.length && action.data.roomName) {
                for (const phase of ['vegetative', 'flowering', 'nursery'] as const) {
                    const roomData = await apiService.getRoomMap(phase, action.data.roomName);
                    for (const [, group] of Object.entries(roomData)) {
                        const g = group as any;
                        if (g.plants?.length && (!action.data.strain || g.strain?.toLowerCase().includes(action.data.strain.toLowerCase()))) {
                            plantIds = g.plants;
                            entityType = g.type === 'plantbatches' ? 'plantbatches' : 'plants';
                            break;
                        }
                    }
                    if (plantIds?.length) break;
                }
            }
            if (!plantIds?.length) return SKIPPED('no plants found');
            await apiService.executePlantAction({
                action: 'plant-health',
                plantIds,
                entityType,
                health: action.data.health,
                contaminants: action.data.contaminants,
                note: action.data.note,
            });
            return OK('Health updated');
        }
        case 'create_planting': {
            const strains = await apiService.getStrains();
            const rooms = await apiService.getRooms();
            const strain = strains.find(s => s.name.toLowerCase() === action.data.strainName?.toLowerCase());
            const room = rooms.find((r: any) => r.name.toLowerCase() === action.data.roomName?.toLowerCase());
            if (!strain) return SKIPPED('strain not found');
            if (!room) return SKIPPED('room not found');

            // All new plantings start as nursery batches — force batch mode
            if (action.data.plantingType === 'batch' || action.data.batchType === 'clone' || action.data.batchType === 'seed' || action.data.batchType === 'tissue_culture') {
                const batchName = action.data.batchName || `${strain.name}-${action.data.batchType || 'Clone'}-${new Date().toISOString().slice(0, 10)}`;
                await apiService.createPlanting({
                    type: 'batch',
                    name: batchName,
                    batchType: action.data.batchType || 'clone',
                    strainId: strain.id,
                    strainName: strain.name,
                    roomId: (room as any).id,
                    untrackedCount: action.data.count,
                });
            } else {
                const prefix = action.data.labelPrefix || strain.name.replace(/\s+/g, '').slice(0, 6).toUpperCase() + '-V';
                const plants = Array.from({ length: action.data.count }, (_, i) => ({
                    label: `${prefix}-${String(i + 1).padStart(3, '0')}`,
                    strainId: strain.id,
                    strainName: strain.name,
                    roomId: (room as any).id,
                }));
                await apiService.createPlanting({
                    type: 'plant',
                    plants,
                    growthPhase: action.data.growthPhase || 'vegetative',
                });
            }
            return OK('Planting created');
        }
        case 'move_plants': {
            let plantIds = action.data.plantIds as string[];
            let entityType = action.data.entityType as 'plants' | 'plantbatches';
            if (!plantIds?.length && (action.data.strain || action.data.sourceRoomName)) {
                const resolved = await resolvePlantIds(action.data.strain, action.data.sourceRoomName);
                if (resolved) { plantIds = resolved.plantIds; entityType = resolved.entityType; }
            }
            const allRooms = await apiService.getRooms();
            const targetRoom = allRooms.find((r: any) => r.name.toLowerCase() === action.data.targetRoomName?.toLowerCase());
            if (!plantIds?.length) return SKIPPED('no plants found');
            if (!targetRoom) return SKIPPED('target room not found');
            await apiService.executePlantAction({
                action: 'change-room',
                plantIds,
                entityType,
                targetRoomId: (targetRoom as any).id,
            });
            return OK('Plants moved');
        }
        case 'change_plant_phase': {
            let plantIds = action.data.plantIds as string[];
            const entityType = 'plants' as const;
            if (!plantIds?.length && (action.data.strain || action.data.sourceRoomName)) {
                const resolved = await resolvePlantIds(action.data.strain, action.data.sourceRoomName);
                if (resolved) { plantIds = resolved.plantIds; }
            }
            if (!plantIds?.length) return SKIPPED('no plants found');
            let targetRoomId: string | undefined;
            if (action.data.targetRoomName) {
                const allRooms = await apiService.getRooms();
                const targetRoom = allRooms.find((r: any) => r.name.toLowerCase() === action.data.targetRoomName?.toLowerCase());
                if (targetRoom) targetRoomId = (targetRoom as any).id;
            }
            await apiService.executePlantAction({
                action: 'change-phase',
                plantIds,
                entityType,
                targetPhase: action.data.targetPhase,
                targetRoomId,
            });
            return OK('Phase changed');
        }
        case 'destroy_plants': {
            let plantIds = action.data.plantIds as string[];
            let entityType = action.data.entityType as 'plants' | 'plantbatches';
            if (!plantIds?.length && (action.data.strain || action.data.roomName)) {
                const resolved = await resolvePlantIds(action.data.strain, action.data.roomName);
                if (resolved) { plantIds = resolved.plantIds; entityType = resolved.entityType; }
            }
            if (!plantIds?.length) return SKIPPED('no plants found');
            await apiService.executePlantAction({
                action: 'destroy',
                plantIds,
                entityType,
            });
            return OK('Plants destroyed');
        }
        case 'convert_to_trim':
            if (!action.data.allocationId) return SKIPPED('no allocation ID');
            await apiService.convertToTrim(action.data.allocationId);
            return OK('Converted to trim');

        // ── Bins ──────────────────────────────────────────────────────────
        case 'create_bins': {
            if (!action.data.harvestId) return SKIPPED('no harvest ID');
            const bins = action.data.bins || [{ weight: action.data.weight, location: action.data.location }];
            const result = await apiService.createBins(action.data.harvestId, bins);
            return OK(`Created ${result.bins.length} bin(s)`);
        }
        case 'update_bin':
            if (!action.data.binId) return SKIPPED('no bin ID');
            await apiService.updateBin(action.data.binId, action.data);
            return OK('Bin updated');
        case 'log_bin_cure':
            if (!action.data.binId) return SKIPPED('no bin ID');
            await apiService.logBinCure(action.data.binId, {
                action: action.data.action || 'burp',
                notes: action.data.notes,
                moistureReading: action.data.moistureReading,
                nextActionAt: action.data.nextActionAt,
            });
            return OK('Cure action logged');
        case 'mark_bin_ready':
            if (!action.data.binId) return SKIPPED('no bin ID');
            await apiService.updateBin(action.data.binId, { status: 'ready' });
            return OK('Bin marked ready for trim');
        case 'send_bin_to_trim':
            if (!action.data.binId) return SKIPPED('no bin ID');
            await apiService.binToTrim(action.data.binId);
            return OK('Bin sent to trim');

        case 'create_strain': {
            const { name, ...opts } = action.data;
            if (!name) return SKIPPED('missing strain name');
            await apiService.upsertStrain(name, opts);
            return OK('Strain created');
        }
        case 'update_strain': {
            const { strainName, ...opts } = action.data;
            if (!strainName) return SKIPPED('missing strain name');
            // upsert is name-keyed server-side (ON CONFLICT on LOWER(name)),
            // so the same endpoint updates an existing row in place.
            await apiService.upsertStrain(strainName, opts);
            return OK('Strain updated');
        }
        case 'delete_strain': {
            let strainId = action.data.strainId;
            if (!strainId && action.data.strainName) {
                const allStrains = await apiService.getStrains();
                const match = allStrains.find(s => s.name.toLowerCase() === action.data.strainName.toLowerCase());
                strainId = match?.id;
            }
            if (!strainId) return SKIPPED('strain not found');
            await apiService.deleteStrain(strainId);
            return OK('Strain deleted');
        }
        case 'create_license':
            await apiService.createLicense(action.data.licenseNumber, action.data.label);
            return OK('License created');
        case 'delete_license':
            return SKIPPED('Deleting licenses is admin-only — use Settings');
        case 'update_license': {
            if (!action.data.licenseNumber) return SKIPPED('no license number');
            const allLicenses = await apiService.getAllLicenses();
            const matchLic = allLicenses.find(l => l.licenseNumber === action.data.licenseNumber);
            if (!matchLic) return SKIPPED('license not found');
            await apiService.updateLicenseLabel(matchLic.id, action.data.label);
            return OK(`License label → "${action.data.label}"`);
        }
        case 'import_tags':
            await apiService.importTags(action.data.tagNumbers, action.data.tagType || 'plant');
            return OK('Tags imported');
        case 'assign_tag': {
            const allTags = await apiService.getTags({ status: 'available' });
            const tag = allTags.find(t => t.tagNumber === action.data.tagNumber);
            if (!tag) return SKIPPED('tag not found');

            // Package target path
            if (action.data.packageLabel) {
                const pkgs = await apiService.getPackages();
                const pkg = pkgs.find(p => p.label?.toLowerCase() === action.data.packageLabel.toLowerCase());
                if (!pkg) return SKIPPED('package not found');
                await apiService.assignTag(tag.id, undefined, undefined, pkg.id);
                return OK('Tag assigned to package');
            }

            // Plant/batch target path
            if (!action.data.plantIdentifier) return SKIPPED('no target identifier');
            const resolved = await resolvePlantIds(action.data.plantIdentifier, action.data.roomName);
            if (!resolved || resolved.plantIds.length === 0) return SKIPPED('no plants found');
            if (resolved.entityType === 'plants') {
                await apiService.assignTag(tag.id, resolved.plantIds[0]);
            } else {
                await apiService.assignTag(tag.id, undefined, resolved.plantIds[0]);
            }
            return OK('Tag assigned');
        }
        case 'auto_assign_tags': {
            const resolved = await resolvePlantIds(action.data.strain, action.data.roomName);
            if (!resolved) return SKIPPED('no plants found');
            const availTags = await apiService.getTags({ status: 'available', type: resolved.entityType === 'plants' ? 'plant' : 'batch' });
            if (!availTags.length) return SKIPPED('no available tags');
            const count = action.data.count || resolved.plantIds.length;
            const assigned = Math.min(count, availTags.length, resolved.plantIds.length);
            for (let i = 0; i < assigned; i++) {
                if (resolved.entityType === 'plants') {
                    await apiService.assignTag(availTags[i].id, resolved.plantIds[i]);
                } else {
                    await apiService.assignTag(availTags[i].id, undefined, resolved.plantIds[i]);
                }
            }
            return OK(`${assigned} tag(s) assigned`);
        }
        case 'create_package':
            await apiService.createPackage(action.data as any);
            return OK('Package created');
        case 'update_package':
            if (!action.data.packageId) return SKIPPED('no package ID');
            {
                const { packageId, ...updates } = action.data;
                await apiService.updatePackage(packageId, updates);
            }
            return OK('Package updated');
        case 'finish_package':
            if (!action.data.packageId) return SKIPPED('no package ID');
            await apiService.updatePackage(action.data.packageId, { status: 'finished' } as any);
            return OK('Package finished');
        case 'delete_package':
            if (!action.data.packageId) return SKIPPED('no package ID');
            await apiService.deletePackage(action.data.packageId);
            return OK('Package deleted');
        case 'record_extraction': {
            const d = action.data;
            if (!d.inputPackageType || !d.outputPackageType || !d.strain) return SKIPPED('missing extraction data');
            // outputQuantity is intentionally optional: "I pulled 17K blackberry for a wash" starts
            // the run and records input consumption; the yield is reported later. The backend
            // record-extraction.ts handles null outputQuantity by skipping output package creation.
            await apiService.recordExtraction({
                sourcePackageId: d.sourcePackageId,
                inputPackageType: d.inputPackageType,
                inputQuantity: d.inputQuantity,
                outputPackageType: d.outputPackageType,
                outputQuantity: d.outputQuantity,
                outputLabel: d.outputLabel,
                strain: d.strain,
                licenseNumber: d.licenseNumber,
                wasteWeight: d.wasteWeight,
                notes: d.notes,
            });
            const parts = [d.inputQuantity ? `${d.inputQuantity}g` : '', d.inputPackageType?.replace('_', ' ')];
            if (d.outputQuantity) {
                parts.push('→', `${d.outputQuantity}g`, d.outputPackageType?.replace('_', ' '));
                return OK(`Extraction: ${parts.filter(Boolean).join(' ')}`);
            }
            parts.push('→', `${d.outputPackageType?.replace('_', ' ')} (pending)`);
            return OK(`Started: ${parts.filter(Boolean).join(' ')}`);
        }
        case 'start_extraction_run': {
            const d = action.data;
            if (!d.templateId) return SKIPPED(`template not found: "${d.templateName || 'unknown'}"`);
            if (d.inputMismatch) return SKIPPED(d.inputMismatch);
            if (!d.runName) return SKIPPED('missing run name');
            await apiService.createExtractionRun({
                templateId: d.templateId,
                name: d.runName,
                strain: d.strain || undefined,
                inputMaterial: d.inputMaterial || undefined,
                targetProduct: d.targetProduct || undefined,
                sourcePackageIds: d.sourcePackageIds?.length ? d.sourcePackageIds : undefined,
                sourcePackageQuantities: Object.keys(d.sourcePackageQuantities || {}).length ? d.sourcePackageQuantities : undefined,
                plannedStart: d.plannedStart || undefined,
                notes: d.notes || undefined,
                status: d.status === 'active' ? 'active' : 'planned',
            });
            const statusLabel = d.status === 'active' ? 'Started' : 'Scheduled';
            // Multi-input-aware summary: prefer the inputs[] array, fall back to legacy fields
            const inputsArray: Array<{ packageType?: string | null; quantity?: number | null; unit?: string | null }> = Array.isArray(d.inputs) ? d.inputs : [];
            let inputSummary = '';
            if (inputsArray.length > 0) {
                inputSummary = inputsArray
                    .map(i => {
                        const typ = (i.packageType || '').replace(/_/g, ' ');
                        if (i.quantity) return `${i.quantity}${i.unit || 'g'} ${typ}`.trim();
                        return typ;
                    })
                    .filter(Boolean)
                    .join(' + ');
            } else if (d.inputQuantityG) {
                inputSummary = `${d.inputQuantityG}g ${(d.inputMaterial || '').replace(/_/g, ' ')}`.trim();
            }
            const bits = [d.strain, d.templateName, inputSummary].filter(Boolean);
            return OK(`${statusLabel}: ${bits.join(' · ')}`);
        }
        case 'amend_extraction_run_inputs': {
            // New internal action emitted by the unified extraction_run tool
            // (action=amend_inputs). Adds materials to an existing run's
            // input list without creating a duplicate run. See
            // netlify/functions/amend-extraction-run-inputs.ts for the
            // upsert semantics.
            const d = action.data;
            if (!d.runId) return SKIPPED('no run ID');
            const addedIds = (d.addedSourcePackageIds as string[] | undefined) || [];
            if (addedIds.length === 0) return SKIPPED('no inputs to add');
            await apiService.amendExtractionRunInputs({
                runId: d.runId,
                addedSourcePackageIds: addedIds,
                addedSourcePackageQuantities: d.addedSourcePackageQuantities || {},
            });
            const inputsArray = Array.isArray(d.addedInputs) ? d.addedInputs : [];
            const summary = inputsArray
                .map((i: { packageType?: string | null; strain?: string | null; quantity?: number | null; unit?: string | null }) => {
                    const typ = (i.packageType || '').replace(/_/g, ' ');
                    const strainLabel = i.strain ? ` ${i.strain}` : '';
                    if (i.quantity) return `${i.quantity}${i.unit || 'g'}${strainLabel} ${typ}`.trim();
                    return `${strainLabel} ${typ}`.trim();
                })
                .filter(Boolean)
                .join(' + ');
            return OK(`Amended "${d.runName || 'run'}": +${summary || `${addedIds.length} input(s)`}`);
        }
        case 'cancel_extraction_run': {
            // New internal action emitted by the unified extraction_run tool
            // (action=cancel). Marks a planned or active run as cancelled.
            const d = action.data;
            if (!d.runId) return SKIPPED('no run ID');
            await apiService.updateExtractionRun(d.runId, { status: 'cancelled' });
            return OK(`Cancelled run "${d.runName || d.runId}"`);
        }
        case 'find_plants_result': {
            // Stub action emitted by the find_plants tool in PR #1. The
            // frontend doesn't execute anything — it just surfaces the
            // lookup result as a side note on the chat. In PR #2 (multi-turn
            // agent loop), find_plants becomes a true tool_result the AI
            // reasons about before taking further action in the same turn.
            const d = action.data as { totalMatches?: number; plants?: unknown[]; batches?: unknown[] };
            const total = d.totalMatches ?? ((d.plants?.length || 0) + (d.batches?.length || 0));
            return OK(`Looked up plants — ${total} match${total === 1 ? '' : 'es'}`);
        }
        case 'create_room':
            await apiService.createRoom({
                name: action.data.name,
                roomType: action.data.roomType,
                capacity: action.data.capacity,
                squareFootage: action.data.squareFootage,
                notes: action.data.notes,
            });
            return OK('Room created');
        case 'update_room': {
            const allRooms = await apiService.getRooms();
            const room = allRooms.find(r => r.name.toLowerCase() === action.data.roomName?.toLowerCase());
            if (!room) return SKIPPED('room not found');
            const { roomName: _rn, ...updates } = action.data;
            await apiService.updateRoom(room.id, updates);
            return OK('Room updated');
        }
        case 'delete_room': {
            const allRooms = await apiService.getRooms();
            const room = allRooms.find(r => r.name.toLowerCase() === action.data.roomName?.toLowerCase());
            if (!room) return SKIPPED('room not found');
            await apiService.deleteRoom(room.id);
            return OK('Room deleted');
        }
        case 'create_vendor':
            if (!action.data.name) return SKIPPED('no vendor name');
            await apiService.createVendor(action.data as any);
            return OK(`Vendor "${action.data.name}" created`);
        case 'update_vendor':
            if (!action.data.vendorId) return SKIPPED('no vendor ID');
            await apiService.updateVendor(action.data.vendorId, action.data);
            return OK('Vendor updated');
        case 'delete_vendor':
            if (!action.data.vendorId) return SKIPPED('no vendor ID');
            await apiService.deleteVendor(action.data.vendorId);
            return OK('Vendor deleted');
        case 'create_store':
            if (!action.data.name) return SKIPPED('no store name');
            await apiService.saveStore(action.data as any);
            return OK(`Store "${action.data.name}" created`);
        case 'update_store':
            if (!action.data.storeId) return SKIPPED('no store ID');
            await apiService.saveStore(action.data as any);
            return OK('Store updated');
        case 'add_vendor_product':
            if (!action.data.vendorId || !action.data.name) return SKIPPED('missing vendor or product name');
            await apiService.upsertVendorProduct(action.data as any);
            return OK(`Product "${action.data.name}" added`);
        case 'create_order':
            if (!action.data.vendorId) return SKIPPED('no vendor ID');
            await apiService.saveOrder(action.data as any);
            return OK('Order created');
        case 'update_order':
            if (!action.data.orderId) return SKIPPED('no order ID');
            await apiService.saveOrder(action.data as any);
            return OK('Order updated');
        case 'compose_supplier_email': {
            if (!action.data.vendorId) return SKIPPED('no vendor ID');
            if (!action.data.subject || !action.data.bodyText) return SKIPPED('missing subject or body');
            await apiService.sendSupplierEmail({
                vendorId: action.data.vendorId,
                subject: action.data.subject,
                bodyText: action.data.bodyText,
            });
            return OK(`Email sent to ${action.data.vendorName || 'supplier'}`);
        }
        case 'create_human_task':
            // Human tasks are handled separately via useHumanTasks hook
            return SKIPPED('handled separately');
        case 'update_human_task':
            // Handled separately via useAIChat confirmActions
            return SKIPPED('handled separately');
        case 'delete_human_task':
            // Handled separately via useAIChat confirmActions
            return SKIPPED('handled separately');
        default:
            return SKIPPED('unknown action type');
    }
}

export interface ExecutionResult {
    succeeded: number;
    skipped: number;
    failed: Array<{ action: ProposedAction; error: string }>;
    outcomes: Array<{ action: ProposedAction; outcome: ActionOutcome }>;
}

/**
 * Execute multiple actions sequentially, collecting results.
 */
export async function executeActions(actions: ProposedAction[]): Promise<ExecutionResult> {
    const result: ExecutionResult = { succeeded: 0, skipped: 0, failed: [], outcomes: [] };

    for (const action of actions) {
        try {
            const outcome = await executeAction(action);
            result.outcomes.push({ action, outcome });
            if (outcome.executed) {
                result.succeeded++;
            } else {
                result.skipped++;
            }
        } catch (error) {
            result.failed.push({
                action,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return result;
}

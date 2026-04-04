import type { Resource, ResourceBlock } from '../ui/ResourceTimeline';

// ── Constants ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const DEFAULT_NURSERY_DAYS = 14;
const DEFAULT_VEG_DAYS = 28;
const DEFAULT_FLOWER_WEEKS = 9;
const PHASE_COLORS: Record<string, string> = {
    nursery: '#1C9EFF',
    vegetative: '#3BB570',
    flowering: '#FA9E52',
    harvested: '#959595',
};

// Strain-color rotation for distinguishing batches in the same room
const STRAIN_COLORS = [
    '#3BB570', '#1C9EFF', '#FA9E52', '#DF5B59',
    '#8B5CF6', '#0EA5E9', '#F59E0B',
];

function strainColor(strain: string): string {
    let hash = 0;
    for (let i = 0; i < strain.length; i++) {
        hash = ((hash << 5) - hash + strain.charCodeAt(i)) | 0;
    }
    return STRAIN_COLORS[Math.abs(hash) % STRAIN_COLORS.length];
}

// ── Plant list item shape (from getPlantsList) ──────────────────────────────

export interface PlantListItem {
    id: string;
    label: string;
    strainName: string;
    growthPhase: string;
    roomName: string | null;
    plantHealth: number;
    plantedDate: string | null;
    vegetativeDate: string | null;
    floweringDate: string | null;
    targetHarvestDate: string | null;
    batchCount: number | null; // non-null for nursery batches
}

// ── Room shape (from getRooms) ──────────────────────────────────────────────

interface RoomInput {
    id: string;
    name: string;
    room_type?: string;
    roomType?: string;
}

// ── Main adapter ────────────────────────────────────────────────────────────

export function buildCultivationSchedule(
    plants: PlantListItem[],
    rooms: RoomInput[],
): { resources: Resource[]; blocks: ResourceBlock[] } {

    // Only cultivation rooms (exclude dry, storage, processing, trim)
    const CULTIVATION_TYPES = new Set(['nursery', 'veg', 'vegetative', 'flower', 'flowering', 'general', '']);
    const resources: Resource[] = rooms
        .filter(r => CULTIVATION_TYPES.has((r.room_type || r.roomType || '').toLowerCase()))
        .map(r => ({
            id: r.id,
            name: r.name,
            group: formatRoomType(r.room_type || r.roomType || 'other'),
        }));

    // Track rooms we've seen from plant data but aren't in the rooms list
    const roomIdSet = new Set(rooms.map(r => r.id));
    const roomNameToId = new Map<string, string>();
    for (const r of rooms) roomNameToId.set(r.name, r.id);

    // Group plants by room + strain + phase → one block per group
    const groupKey = (p: PlantListItem) =>
        `${p.roomName || 'unassigned'}::${p.strainName}::${p.growthPhase}`;

    const groups = new Map<string, {
        roomName: string;
        roomId: string | null;
        strainName: string;
        phase: string;
        plants: PlantListItem[];
        earliestDate: string | null;
    }>();

    for (const p of plants) {
        const key = groupKey(p);
        if (!groups.has(key)) {
            groups.set(key, {
                roomName: p.roomName || 'Unassigned',
                roomId: p.roomName ? (roomNameToId.get(p.roomName) || null) : null,
                strainName: p.strainName,
                phase: p.growthPhase,
                plants: [],
                earliestDate: null,
            });
        }
        const g = groups.get(key)!;
        g.plants.push(p);
    }

    const blocks: ResourceBlock[] = [];
    const now = new Date();

    for (const [, group] of groups) {
        // Need a room to place on the timeline
        let resourceId = group.roomId;
        if (!resourceId) {
            // Create a synthetic resource for unassigned plants
            const synthId = `room-${group.roomName}`;
            if (!roomIdSet.has(synthId)) {
                roomIdSet.add(synthId);
                resources.push({ id: synthId, name: group.roomName, group: 'Unassigned' });
            }
            resourceId = synthId;
        }

        // Determine block start and end based on phase
        const { blockStart, blockEnd, isProjected } = computeBlockDates(group.plants, group.phase);
        if (!blockStart) continue; // can't place without a date

        // Status from dates
        let status: ResourceBlock['status'];
        if (now < blockStart) status = 'planned';
        else if (blockEnd && now > blockEnd) status = 'completed';
        else status = 'active';

        // Count
        const count = group.plants.reduce((sum, p) => sum + (p.batchCount || 1), 0);
        const countLabel = count === 1 ? '1 plant' : `${count} plants`;

        // Week progress for flowering
        let sublabel = `${capitalize(group.phase)} · ${countLabel}`;
        if (group.phase === 'flowering' && blockEnd && status === 'active') {
            const weeksIn = Math.max(1, Math.ceil((now.getTime() - blockStart.getTime()) / MS_PER_DAY / 7));
            const totalWeeks = Math.max(1, Math.ceil((blockEnd.getTime() - blockStart.getTime()) / MS_PER_DAY / 7));
            sublabel = `Flower week ${weeksIn}/${totalWeeks} · ${countLabel}`;
        }
        if (isProjected) sublabel += ' (est.)';

        blocks.push({
            id: `cult-${resourceId}-${group.strainName}-${group.phase}`,
            resourceId,
            blockStart,
            blockEnd: blockEnd || new Date(blockStart.getTime() + 7 * MS_PER_DAY), // min 1 week visible
            label: group.strainName,
            sublabel,
            status,
            color: group.phase === 'flowering'
                ? strainColor(group.strainName)
                : PHASE_COLORS[group.phase] || '#959595',
            isProjected,
            linkTo: { view: 'plant-map', id: resourceId },
        });
    }

    return { resources, blocks };
}

// ── Date computation per phase ──────────────────────────────────────────────

function computeBlockDates(
    plants: PlantListItem[],
    phase: string,
): { blockStart: Date | null; blockEnd: Date | null; isProjected: boolean } {
    if (phase === 'nursery') {
        // Start: planted date, End: veg date if known, otherwise projected
        const dates = plants.map(p => p.plantedDate).filter((d): d is string => d != null).sort();
        if (dates.length === 0) return { blockStart: null, blockEnd: null, isProjected: false };
        const start = new Date(dates[0]);

        // Use actual veg date as nursery end when available
        const vegDates = plants
            .map(p => p.vegetativeDate)
            .filter((d): d is string => d != null)
            .sort();
        if (vegDates.length > 0) {
            return { blockStart: start, blockEnd: new Date(vegDates[vegDates.length - 1]), isProjected: false };
        }

        const end = new Date(start.getTime() + DEFAULT_NURSERY_DAYS * MS_PER_DAY);
        return { blockStart: start, blockEnd: end, isProjected: true };
    }

    if (phase === 'vegetative') {
        // Start: veg date (or planted date), End: flip date if known, otherwise projected
        const dates = plants
            .map(p => p.vegetativeDate || p.plantedDate)
            .filter((d): d is string => d != null)
            .sort();
        if (dates.length === 0) return { blockStart: null, blockEnd: null, isProjected: false };
        const start = new Date(dates[0]);

        // Use actual flip date as veg end when available
        const flipDates = plants
            .map(p => p.floweringDate)
            .filter((d): d is string => d != null)
            .sort();
        if (flipDates.length > 0) {
            return { blockStart: start, blockEnd: new Date(flipDates[flipDates.length - 1]), isProjected: false };
        }

        const end = new Date(start.getTime() + DEFAULT_VEG_DAYS * MS_PER_DAY);
        return { blockStart: start, blockEnd: end, isProjected: true };
    }

    if (phase === 'flowering') {
        const flipDates = plants
            .map(p => p.floweringDate)
            .filter((d): d is string => d != null)
            .sort();
        if (flipDates.length === 0) return { blockStart: null, blockEnd: null, isProjected: false };
        const start = new Date(flipDates[0]);

        // Prefer explicit harvest date
        const harvestDates = plants
            .map(p => p.targetHarvestDate)
            .filter((d): d is string => d != null)
            .sort();
        if (harvestDates.length > 0) {
            // Use latest harvest date (some plants in the group may differ)
            return { blockStart: start, blockEnd: new Date(harvestDates[harvestDates.length - 1]), isProjected: false };
        }

        // Project from flower cycle
        const end = new Date(start.getTime() + DEFAULT_FLOWER_WEEKS * 7 * MS_PER_DAY);
        return { blockStart: start, blockEnd: end, isProjected: true };
    }

    // Harvested — show from flowering date to target harvest date or a 1-week block
    if (phase === 'harvested') {
        const flipDates = plants.map(p => p.floweringDate).filter((d): d is string => d != null).sort();
        const harvestDates = plants.map(p => p.targetHarvestDate).filter((d): d is string => d != null).sort();
        const start = flipDates[0] ? new Date(flipDates[0]) : harvestDates[0] ? new Date(harvestDates[0]) : null;
        if (!start) return { blockStart: null, blockEnd: null, isProjected: false };
        const end = harvestDates.length > 0
            ? new Date(harvestDates[harvestDates.length - 1])
            : new Date(start.getTime() + 7 * MS_PER_DAY);
        return { blockStart: start, blockEnd: end, isProjected: false };
    }

    return { blockStart: null, blockEnd: null, isProjected: false };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRoomType(type: string): string {
    const labels: Record<string, string> = {
        flower: 'Flower Rooms',
        flowering: 'Flower Rooms',
        veg: 'Veg Rooms',
        vegetative: 'Veg Rooms',
        nursery: 'Nursery',
        dry: 'Dry Rooms',
        drying: 'Dry Rooms',
        trim: 'Trim Rooms',
        processing: 'Processing',
        storage: 'Storage',
        other: 'Other Rooms',
    };
    return labels[type.toLowerCase()] || 'Rooms';
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

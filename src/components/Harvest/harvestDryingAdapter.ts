import type { Harvest } from '../../types/definitions';
import type { Resource, ResourceBlock } from '../ui/ResourceTimeline';

const MS_PER_DAY = 86_400_000;
const DEFAULT_DRY_DAYS = 14;

export function buildDryingSchedule(
    harvests: Harvest[],
    rooms: Array<{ id: string; name: string; room_type?: string }>,
): { resources: Resource[]; blocks: ResourceBlock[] } {
    const roomNameToId = new Map<string, string>();
    for (const r of rooms) roomNameToId.set(r.name, r.id);
    const roomIdSet = new Set(rooms.map(r => r.id));

    // Start with dry rooms from the rooms list
    const resources: Resource[] = rooms
        .filter(r => {
            const type = (r.room_type || '').toLowerCase();
            return type === 'dry' || type === 'drying';
        })
        .map(r => ({
            id: r.id,
            name: r.name,
            group: 'Dry Rooms',
        }));

    // Harvests that have entered drying
    const dryingHarvests = harvests.filter(h =>
        h.status === 'drying' || h.status === 'ready' || h.status === 'completed'
    );

    const blocks: ResourceBlock[] = [];
    const now = new Date();

    for (const h of dryingHarvests) {
        // Start: when cutting ended → submitted → harvest started → created
        const startStr = h.harvestEndDate || h.submittedAt || h.harvestStartDate || h.createdAt;
        if (!startStr) continue;
        const blockStart = new Date(startStr);

        // Resolve resource
        let resourceId: string | null = null;
        if (h.dryingLocation) {
            resourceId = roomNameToId.get(h.dryingLocation) || null;
            if (!resourceId) {
                const synthId = `dry-${h.dryingLocation}`;
                if (!roomIdSet.has(synthId)) {
                    roomIdSet.add(synthId);
                    resources.push({ id: synthId, name: h.dryingLocation, group: 'Dry Rooms' });
                }
                resourceId = synthId;
            }
        } else {
            const synthId = 'dry-unassigned';
            if (!roomIdSet.has(synthId)) {
                roomIdSet.add(synthId);
                resources.push({ id: synthId, name: 'Drying (unassigned)', group: 'Dry Rooms' });
            }
            resourceId = synthId;
        }

        // End date + status
        let blockEnd: Date;
        let isProjected = false;
        let status: ResourceBlock['status'];

        if (h.status === 'completed' || h.status === 'ready') {
            blockEnd = h.approvedAt
                ? new Date(h.approvedAt)
                : new Date(blockStart.getTime() + DEFAULT_DRY_DAYS * MS_PER_DAY);
            status = 'completed';
        } else {
            blockEnd = new Date(blockStart.getTime() + DEFAULT_DRY_DAYS * MS_PER_DAY);
            isProjected = blockEnd > now;
            status = 'active';
        }

        // Days in
        const daysIn = Math.max(1, Math.ceil((now.getTime() - blockStart.getTime()) / MS_PER_DAY));
        const totalDays = Math.max(1, Math.ceil((blockEnd.getTime() - blockStart.getTime()) / MS_PER_DAY));

        const weightLabel = h.totalWetWeight > 0
            ? `${h.totalWetWeight >= 1000 ? `${(h.totalWetWeight / 1000).toFixed(1)}kg` : `${h.totalWetWeight}g`} wet`
            : '';

        const sublabelParts: string[] = [];
        if (status === 'active') sublabelParts.push(`Day ${daysIn} of ~${totalDays}`);
        if (weightLabel) sublabelParts.push(weightLabel);
        if (h.moistureLossPct > 0 && h.status === 'completed') sublabelParts.push(`${h.moistureLossPct}% loss`);
        if (isProjected) sublabelParts.push('est.');

        blocks.push({
            id: `dry-${h.id}`,
            resourceId,
            blockStart,
            blockEnd,
            label: `${h.strain} — ${h.name || h.batchId}`,
            sublabel: sublabelParts.join(' · '),
            status,
            color: '#DF5B59',
            isProjected,
            linkTo: { view: 'harvests', id: h.id },
        });
    }

    // If no dry rooms ended up in resources but we have blocks, ensure the unassigned row exists
    if (resources.length === 0 && blocks.length > 0) {
        // Resources already added via the loop above
    }

    return { resources, blocks };
}

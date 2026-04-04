import type { Resource, ResourceBlock } from '../ui/ResourceTimeline';
import type { ProcessTemplate } from '../../types/definitions';

// ── Track colors ────────────────────────────────────────────────────────────

export const TRACK_COLORS: Record<string, string> = {
    feeding: '#3BB570',
    training: '#8B5CF6',
    ipm: '#DF5B59',
    environment: '#1C9EFF',
    milestone: '#FA9E52',
};

export const TRACK_LABELS: Record<string, string> = {
    feeding: 'Feeding',
    training: 'Training',
    ipm: 'IPM',
    environment: 'Environment',
    milestone: 'Milestones',
};

export const TRACK_ORDER = ['feeding', 'training', 'ipm', 'environment', 'milestone'];

// ── Phase colors (match existing plant map) ─────────────────────────────────

export const PHASE_COLORS: Record<string, string> = {
    nursery: '#1C9EFF',
    vegetative: '#3BB570',
    flowering: '#FA9E52',
    drying: '#959595',
};

export const PHASE_LABELS: Record<string, string> = {
    nursery: 'Nursery',
    vegetative: 'Vegetative',
    flowering: 'Flowering',
    drying: 'Dry / Cure',
};

export const PHASE_ORDER = ['nursery', 'vegetative', 'flowering', 'drying'];

const DEFAULT_PHASE_DURATIONS: Record<string, number> = {
    nursery: 2,
    vegetative: 4,
    flowering: 9,
    drying: 2,
};

// ── Build schedule for ResourceTimeline ─────────────────────────────────────

/**
 * Convert a cultivation process template into Resource[] + ResourceBlock[]
 * for rendering in ResourceTimeline.
 *
 * Uses a synthetic base date (today) since SOPs are templates,
 * not anchored to real dates until assigned to a room.
 */
export function buildCultivationSOPSchedule(
    template: ProcessTemplate,
    baseDate?: Date,
): { resources: Resource[]; blocks: ResourceBlock[] } {
    const durations = template.phaseDurations ?? DEFAULT_PHASE_DURATIONS;
    const origin = baseDate ?? new Date();

    // Resources: one per track
    const resources: Resource[] = TRACK_ORDER.map(track => ({
        id: track,
        name: TRACK_LABELS[track] || track,
        group: 'Tracks',
    }));

    // Compute phase start offsets in weeks
    const phaseStartWeek: Record<string, number> = {};
    let cumulativeWeek = 0;
    for (const phase of PHASE_ORDER) {
        phaseStartWeek[phase] = cumulativeWeek;
        cumulativeWeek += durations[phase] ?? 0;
    }

    // Convert step → block
    const blocks: ResourceBlock[] = [];

    for (const step of template.steps) {
        if (!step.track || !step.phase) continue;

        const startWeekOffset = (phaseStartWeek[step.phase] ?? 0) + (step.phaseWeek ?? 1) - 1;
        const blockStart = addWeeks(origin, startWeekOffset);

        let blockEnd: Date;
        if (step.isSpan && step.spanEndWeek) {
            const endWeekOffset = (phaseStartWeek[step.phase] ?? 0) + step.spanEndWeek;
            blockEnd = addWeeks(origin, endWeekOffset);
        } else {
            blockEnd = addWeeks(origin, startWeekOffset + 1);
        }

        blocks.push({
            id: step.id,
            resourceId: step.track,
            blockStart,
            blockEnd,
            label: step.name,
            sublabel: `${PHASE_LABELS[step.phase] ?? step.phase} W${step.phaseWeek ?? '?'}`,
            status: 'planned',
            color: TRACK_COLORS[step.track] || '#959595',
            isProjected: false,
        });

        // Expand recurring events
        if (step.recurrence?.everyWeeks) {
            const phaseDuration = durations[step.phase] ?? 0;
            let week = (step.phaseWeek ?? 1) + step.recurrence.everyWeeks;
            let recIdx = 1;
            while (week <= phaseDuration) {
                const rStartOffset = (phaseStartWeek[step.phase] ?? 0) + week - 1;
                blocks.push({
                    id: `${step.id}-rec-${recIdx}`,
                    resourceId: step.track,
                    blockStart: addWeeks(origin, rStartOffset),
                    blockEnd: addWeeks(origin, rStartOffset + 1),
                    label: step.name,
                    sublabel: `${PHASE_LABELS[step.phase] ?? step.phase} W${week}`,
                    status: 'planned',
                    color: TRACK_COLORS[step.track] || '#959595',
                    isProjected: false,
                });
                week += step.recurrence.everyWeeks;
                recIdx++;
            }
        }
    }

    return { resources, blocks };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute phase boundaries for the grid UI (not for ResourceTimeline).
 * Returns { phase, label, startWeek, endWeek, weeks, color }[]
 */
export function getPhaseColumns(phaseDurations?: Record<string, number> | null) {
    const durations = phaseDurations ?? DEFAULT_PHASE_DURATIONS;
    let offset = 0;
    return PHASE_ORDER
        .filter(p => (durations[p] ?? 0) > 0)
        .map(phase => {
            const weeks = durations[phase] ?? 0;
            const col = {
                phase,
                label: PHASE_LABELS[phase] || phase,
                startWeek: offset,
                endWeek: offset + weeks - 1,
                weeks,
                color: PHASE_COLORS[phase] || '#959595',
            };
            offset += weeks;
            return col;
        });
}

export function getTotalWeeks(phaseDurations?: Record<string, number> | null): number {
    const durations = phaseDurations ?? DEFAULT_PHASE_DURATIONS;
    return PHASE_ORDER.reduce((sum, p) => sum + (durations[p] ?? 0), 0);
}

function addWeeks(d: Date, weeks: number): Date {
    const out = new Date(d);
    out.setDate(out.getDate() + weeks * 7);
    return out;
}

import type {
  ExtractionRun,
  ExtractionEquipment,
  ProcessType,
} from '../../types/definitions';
import type { Resource, ResourceBlock } from '../ui/ResourceTimeline';

// ── Constants ───────────────────────────────────────────────────────────────

const EQUIP_TYPE_LABELS: Record<string, string> = {
  wash_vessel: 'Wash Vessels',
  freeze_dryer: 'Freeze Dryers',
  rosin_press: 'Rosin Presses',
  closed_loop_extractor: 'Closed Loop',
  vacuum_oven: 'Vacuum Ovens',
  cart_filler: 'Cart Fillers',
  filter_press: 'Filter Presses',
  short_path: 'Short Path',
};

const PROCESS_COLORS: Record<ProcessType, string> = {
  solventless: '#1C9EFF',
  bho: '#FA9E52',
  distillate: '#3BB570',
  custom: '#959595',
};

const DEFAULT_STEP_DURATION_MS = 4 * 60 * 60 * 1000; // fallback when step has no estDurationHours

// ── Adapter ─────────────────────────────────────────────────────────────────

export function buildExtractionSchedule(
  runs: ExtractionRun[],
  equipment: ExtractionEquipment[],
): { resources: Resource[]; blocks: ResourceBlock[] } {
  const UNASSIGNED_ID = '__unassigned__';

  // Build resources from non-retired equipment + an "Unassigned" lane
  const resources: Resource[] = equipment
    .filter((e) => e.status !== 'retired')
    .map((e) => ({
      id: e.id,
      name: e.name,
      group: EQUIP_TYPE_LABELS[e.equipmentType] || e.equipmentType,
    }));

  const blocks: ResourceBlock[] = [];
  let hasUnassigned = false;

  for (const run of runs) {
    // Skip cancelled runs
    if (run.status === 'cancelled') continue;
    // Use the best available time anchor — active runs should always
    // appear even if plannedStart wasn't set.
    const anchor = run.startedAt || run.plannedStart || run.createdAt;
    if (!anchor) continue;

    const color = PROCESS_COLORS[run.processType ?? 'custom'];

    // Compute projected start/end for each step by chaining forward
    let cursor = new Date(anchor);

    for (const step of run.steps) {
      // Skip steps not assigned to equipment, or skipped steps
      if (step.status === 'skipped') {
        // Still advance cursor if completed
        if (step.completedAt) {
          cursor = new Date(step.completedAt);
        }
        continue;
      }

      // Use the step's actual duration from the SOP template (surfaced by
      // get-extraction-runs JOIN on process_steps). Falls back to 4h if
      // the step has no estDurationHours (legacy runs, or SOPs without
      // durations set).
      const stepDurationMs = step.estDurationHours
        ? step.estDurationHours * 60 * 60 * 1000
        : DEFAULT_STEP_DURATION_MS;

      let blockStart: Date;
      let blockEnd: Date;
      let isProjected = false;

      if (step.startedAt && step.completedAt) {
        // Fully resolved
        blockStart = new Date(step.startedAt);
        blockEnd = new Date(step.completedAt);
      } else if (step.startedAt) {
        // Active — use actual start, project end from step duration
        blockStart = new Date(step.startedAt);
        blockEnd = new Date(blockStart.getTime() + stepDurationMs);
        isProjected = true;
      } else {
        // Pending — chain from cursor using step duration
        blockStart = new Date(cursor);
        blockEnd = new Date(cursor.getTime() + stepDurationMs);
        isProjected = true;
      }

      // Advance cursor for next step
      cursor = blockEnd;

      // Assign to equipment lane, or the "Unassigned" lane if no equipment
      const resourceId = step.equipmentId || UNASSIGNED_ID;
      if (!step.equipmentId) {
        hasUnassigned = true;
      }

      const status: ResourceBlock['status'] =
        step.status === 'completed' ? 'completed' :
        step.status === 'active' ? 'active' :
        'planned';

      blocks.push({
        id: `${run.id}-${step.id}`,
        resourceId,
        blockStart,
        blockEnd,
        label: run.name,
        sublabel: step.name,
        status,
        color,
        isProjected,
        linkTo: { view: 'extraction', id: run.id },
      });
    }
  }

  // Add "Unassigned" lane if any steps lack equipment
  if (hasUnassigned) {
    resources.push({ id: UNASSIGNED_ID, name: 'Unassigned', group: 'Other' });
  }

  return { resources, blocks };
}

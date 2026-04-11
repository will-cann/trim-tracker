import type { HumanTask, HumanTaskCategory } from '../types/definitions';
import type { Resource, ResourceBlock } from './ui/ResourceTimeline';

const MS_PER_DAY = 86_400_000;

// Brand palette only — categories are disambiguated by label/icon in the UI,
// not by color. Maps each category to one of five animal-palette anchors.
const CHAMELEON = '#3BB570';
const MACAW = '#1C9EFF';
const LION = '#FA9E52';
const CARDINAL = '#DF5B59';
const RHINO = '#959595';

const CATEGORY_COLORS: Record<HumanTaskCategory, string> = {
    drying_curing:  LION,
    ipm:            CARDINAL,
    compliance:     MACAW,
    equipment:      RHINO,
    environmental:  MACAW,
    packaging:      CHAMELEON,
    qc_testing:     MACAW,
    inventory:      LION,
    transportation: RHINO,
    sanitation:     MACAW,
    training:       RHINO,
    trim:           CHAMELEON,
    harvest:        CHAMELEON,
    cultivation:    CHAMELEON,
    other:          RHINO,
};

const CATEGORY_LABELS: Record<string, string> = {
    drying_curing: 'Drying / Curing',
    ipm: 'IPM',
    compliance: 'Compliance',
    equipment: 'Equipment',
    environmental: 'Environmental',
    packaging: 'Packaging',
    qc_testing: 'QC / Testing',
    inventory: 'Inventory',
    transportation: 'Transport',
    sanitation: 'Sanitation',
    training: 'Training',
    trim: 'Trim',
    harvest: 'Harvest',
    cultivation: 'Cultivation',
    other: 'Other',
};

const PRIORITY_LABELS: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
};

export function buildTasksSchedule(
    tasks: HumanTask[],
): { resources: Resource[]; blocks: ResourceBlock[] } {
    // Resources = categories that have tasks
    const categorySet = new Set(tasks.map(t => t.category));
    const resources: Resource[] = [...categorySet]
        .sort()
        .map(cat => ({
            id: cat,
            name: CATEGORY_LABELS[cat] || cat,
            group: 'Tasks',
        }));

    const blocks: ResourceBlock[] = [];

    for (const task of tasks) {
        // Block start: due date or created date
        const startStr = task.dueDate || task.createdAt;
        if (!startStr) continue;
        const blockStart = new Date(startStr);

        // Block end: completed date, or due date + 1 day, or just 1 day duration
        let blockEnd: Date;
        if (task.completedAt) {
            blockEnd = new Date(task.completedAt);
            // Ensure at least 1 day visible
            if (blockEnd.getTime() - blockStart.getTime() < MS_PER_DAY) {
                blockEnd = new Date(blockStart.getTime() + MS_PER_DAY);
            }
        } else {
            // Active/pending tasks show as 1-day blocks on due date
            blockEnd = new Date(blockStart.getTime() + MS_PER_DAY);
        }

        // Status mapping
        let status: ResourceBlock['status'];
        if (task.status === 'completed') status = 'completed';
        else if (task.status === 'in_progress') status = 'active';
        else status = 'planned'; // pending

        const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority;
        const isOverdue = task.dueDate && task.status !== 'completed' && new Date(task.dueDate) < new Date();

        blocks.push({
            id: `task-${task.id}`,
            resourceId: task.category,
            blockStart,
            blockEnd,
            label: task.title,
            sublabel: `${priorityLabel}${task.assignee ? ` · ${task.assignee}` : ''}${isOverdue ? ' · Overdue' : ''}`,
            status,
            color: CATEGORY_COLORS[task.category] || '#959595',
            isProjected: false,
            linkTo: { view: 'tasks', id: task.id },
        });
    }

    return { resources, blocks };
}

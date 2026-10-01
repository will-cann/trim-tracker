import { sql, pool } from './db';
import { compileReportSpec, getSchemaDescription, type ReportSpec } from './reportCompiler';
import type { ApiKeyScope, PluginContext } from './apiKeys';

/**
 * Tool registry for the NeuroCann LLM plugin (MCP server).
 *
 * Every tool receives the authenticated PluginContext and must scope all
 * queries to `ctx.companyId`. Tools declare the scope they need; the MCP
 * handler enforces it against the API key's scopes before dispatching.
 */

export interface McpToolDefinition {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    scope: ApiKeyScope;
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
}

type ToolHandler = (ctx: PluginContext, args: Record<string, any>) => Promise<unknown>;

interface RegisteredTool {
    definition: McpToolDefinition;
    handler: ToolHandler;
}

export class ToolInputError extends Error {}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(value: unknown): number {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
}

function optString(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    return s.length ? s : null;
}

function requireString(args: Record<string, any>, key: string): string {
    const v = optString(args[key]);
    if (!v) throw new ToolInputError(`"${key}" is required`);
    return v;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], key: string): T {
    const v = optString(value);
    if (!v || !(allowed as readonly string[]).includes(v)) {
        throw new ToolInputError(`"${key}" must be one of: ${allowed.join(', ')}`);
    }
    return v as T;
}

function num(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = parseFloat(String(value));
    return Number.isFinite(n) ? n : null;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
const TASK_CATEGORIES = [
    'drying_curing', 'ipm', 'compliance', 'equipment', 'environmental', 'packaging',
    'qc_testing', 'inventory', 'transportation', 'sanitation', 'training', 'trim', 'harvest', 'other',
] as const;

const tools: RegisteredTool[] = [];

function register(definition: McpToolDefinition, handler: ToolHandler) {
    tools.push({ definition, handler });
}

// ── Facility overview ─────────────────────────────────────────────────────────

register({
    name: 'get_facility_overview',
    title: 'Facility overview',
    description: 'High-level snapshot of the facility: plant counts by growth phase, harvests by status, package inventory by type, open tasks, and active extraction runs. Call this first to orient yourself before drilling into specific lists.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx) => {
    const [company, plants, batches, harvests, packages, tasks, runs] = await Promise.all([
        sql`SELECT name FROM companies WHERE id = ${ctx.companyId}`,
        sql`SELECT growth_phase, COUNT(*)::int AS count FROM plants
            WHERE company_id = ${ctx.companyId} AND growth_phase NOT IN ('harvested', 'destroyed')
            GROUP BY growth_phase`,
        sql`SELECT COUNT(*)::int AS batches, COALESCE(SUM(untracked_count), 0)::int AS untracked_plants
            FROM plant_batches WHERE company_id = ${ctx.companyId}`,
        sql`SELECT status, COUNT(*)::int AS count FROM harvests
            WHERE company_id = ${ctx.companyId} GROUP BY status`,
        sql`SELECT package_type, unit, COUNT(*)::int AS count, COALESCE(SUM(quantity), 0)::float AS total_quantity
            FROM packages WHERE company_id = ${ctx.companyId} AND status = 'active'
            GROUP BY package_type, unit ORDER BY package_type`,
        sql`SELECT status, priority, COUNT(*)::int AS count FROM human_tasks
            WHERE company_id = ${ctx.companyId} AND status != 'completed'
            GROUP BY status, priority`,
        sql`SELECT status, COUNT(*)::int AS count FROM extraction_runs
            WHERE company_id = ${ctx.companyId} AND status IN ('planned', 'active')
            GROUP BY status`,
    ]);

    return {
        company: company.rows[0]?.name ?? null,
        plants: {
            byPhase: Object.fromEntries(plants.rows.map((r: any) => [r.growth_phase, r.count])),
            nurseryBatches: batches.rows[0]?.batches ?? 0,
            nurseryUntrackedPlants: batches.rows[0]?.untracked_plants ?? 0,
        },
        harvests: { byStatus: Object.fromEntries(harvests.rows.map((r: any) => [r.status, r.count])) },
        activePackages: packages.rows.map((r: any) => ({
            packageType: r.package_type, unit: r.unit, count: r.count, totalQuantity: r.total_quantity,
        })),
        openTasks: tasks.rows.map((r: any) => ({ status: r.status, priority: r.priority, count: r.count })),
        extractionRuns: { byStatus: Object.fromEntries(runs.rows.map((r: any) => [r.status, r.count])) },
    };
});

// ── Cultivation ───────────────────────────────────────────────────────────────

register({
    name: 'list_rooms',
    title: 'List rooms',
    description: 'List facility rooms with type, capacity and current plant count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx) => {
    const { rows } = await sql`
        SELECT r.id, r.name, r.room_type, r.capacity, r.square_footage,
               (SELECT COUNT(*)::int FROM plants p WHERE p.room_id = r.id AND p.growth_phase NOT IN ('harvested', 'destroyed')) AS plant_count,
               (SELECT COALESCE(SUM(pb.untracked_count), 0)::int FROM plant_batches pb WHERE pb.room_id = r.id) AS batch_plant_count
        FROM rooms r
        WHERE r.company_id = ${ctx.companyId}
        ORDER BY r.name
    `;
    return rows.map((r: any) => ({
        id: r.id, name: r.name, roomType: r.room_type, capacity: r.capacity,
        squareFootage: num(r.square_footage), plantCount: r.plant_count, nurseryPlantCount: r.batch_plant_count,
    }));
});

register({
    name: 'list_strains',
    title: 'List strains',
    description: 'List the strains configured for this facility.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx) => {
    const { rows } = await sql`
        SELECT id, name, default_flowering_days, created_at
        FROM strains WHERE company_id = ${ctx.companyId} ORDER BY name
    `;
    return rows.map((r: any) => ({ id: r.id, name: r.name, defaultFloweringDays: r.default_flowering_days, createdAt: r.created_at }));
});

register({
    name: 'list_plants',
    title: 'List plants',
    description: 'List tracked plants (vegetative/flowering) and nursery batches. Filter by growth phase, room name, or strain.',
    inputSchema: {
        type: 'object',
        properties: {
            phase: { type: 'string', enum: ['nursery', 'vegetative', 'flowering', 'harvested'], description: 'Growth phase filter. "nursery" returns untracked plant batches.' },
            room: { type: 'string', description: 'Room name (case-insensitive exact match).' },
            strain: { type: 'string', description: 'Strain name (case-insensitive partial match).' },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        additionalProperties: false,
    },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx, args) => {
    const phase = optString(args.phase);
    const room = optString(args.room);
    const strain = optString(args.strain);
    const limit = clampLimit(args.limit);
    const strainPattern = strain ? `%${strain}%` : null;

    let plants: any[] = [];
    if (phase !== 'nursery') {
        const res = await sql`
            SELECT p.id, p.label, p.strain_name, p.growth_phase, r.name AS room_name,
                   p.plant_health, p.contaminants, p.is_on_hold,
                   p.planted_date::text, p.vegetative_date::text, p.flowering_date::text,
                   p.target_harvest_date::text, p.harvested_date::text
            FROM plants p
            LEFT JOIN rooms r ON r.id = p.room_id
            WHERE p.company_id = ${ctx.companyId}
              AND p.growth_phase != 'destroyed'
              AND (${phase}::text IS NULL OR p.growth_phase = ${phase})
              AND (${room}::text IS NULL OR LOWER(r.name) = LOWER(${room}))
              AND (${strainPattern}::text IS NULL OR p.strain_name ILIKE ${strainPattern})
            ORDER BY p.created_at DESC
            LIMIT ${limit}
        `;
        plants = res.rows.map((p: any) => ({
            id: p.id, label: p.label, strain: p.strain_name, phase: p.growth_phase, room: p.room_name,
            health: p.plant_health, contaminants: p.contaminants, isOnHold: p.is_on_hold,
            plantedDate: p.planted_date, vegetativeDate: p.vegetative_date, floweringDate: p.flowering_date,
            targetHarvestDate: p.target_harvest_date, harvestedDate: p.harvested_date,
        }));
    }

    let batches: any[] = [];
    if (!phase || phase === 'nursery') {
        const res = await sql`
            SELECT pb.id, pb.name, pb.batch_type, pb.strain_name, r.name AS room_name,
                   pb.untracked_count, pb.tracked_count, pb.plant_health, pb.contaminants, pb.planted_date::text
            FROM plant_batches pb
            LEFT JOIN rooms r ON r.id = pb.room_id
            WHERE pb.company_id = ${ctx.companyId}
              AND (${room}::text IS NULL OR LOWER(r.name) = LOWER(${room}))
              AND (${strainPattern}::text IS NULL OR pb.strain_name ILIKE ${strainPattern})
            ORDER BY pb.created_at DESC
            LIMIT ${limit}
        `;
        batches = res.rows.map((b: any) => ({
            id: b.id, name: b.name, batchType: b.batch_type, strain: b.strain_name, room: b.room_name,
            untrackedCount: b.untracked_count, trackedCount: b.tracked_count,
            health: b.plant_health, contaminants: b.contaminants, plantedDate: b.planted_date,
        }));
    }

    return { plants, nurseryBatches: batches };
});

// ── Harvests ──────────────────────────────────────────────────────────────────

register({
    name: 'list_harvests',
    title: 'List harvests',
    description: 'List harvests with weights, status and drying details. Statuses flow planning → active → submitted → drying → ready → completed.',
    inputSchema: {
        type: 'object',
        properties: {
            status: { type: 'string', description: 'Filter by harvest status.' },
            strain: { type: 'string', description: 'Strain name (case-insensitive partial match).' },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        additionalProperties: false,
    },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx, args) => {
    const status = optString(args.status);
    const strain = optString(args.strain);
    const strainPattern = strain ? `%${strain}%` : null;
    const limit = clampLimit(args.limit);
    const { rows } = await sql`
        SELECT id, batch_id, name, strain, license_number, plant_count, status, is_on_hold,
               total_wet_weight, total_waste_weight, dry_weight, drying_location, manicure_location,
               harvest_start_date, harvest_end_date, created_at, updated_at
        FROM harvests
        WHERE company_id = ${ctx.companyId}
          AND (${status}::text IS NULL OR status = ${status})
          AND (${strainPattern}::text IS NULL OR strain ILIKE ${strainPattern})
        ORDER BY created_at DESC
        LIMIT ${limit}
    `;
    return rows.map((h: any) => ({
        id: h.id, batchId: h.batch_id, name: h.name, strain: h.strain, licenseNumber: h.license_number,
        plantCount: h.plant_count, status: h.status, isOnHold: h.is_on_hold,
        totalWetWeightG: num(h.total_wet_weight), totalWasteWeightG: num(h.total_waste_weight), dryWeightG: num(h.dry_weight),
        dryingLocation: h.drying_location, manicureLocation: h.manicure_location,
        harvestStartDate: h.harvest_start_date, harvestEndDate: h.harvest_end_date,
        createdAt: h.created_at, updatedAt: h.updated_at,
    }));
});

// ── Inventory ─────────────────────────────────────────────────────────────────

register({
    name: 'list_packages',
    title: 'List packages',
    description: 'List inventory packages (flower, trim, shake, fresh_frozen, bubble_hash, rosin, rosin_cart). Defaults to non-archived packages.',
    inputSchema: {
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['active', 'on_hold', 'finished', 'archived'] },
            packageType: { type: 'string', enum: ['flower', 'trim', 'shake', 'fresh_frozen', 'bubble_hash', 'rosin', 'rosin_cart'] },
            strain: { type: 'string', description: 'Strain name (case-insensitive partial match).' },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        additionalProperties: false,
    },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx, args) => {
    const status = optString(args.status);
    const packageType = optString(args.packageType);
    const strain = optString(args.strain);
    const strainPattern = strain ? `%${strain}%` : null;
    const limit = clampLimit(args.limit);
    const { rows } = await sql`
        SELECT p.id, p.label, p.package_type, p.item_name, p.strain, p.license_number,
               p.quantity, p.unit, p.location, p.status, p.lab_testing_state, p.notes,
               p.packaged_date, p.finished_date, t.tag_number
        FROM packages p
        LEFT JOIN tags t ON p.tag_id = t.id
        WHERE p.company_id = ${ctx.companyId}
          AND (${status}::text IS NULL OR p.status = ${status})
          AND (${status}::text IS NOT NULL OR p.status != 'archived')
          AND (${packageType}::text IS NULL OR p.package_type = ${packageType})
          AND (${strainPattern}::text IS NULL OR p.strain ILIKE ${strainPattern})
        ORDER BY p.packaged_date DESC
        LIMIT ${limit}
    `;
    return rows.map((p: any) => ({
        id: p.id, label: p.label, packageType: p.package_type, itemName: p.item_name, strain: p.strain,
        licenseNumber: p.license_number, quantity: num(p.quantity), unit: p.unit, location: p.location,
        status: p.status, labTestingState: p.lab_testing_state, notes: p.notes, tagNumber: p.tag_number,
        packagedDate: p.packaged_date, finishedDate: p.finished_date,
    }));
});

// ── Extraction ────────────────────────────────────────────────────────────────

register({
    name: 'list_extraction_runs',
    title: 'List extraction runs',
    description: 'List extraction runs (fresh frozen → bubble hash → rosin → carts) with their steps and yields.',
    inputSchema: {
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['planned', 'active', 'completed', 'cancelled'] },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        additionalProperties: false,
    },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx, args) => {
    const status = optString(args.status);
    const limit = clampLimit(args.limit);
    const { rows: runs } = await sql`
        SELECT id, name, strain, input_material, target_product, status, planned_start,
               started_at, completed_at, notes, created_at
        FROM extraction_runs
        WHERE company_id = ${ctx.companyId}
          AND (${status}::text IS NULL OR status = ${status})
        ORDER BY created_at DESC
        LIMIT ${limit}
    `;
    const runIds = runs.map((r: any) => r.id);
    let steps: any[] = [];
    if (runIds.length > 0) {
        const res = await sql`
            SELECT run_id, step_order, name, status, input_weight_g, output_weight_g, yield_pct, started_at, completed_at
            FROM extraction_run_steps
            WHERE run_id = ANY(${runIds})
            ORDER BY run_id, step_order
        `;
        steps = res.rows;
    }
    return runs.map((r: any) => ({
        id: r.id, name: r.name, strain: r.strain, inputMaterial: r.input_material, targetProduct: r.target_product,
        status: r.status, plannedStart: r.planned_start, startedAt: r.started_at, completedAt: r.completed_at,
        notes: r.notes, createdAt: r.created_at,
        steps: steps.filter(s => s.run_id === r.id).map(s => ({
            order: s.step_order, name: s.name, status: s.status,
            inputWeightG: num(s.input_weight_g), outputWeightG: num(s.output_weight_g), yieldPct: num(s.yield_pct),
            startedAt: s.started_at, completedAt: s.completed_at,
        })),
    }));
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

function taskToClient(row: any) {
    return {
        id: row.id, title: row.title, description: row.description, priority: row.priority,
        category: row.category, status: row.status, assignee: row.assignee, location: row.location,
        dueDate: row.due_date, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    };
}

register({
    name: 'list_tasks',
    title: 'List tasks',
    description: 'List human tasks (physical work items). Defaults to open tasks (pending + in_progress).',
    inputSchema: {
        type: 'object',
        properties: {
            status: { type: 'string', enum: [...TASK_STATUSES, 'all'], description: 'Defaults to open tasks when omitted.' },
            category: { type: 'string', enum: [...TASK_CATEGORIES] },
            priority: { type: 'string', enum: [...TASK_PRIORITIES] },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        additionalProperties: false,
    },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx, args) => {
    const status = optString(args.status);
    const category = optString(args.category);
    const priority = optString(args.priority);
    const limit = clampLimit(args.limit);
    const statusFilter = status === 'all' ? null : status;
    const openOnly = !status;
    const { rows } = await sql`
        SELECT * FROM human_tasks
        WHERE company_id = ${ctx.companyId}
          AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
          AND (${openOnly}::boolean = FALSE OR status != 'completed')
          AND (${category}::text IS NULL OR category = ${category})
          AND (${priority}::text IS NULL OR priority = ${priority})
        ORDER BY
          CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          due_date ASC NULLS LAST,
          created_at DESC
        LIMIT ${limit}
    `;
    return rows.map(taskToClient);
});

register({
    name: 'create_task',
    title: 'Create task',
    description: 'Create a human task for the floor team (e.g. "Flip Flower Room B to 12/12", "Check Veg 2 for mites"). Use for physical work that cannot be done digitally.',
    inputSchema: {
        type: 'object',
        properties: {
            title: { type: 'string', maxLength: 500 },
            description: { type: 'string' },
            priority: { type: 'string', enum: [...TASK_PRIORITIES], default: 'medium' },
            category: { type: 'string', enum: [...TASK_CATEGORIES], default: 'other' },
            assignee: { type: 'string', description: 'Display name of the team member responsible.' },
            location: { type: 'string', description: 'Room or area where the work happens.' },
            dueDate: { type: 'string', format: 'date-time', description: 'ISO 8601 due date.' },
        },
        required: ['title'],
        additionalProperties: false,
    },
    scope: 'write',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async (ctx, args) => {
    const title = requireString(args, 'title');
    const priority = args.priority ? requireOneOf(args.priority, TASK_PRIORITIES, 'priority') : 'medium';
    const category = args.category ? requireOneOf(args.category, TASK_CATEGORIES, 'category') : 'other';
    const dueDate = optString(args.dueDate);
    if (dueDate && Number.isNaN(Date.parse(dueDate))) throw new ToolInputError('"dueDate" must be an ISO 8601 date');

    const { rows } = await sql`
        INSERT INTO human_tasks (company_id, title, description, priority, category, assignee, created_by_user_id, location, due_date, source_conversation_id)
        VALUES (${ctx.companyId}, ${title}, ${optString(args.description)}, ${priority}, ${category},
                ${optString(args.assignee)}, ${ctx.userId}, ${optString(args.location)}, ${dueDate}, 'llm-plugin')
        RETURNING *
    `;
    return taskToClient(rows[0]);
});

register({
    name: 'update_task_status',
    title: 'Update task status',
    description: 'Move a task to pending, in_progress, or completed.',
    inputSchema: {
        type: 'object',
        properties: {
            taskId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: [...TASK_STATUSES] },
        },
        required: ['taskId', 'status'],
        additionalProperties: false,
    },
    scope: 'write',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async (ctx, args) => {
    const taskId = requireString(args, 'taskId');
    const status = requireOneOf(args.status, TASK_STATUSES, 'status');
    const completing = status === 'completed';
    const { rows } = await sql`
        UPDATE human_tasks
        SET status = ${status},
            completed_at = CASE WHEN ${completing}::boolean THEN NOW() ELSE NULL END,
            completed_by_user_id = CASE WHEN ${completing}::boolean THEN ${ctx.userId}::uuid ELSE NULL END,
            updated_at = NOW()
        WHERE id = ${taskId} AND company_id = ${ctx.companyId}
        RETURNING *
    `;
    if (rows.length === 0) throw new ToolInputError('Task not found');
    return taskToClient(rows[0]);
});

// ── Reporting ─────────────────────────────────────────────────────────────────

register({
    name: 'get_report_schema',
    title: 'Get report schema',
    description: 'Describe the tables, columns and join paths available to run_report. Call before building a report query.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    scope: 'read',
    annotations: READ_ONLY,
}, async () => ({ schema: getSchemaDescription() }));

register({
    name: 'run_report',
    title: 'Run report',
    description: 'Run an ad-hoc analytics query (e.g. average yield by strain, harvest weight over time). Queries are compiled from a structured spec against an allowlisted schema and executed read-only, automatically scoped to this company. Column references must be table-qualified ("harvests.strain"). Use get_report_schema to see what is available.',
    inputSchema: {
        type: 'object',
        properties: {
            from: { type: 'string', description: 'Base table.' },
            joins: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        on: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2, description: '["left.table_col", "right.table_col"]' },
                    },
                    required: ['table', 'on'],
                },
            },
            columns: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    properties: {
                        expr: { type: 'string', description: 'table.column' },
                        alias: { type: 'string' },
                        agg: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max'] },
                    },
                    required: ['expr', 'alias'],
                },
            },
            filters: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        column: { type: 'string' },
                        op: { type: 'string', enum: ['=', '!=', '>', '<', '>=', '<=', 'in', 'between'] },
                        value: {},
                    },
                    required: ['column', 'op', 'value'],
                },
            },
            groupBy: { type: 'array', items: { type: 'string' } },
            orderBy: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { column: { type: 'string', description: 'Alias from columns.' }, dir: { type: 'string', enum: ['asc', 'desc'] } },
                    required: ['column', 'dir'],
                },
            },
            limit: { type: 'integer', minimum: 1, maximum: 500 },
        },
        required: ['from', 'columns'],
        additionalProperties: false,
    },
    scope: 'read',
    annotations: READ_ONLY,
}, async (ctx, args) => {
    const spec: ReportSpec = {
        title: 'LLM plugin report',
        description: '',
        visualization: 'table',
        query: {
            from: requireString(args, 'from'),
            joins: args.joins,
            columns: args.columns,
            filters: args.filters,
            groupBy: args.groupBy,
            orderBy: args.orderBy,
            limit: args.limit,
        },
        chart: { xAxis: '', yAxis: [] },
    };

    let compiled;
    try {
        compiled = compileReportSpec(spec, ctx.companyId);
    } catch (err: any) {
        throw new ToolInputError(`Invalid report spec: ${err.message}`);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SET TRANSACTION READ ONLY');
        const { rows } = await client.query(compiled.text, compiled.values);
        await client.query('COMMIT');
        return { rowCount: rows.length, rows };
    } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw new ToolInputError(`Query failed: ${err.message}`);
    } finally {
        client.release();
    }
});

// ── Registry API ──────────────────────────────────────────────────────────────

export function listTools(scopes: ApiKeyScope[]): McpToolDefinition[] {
    return tools.filter(t => scopes.includes(t.definition.scope)).map(t => t.definition);
}

export function findTool(name: string): RegisteredTool | undefined {
    return tools.find(t => t.definition.name === name);
}

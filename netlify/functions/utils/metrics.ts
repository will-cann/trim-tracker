// Facility metrics: what gets computed on the schedule, and how.
//
// Each metric is a SQL query returning (dimension, value, extra) rows for one
// company as of one snapshot date. Facility-wide metrics return a single row
// with dimension ''. Queries are independent and each is wrapped so one
// failure (e.g. a table a deploy hasn't migrated yet) doesn't stop the run.

import { sql } from './db';

export type MetricKind = 'count' | 'gauge' | 'ratio' | 'grams';

export interface MetricDefinition {
    key: string;
    label: string;
    description: string;
    kind: MetricKind;
    /** What the dimension column holds, or null for facility-wide metrics. */
    dimension: 'room' | 'phase' | 'strain' | 'issue' | 'status' | null;
    /** Higher is better (true), lower is better (false), or neutral (null). Drives the change colour. */
    goodWhenUp: boolean | null;
}

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
    { key: 'plants.live', label: 'Live plants', description: 'Individually tracked plants in veg or flower.', kind: 'count', dimension: null, goodWhenUp: null },
    { key: 'plants.by_phase', label: 'Plants by phase', description: 'Live plants per growth phase (nursery counts batches × count).', kind: 'count', dimension: 'phase', goodWhenUp: null },
    { key: 'plants.by_room', label: 'Plants by room', description: 'Live plants per room.', kind: 'count', dimension: 'room', goodWhenUp: null },
    { key: 'plants.avg_health', label: 'Average plant health', description: 'Mean plant_health across live plants (0–100).', kind: 'gauge', dimension: null, goodWhenUp: true },
    { key: 'plants.with_issues', label: 'Plants with issues', description: 'Live plants carrying at least one contaminant.', kind: 'count', dimension: null, goodWhenUp: false },
    { key: 'health.active_issues', label: 'Active issues', description: 'Unresolved plant health events per issue.', kind: 'count', dimension: 'issue', goodWhenUp: false },
    { key: 'health.events_7d', label: 'New issues (7d)', description: 'Health events logged in the last 7 days per issue.', kind: 'count', dimension: 'issue', goodWhenUp: false },
    { key: 'health.botrytis_incidence_90d', label: 'Bud rot incidence (90d)', description: 'Plants with botrytis ÷ plants that flowered in the last 90 days, per strain.', kind: 'ratio', dimension: 'strain', goodWhenUp: false },
    { key: 'harvests.open', label: 'Open harvests', description: 'Harvests not yet completed, per status.', kind: 'count', dimension: 'status', goodWhenUp: null },
    { key: 'harvests.completed_30d', label: 'Harvests completed (30d)', description: 'Harvests marked completed in the last 30 days.', kind: 'count', dimension: null, goodWhenUp: true },
    { key: 'harvests.wet_weight_30d', label: 'Wet weight harvested (30d)', description: 'Sum of wet weight on harvests created in the last 30 days.', kind: 'grams', dimension: null, goodWhenUp: true },
    { key: 'trim.flower_30d', label: 'Flower trimmed (30d)', description: 'Flower weight on trim entries submitted in the last 30 days.', kind: 'grams', dimension: null, goodWhenUp: true },
    { key: 'packages.active', label: 'Active packages', description: 'Packages with status active.', kind: 'count', dimension: null, goodWhenUp: null },
    { key: 'packages.active_grams', label: 'Active inventory (g)', description: 'Quantity on active packages measured in grams.', kind: 'grams', dimension: null, goodWhenUp: null },
    { key: 'tasks.open', label: 'Open tasks', description: 'Human tasks not completed.', kind: 'count', dimension: null, goodWhenUp: false },
    { key: 'tasks.overdue', label: 'Overdue tasks', description: 'Open tasks whose due date has passed.', kind: 'count', dimension: null, goodWhenUp: false },
];

export const METRIC_KEYS = METRIC_DEFINITIONS.map(d => d.key);
export const metricDefinition = (key: string): MetricDefinition | undefined => METRIC_DEFINITIONS.find(d => d.key === key);

export interface MetricRow {
    key: string;
    dimension: string;
    value: number;
    extra?: Record<string, unknown> | null;
}

type Computer = (companyId: string, asOf: string) => Promise<MetricRow[]>;

const one = (key: string, value: unknown, extra?: Record<string, unknown>): MetricRow[] =>
    [{ key, dimension: '', value: Number(value ?? 0) || 0, extra: extra ?? null }];

const many = (key: string, rows: ReadonlyArray<Record<string, unknown>>): MetricRow[] =>
    rows
        .filter(r => r.dimension != null && String(r.dimension) !== '')
        .map(r => ({ key, dimension: String(r.dimension).slice(0, 255), value: Number(r.value ?? 0) || 0 }));

// `asOf` is the snapshot date (YYYY-MM-DD); windows are measured back from it
// so a backfill for an earlier day uses that day's window, not today's.
const COMPUTERS: Record<string, Computer> = {
    'plants.live': async (c) => {
        const { rows } = await sql`SELECT COUNT(*)::int AS n FROM plants WHERE company_id = ${c} AND growth_phase IN ('vegetative', 'flowering')`;
        return one('plants.live', rows[0]?.n);
    },
    'plants.by_phase': async (c) => {
        const { rows } = await sql`
            SELECT growth_phase AS dimension, COUNT(*)::int AS value FROM plants
            WHERE company_id = ${c} AND growth_phase IN ('vegetative', 'flowering') GROUP BY growth_phase
            UNION ALL
            SELECT 'nursery', COALESCE(SUM(untracked_count + tracked_count), 0)::int FROM plant_batches WHERE company_id = ${c}
        `;
        return many('plants.by_phase', rows);
    },
    'plants.by_room': async (c) => {
        const { rows } = await sql`
            SELECT r.name AS dimension, COUNT(p.id)::int AS value
            FROM plants p JOIN rooms r ON r.id = p.room_id
            WHERE p.company_id = ${c} AND p.growth_phase IN ('vegetative', 'flowering')
            GROUP BY r.name
        `;
        return many('plants.by_room', rows);
    },
    'plants.avg_health': async (c) => {
        const { rows } = await sql`SELECT ROUND(AVG(plant_health), 1) AS v FROM plants WHERE company_id = ${c} AND growth_phase IN ('vegetative', 'flowering')`;
        return rows[0]?.v == null ? [] : one('plants.avg_health', rows[0].v);
    },
    'plants.with_issues': async (c) => {
        const { rows } = await sql`SELECT COUNT(*)::int AS n FROM plants WHERE company_id = ${c} AND growth_phase IN ('vegetative', 'flowering') AND cardinality(contaminants) > 0`;
        return one('plants.with_issues', rows[0]?.n);
    },
    'health.active_issues': async (c) => {
        const { rows } = await sql`SELECT contaminant AS dimension, COUNT(*)::int AS value FROM plant_health_events WHERE company_id = ${c} AND status = 'active' GROUP BY contaminant`;
        return many('health.active_issues', rows);
    },
    'health.events_7d': async (c, asOf) => {
        const { rows } = await sql`
            SELECT contaminant AS dimension, COUNT(*)::int AS value FROM plant_health_events
            WHERE company_id = ${c} AND observed_at > ${asOf}::date - 7 AND observed_at < ${asOf}::date + 1
            GROUP BY contaminant
        `;
        return many('health.events_7d', rows);
    },
    'health.botrytis_incidence_90d': async (c, asOf) => {
        const { rows } = await sql`
            WITH flowered AS (
                SELECT strain_name, COUNT(*)::int AS n FROM plants
                WHERE company_id = ${c} AND flowering_date IS NOT NULL
                  AND growth_phase IN ('flowering', 'harvested')
                  AND COALESCE(harvested_date, ${asOf}::date) >= ${asOf}::date - 90
                GROUP BY strain_name
            ),
            hit AS (
                SELECT strain_name, COUNT(DISTINCT plant_id)::int AS n FROM plant_health_events
                WHERE company_id = ${c} AND contaminant = 'botrytis' AND plant_id IS NOT NULL
                  AND observed_at >= ${asOf}::date - 90 AND observed_at < ${asOf}::date + 1
                GROUP BY strain_name
            )
            SELECT f.strain_name AS dimension, ROUND(LEAST(1, COALESCE(h.n, 0)::numeric / f.n), 4) AS value
            FROM flowered f LEFT JOIN hit h ON LOWER(h.strain_name) = LOWER(f.strain_name)
            WHERE f.n > 0
        `;
        return many('health.botrytis_incidence_90d', rows);
    },
    'harvests.open': async (c) => {
        const { rows } = await sql`SELECT status AS dimension, COUNT(*)::int AS value FROM harvests WHERE company_id = ${c} AND status <> 'completed' GROUP BY status`;
        return many('harvests.open', rows);
    },
    'harvests.completed_30d': async (c, asOf) => {
        const { rows } = await sql`
            SELECT COUNT(*)::int AS n FROM harvests
            WHERE company_id = ${c} AND status = 'completed'
              AND COALESCE(harvest_end_date, updated_at) > ${asOf}::date - 30 AND COALESCE(harvest_end_date, updated_at) < ${asOf}::date + 1
        `;
        return one('harvests.completed_30d', rows[0]?.n);
    },
    'harvests.wet_weight_30d': async (c, asOf) => {
        const { rows } = await sql`
            SELECT COALESCE(SUM(total_wet_weight), 0) AS g FROM harvests
            WHERE company_id = ${c} AND created_at > ${asOf}::date - 30 AND created_at < ${asOf}::date + 1
        `;
        return one('harvests.wet_weight_30d', rows[0]?.g);
    },
    'trim.flower_30d': async (c, asOf) => {
        const { rows } = await sql`
            SELECT COALESCE(SUM(te.flower_weight), 0) AS g
            FROM trim_entries te JOIN trim_sessions ts ON ts.id = te.session_id
            WHERE ts.company_id = ${c} AND te.status = 'submitted'
              AND te.updated_at > ${asOf}::date - 30 AND te.updated_at < ${asOf}::date + 1
        `;
        return one('trim.flower_30d', rows[0]?.g);
    },
    'packages.active': async (c) => {
        const { rows } = await sql`SELECT COUNT(*)::int AS n FROM packages WHERE company_id = ${c} AND status = 'active'`;
        return one('packages.active', rows[0]?.n);
    },
    'packages.active_grams': async (c) => {
        const { rows } = await sql`SELECT COALESCE(SUM(quantity), 0) AS g FROM packages WHERE company_id = ${c} AND status = 'active' AND LOWER(unit) IN ('grams', 'g', 'gram')`;
        return one('packages.active_grams', rows[0]?.g);
    },
    'tasks.open': async (c) => {
        const { rows } = await sql`SELECT COUNT(*)::int AS n FROM human_tasks WHERE company_id = ${c} AND status <> 'completed'`;
        return one('tasks.open', rows[0]?.n);
    },
    'tasks.overdue': async (c, asOf) => {
        const { rows } = await sql`SELECT COUNT(*)::int AS n FROM human_tasks WHERE company_id = ${c} AND status <> 'completed' AND due_date IS NOT NULL AND due_date < ${asOf}::date`;
        return one('tasks.overdue', rows[0]?.n);
    },
};

export interface ComputeResult {
    rows: MetricRow[];
    /** Metric keys whose query failed, with the message. */
    failures: Array<{ key: string; error: string }>;
}

/** Compute every metric for one company as of a date (YYYY-MM-DD). */
export async function computeMetrics(companyId: string, asOf: string, keys: readonly string[] = METRIC_KEYS): Promise<ComputeResult> {
    const rows: MetricRow[] = [];
    const failures: ComputeResult['failures'] = [];
    for (const key of keys) {
        const compute = COMPUTERS[key];
        if (!compute) continue;
        try {
            rows.push(...await compute(companyId, asOf));
        } catch (err) {
            failures.push({ key, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return { rows, failures };
}

/** Upsert a day's rows. Re-running a day replaces its values. */
export async function writeSnapshots(companyId: string, asOf: string, rows: readonly MetricRow[]): Promise<number> {
    let written = 0;
    for (const r of rows) {
        await sql`
            INSERT INTO metric_snapshots (company_id, metric_key, dimension, snapshot_date, value, extra, computed_at)
            VALUES (${companyId}, ${r.key}, ${r.dimension}, ${asOf}::date, ${r.value}, ${r.extra ? JSON.stringify(r.extra) : null}::jsonb, NOW())
            ON CONFLICT (company_id, metric_key, dimension, snapshot_date)
            DO UPDATE SET value = EXCLUDED.value, extra = EXCLUDED.extra, computed_at = NOW()
        `;
        written++;
    }
    return written;
}

/** Compute and write one company for one day, recording a metric_runs row. */
export async function runMetricsForCompany(companyId: string, asOf: string, trigger: 'schedule' | 'manual' | 'backfill'): Promise<{ written: number; failures: ComputeResult['failures'] }> {
    const { rows: runRows } = await sql`
        INSERT INTO metric_runs (company_id, snapshot_date, trigger) VALUES (${companyId}, ${asOf}::date, ${trigger}) RETURNING id
    `;
    const runId = runRows[0]?.id;
    try {
        const { rows, failures } = await computeMetrics(companyId, asOf);
        const written = await writeSnapshots(companyId, asOf, rows);
        await sql`
            UPDATE metric_runs SET status = ${failures.length ? 'failed' : 'succeeded'}, metrics_written = ${written},
                error = ${failures.length ? failures.map(f => `${f.key}: ${f.error}`).join('; ').slice(0, 2000) : null}, finished_at = NOW()
            WHERE id = ${runId}
        `;
        return { written, failures };
    } catch (err) {
        await sql`UPDATE metric_runs SET status = 'failed', error = ${(err instanceof Error ? err.message : String(err)).slice(0, 2000)}, finished_at = NOW() WHERE id = ${runId}`;
        throw err;
    }
}

// ── Read helpers (pure) ─────────────────────────────────────────────────────

export interface SnapshotPoint {
    key: string;
    dimension: string;
    date: string;
    value: number;
}

export interface LatestMetric {
    key: string;
    dimension: string;
    date: string;
    value: number;
    /** Value `daysBack` days earlier (nearest snapshot at or before), or null. */
    previous: number | null;
    change: number | null;
    changePct: number | null;
}

/** Latest value per (key, dimension) with the change against the snapshot nearest `daysBack` days earlier. */
export function summarizeLatest(points: readonly SnapshotPoint[], daysBack = 7): LatestMetric[] {
    const bySeries = new Map<string, SnapshotPoint[]>();
    for (const p of points) {
        const id = `${p.key}\u0000${p.dimension}`;
        const list = bySeries.get(id) ?? [];
        list.push(p);
        bySeries.set(id, list);
    }
    const out: LatestMetric[] = [];
    for (const list of bySeries.values()) {
        list.sort((a, b) => a.date.localeCompare(b.date));
        const latest = list[list.length - 1];
        const target = shiftDate(latest.date, -daysBack);
        const prev = [...list].reverse().find(p => p.date <= target) ?? null;
        const change = prev ? latest.value - prev.value : null;
        out.push({
            key: latest.key,
            dimension: latest.dimension,
            date: latest.date,
            value: latest.value,
            previous: prev?.value ?? null,
            change,
            changePct: prev && prev.value !== 0 && change != null ? Math.round((change / Math.abs(prev.value)) * 1000) / 10 : null,
        });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key) || b.value - a.value);
}

export function shiftDate(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function todayIso(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

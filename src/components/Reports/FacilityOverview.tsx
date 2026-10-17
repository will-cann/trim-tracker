import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, RefreshCw, History } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { MetricsResponse, LatestMetric, MetricDefinition, MetricPoint } from '../../services/apiService';
import { useAuth } from '../../contexts/authContext';
import { contaminantLabel } from '../../types/plantMap';
import { EmptyState } from '../ui';
import { ErrorRetry } from '../ErrorRetry';
import { StatTile, DeltaChip } from './StatTile';
import { formatMetricValue, formatSnapshotDate, metricDelta, tileLabel, dimensionCount } from './format';

/**
 * Facility overview: the daily snapshot series from metric_snapshots.
 * Headline figures with their change and a sparkline, then the per-room /
 * per-strain / per-issue breakdowns. Directors can recompute or backfill.
 */

// Tiles are ordered by what an operator checks first: the canopy, its
// health, then what's moving through post-harvest, then the backlog.
const TILE_ORDER = [
    'plants.live', 'plants.avg_health', 'plants.with_issues',
    'harvests.wet_weight_30d', 'trim.flower_30d', 'harvests.completed_30d',
    'packages.active_grams', 'packages.active', 'tasks.open',
];

const BREAKDOWN_ORDER = ['plants.by_room', 'plants.by_phase', 'health.active_issues', 'health.events_7d', 'health.botrytis_incidence_90d', 'harvests.open'];

const TILE_ACCENT: Record<string, string> = {
    'plants.live': '#3BB570',
    'plants.avg_health': '#3BB570',
    'plants.with_issues': '#DF5B59',
    'harvests.wet_weight_30d': '#1C9EFF',
    'trim.flower_30d': '#1C9EFF',
    'harvests.completed_30d': '#1C9EFF',
    'packages.active_grams': '#FA9E52',
    'packages.active': '#FA9E52',
    'tasks.open': '#5C5C5C',
};

const COMPARE_OPTIONS = [
    { days: 1, label: 'vs yesterday', basis: 'vs yesterday' },
    { days: 7, label: 'vs 7 days ago', basis: 'vs 7d ago' },
    { days: 30, label: 'vs 30 days ago', basis: 'vs 30d ago' },
];

export const FacilityOverview: React.FC = () => {
    const { user } = useAuth();
    const canCompute = user?.role === 'admin' || user?.role === 'director' || user?.role === 'owner';
    const [data, setData] = useState<MetricsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState<'now' | 'backfill' | null>(null);
    const [progress, setProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [compare, setCompare] = useState(7);
    const hasData = useRef(false);

    // A refetch (compare window change, after a recompute) holds the current
    // render at reduced opacity instead of flashing a loading state.
    const load = useCallback(async () => {
        if (hasData.current) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            setData(await apiService.getMetrics({ days: 90, compare }));
            hasData.current = true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load metrics');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [compare]);

    useEffect(() => { load(); }, [load]);

    // The server computes at most 14 days per request (function time limit), so a
    // 90-day backfill is a series of 7-day requests, oldest first.
    const compute = async (backfillDays?: number) => {
        setBusy(backfillDays ? 'backfill' : 'now');
        setError(null);
        setProgress(null);
        try {
            const failures: Array<{ date: string; key: string; error: string }> = [];
            if (!backfillDays) {
                const r = await apiService.computeMetricsNow({});
                failures.push(...r.failures);
            } else {
                const chunk = 7;
                const today = new Date();
                const chunks: Array<{ date: string; backfillDays: number }> = [];
                for (let offset = backfillDays; offset >= 0; offset -= chunk) {
                    const d = new Date(today);
                    d.setUTCDate(d.getUTCDate() - offset);
                    chunks.push({ date: d.toISOString().slice(0, 10), backfillDays: Math.min(chunk - 1, offset) });
                }
                let i = 0;
                for (const c of chunks) {
                    i++;
                    setProgress(`${i}/${chunks.length}`);
                    const end = new Date(`${c.date}T00:00:00Z`);
                    end.setUTCDate(end.getUTCDate() + c.backfillDays);
                    const endIso = end > today ? today.toISOString().slice(0, 10) : end.toISOString().slice(0, 10);
                    const r = await apiService.computeMetricsNow({ date: endIso, backfillDays: c.backfillDays });
                    failures.push(...r.failures);
                }
            }
            if (failures.length) setError(`${failures.length} metric run${failures.length === 1 ? '' : 's'} failed: ${[...new Set(failures.map(f => f.key))].join(', ')}`);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to compute metrics');
        } finally {
            setBusy(null);
            setProgress(null);
        }
    };

    const defs = useMemo(() => new Map((data?.definitions ?? []).map(d => [d.key, d])), [data]);
    const latestByKey = useMemo(() => new Map((data?.latest ?? []).filter(m => m.dimension === '').map(m => [m.key, m])), [data]);
    const seriesByKey = useMemo(() => {
        const out = new Map<string, number[]>();
        for (const [key, points] of Object.entries(data?.series ?? {})) {
            const facility = (points as MetricPoint[]).filter(p => p.dimension === '');
            if (facility.length > 1) out.set(key, facility.map(p => p.value));
        }
        return out;
    }, [data]);

    const tiles = useMemo(() => {
        const keys = [...TILE_ORDER.filter(k => latestByKey.has(k)), ...[...latestByKey.keys()].filter(k => !TILE_ORDER.includes(k) && k !== 'tasks.overdue')];
        return keys.map(k => ({ key: k, metric: latestByKey.get(k)!, def: defs.get(k) }));
    }, [latestByKey, defs]);

    const breakdowns = useMemo(() => {
        const groups = new Map<string, LatestMetric[]>();
        for (const m of data?.latest ?? []) {
            if (m.dimension === '') continue;
            (groups.get(m.key) ?? groups.set(m.key, []).get(m.key)!).push(m);
        }
        const keys = [...BREAKDOWN_ORDER.filter(k => groups.has(k)), ...[...groups.keys()].filter(k => !BREAKDOWN_ORDER.includes(k))];
        return keys.map(k => ({ key: k, def: defs.get(k), rows: groups.get(k)!.slice().sort((a, b) => b.value - a.value) }));
    }, [data, defs]);

    const snapshotDate = data?.latest.length ? data.latest.reduce((max, m) => (m.date > max ? m.date : max), '') : null;
    const lastRun = data?.runs?.[0];
    const basis = COMPARE_OPTIONS.find(o => o.days === (data?.compareDays ?? compare))?.basis;
    const hasHistory = (seriesByKey.get('plants.live')?.length ?? 0) >= 5;
    const overdue = latestByKey.get('tasks.overdue');

    if (loading && !data) {
        return <div className="report-loading-block">Loading facility metrics…</div>;
    }

    if (error && !data) {
        return <ErrorRetry message={error} onRetry={() => load()} />;
    }

    const toolbar = (
        <div className="report-toolbar">
            <div className="report-toolbar-status">
                {snapshotDate ? (
                    <>
                        <span className="report-toolbar-dot" />
                        <span>Snapshot from <strong>{formatSnapshotDate(snapshotDate)}</strong> · refreshed nightly</span>
                    </>
                ) : (
                    <span>No snapshots yet</span>
                )}
            </div>
            <div className="report-toolbar-actions">
                {snapshotDate && (
                    <select className="field-input report-toolbar-select" value={compare} onChange={e => setCompare(parseInt(e.target.value, 10))} aria-label="Compare against">
                        {COMPARE_OPTIONS.map(o => <option key={o.days} value={o.days}>{o.label}</option>)}
                    </select>
                )}
                {canCompute && (
                    <>
                        <button className="btn-ghost report-toolbar-btn" onClick={() => compute()} disabled={!!busy} title="Recompute today's snapshot now">
                            <RefreshCw size={13} className={busy === 'now' ? 'animate-spin' : ''} /> {busy === 'now' ? 'Computing…' : 'Recompute'}
                        </button>
                        {!hasHistory && snapshotDate && (
                            <button className="btn-ghost report-toolbar-btn" onClick={() => compute(90)} disabled={!!busy} title="Compute the last 90 days so trends show from day one">
                                <History size={13} /> {busy === 'backfill' ? `Backfilling ${progress ?? ''}…` : 'Backfill 90 days'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );

    if (!data || data.latest.length === 0) {
        return (
            <div className="report-section">
                {toolbar}
                {error && <p className="report-inline-error">{error}</p>}
                <div className="report-panel">
                    <EmptyState
                        icon={Activity}
                        title="No snapshots yet"
                        description={canCompute
                            ? 'Facility metrics are written nightly. Compute the first snapshot now, or backfill 90 days so trends show from day one.'
                            : 'Facility metrics are written nightly. The first snapshot will appear after tonight\'s run.'}
                        action={canCompute ? (
                            <div className="report-empty-actions">
                                <button className="btn-primary" onClick={() => compute()} disabled={!!busy}>
                                    <RefreshCw size={14} className={busy === 'now' ? 'animate-spin' : ''} /> {busy === 'now' ? 'Computing…' : 'Compute now'}
                                </button>
                                <button className="btn-secondary" onClick={() => compute(90)} disabled={!!busy}>
                                    <History size={14} /> {busy === 'backfill' ? `Backfilling ${progress ?? ''}…` : 'Backfill 90 days'}
                                </button>
                            </div>
                        ) : undefined}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={`report-section${refreshing ? ' report-section--refreshing' : ''}`}>
            {toolbar}
            {error && <p className="report-inline-error">{error}</p>}

            <div className="report-stat-grid">
                {tiles.map(({ key, metric, def }) => (
                    <StatTile
                        key={key}
                        label={tileLabel(def?.label ?? key)}
                        value={formatMetricValue(metric.value, def)}
                        delta={metricDelta(metric, def, basis)}
                        hint={key === 'tasks.open' && overdue ? `${Math.round(overdue.value)} overdue` : undefined}
                        trend={seriesByKey.get(key)}
                        accent={TILE_ACCENT[key] ?? '#5C5C5C'}
                        description={def?.description}
                    />
                ))}
            </div>

            {breakdowns.length > 0 && (
                <div className="report-breakdown-grid">
                    {breakdowns.map(({ key, def, rows }) => (
                        <BreakdownCard key={key} def={def} metricKey={key} rows={rows} basis={basis} />
                    ))}
                </div>
            )}

            {lastRun && (
                <p className="report-footnote">
                    Last run {new Date(lastRun.startedAt).toLocaleString()} · {lastRun.trigger}
                    {lastRun.status === 'succeeded' ? ` · ${lastRun.metricsWritten} rows` : ` · ${lastRun.status}`}
                    {lastRun.error ? ` · ${lastRun.error}` : ''}
                </p>
            )}
        </div>
    );
};

const BreakdownCard: React.FC<{ metricKey: string; def?: MetricDefinition; rows: LatestMetric[]; basis?: string }> = ({ metricKey, def, rows, basis }) => {
    const [expanded, setExpanded] = useState(false);
    const limit = 6;
    const shown = expanded ? rows : rows.slice(0, limit);
    const max = Math.max(...rows.map(r => r.value), 0) || 1;
    const bad = def?.goodWhenUp === false;
    const barColor = bad ? '#DF5B59' : '#3BB570';
    const label = (dim: string) => (def?.dimension === 'issue' ? contaminantLabel(dim) : dim.replace(/_/g, ' '));

    return (
        <div className="report-panel report-breakdown" title={def?.description}>
            <div className="report-panel-head">
                <h3 className="report-panel-title">{def?.label ?? metricKey}</h3>
                <span className="report-panel-sub">{dimensionCount(def?.dimension, rows.length)}</span>
            </div>
            <ul className="report-bars">
                {shown.map(m => {
                    const delta = metricDelta(m, def, basis);
                    return (
                        <li key={m.dimension} className="report-bar-row">
                            <span className="report-bar-label" title={m.dimension}>{label(m.dimension)}</span>
                            <span className="report-bar-track">
                                <span className="report-bar-fill" style={{ width: `${Math.max(2, (m.value / max) * 100)}%`, background: barColor }} />
                            </span>
                            <span className="report-bar-value">{formatMetricValue(m.value, def)}</span>
                            <span className="report-bar-delta">{delta ? <DeltaChip delta={{ ...delta, basis: undefined }} /> : null}</span>
                        </li>
                    );
                })}
            </ul>
            {rows.length > limit && (
                <button className="report-link-btn" onClick={() => setExpanded(v => !v)}>
                    {expanded ? 'Show fewer' : `Show all ${rows.length}`}
                </button>
            )}
        </div>
    );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { MetricsResponse, LatestMetric, MetricDefinition } from '../../services/apiService';
import { useAuth } from '../../contexts/authContext';
import { contaminantLabel } from '../../types/plantMap';

/**
 * Daily facility metrics from metric_snapshots: latest value per metric with
 * the change against a week earlier, plus the last compute run. Directors can
 * recompute today or backfill history.
 */
export const FacilityMetricsPanel: React.FC = () => {
    const { user } = useAuth();
    const canCompute = user?.role === 'admin' || user?.role === 'director' || user?.role === 'owner';
    const [data, setData] = useState<MetricsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [compare, setCompare] = useState(7);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await apiService.getMetrics({ days: 90, compare }));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load metrics');
        } finally {
            setLoading(false);
        }
    }, [compare]);

    useEffect(() => { load(); }, [load]);

    const compute = async (backfillDays?: number) => {
        setBusy(backfillDays ? 'backfill' : 'now');
        setError(null);
        try {
            const r = await apiService.computeMetricsNow(backfillDays ? { backfillDays } : {});
            if (r.failures.length) setError(`${r.failures.length} metric${r.failures.length === 1 ? '' : 's'} failed: ${[...new Set(r.failures.map(f => f.key))].join(', ')}`);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to compute metrics');
        } finally {
            setBusy(null);
        }
    };

    const defs = useMemo(() => new Map((data?.definitions ?? []).map(d => [d.key, d])), [data]);
    const facility = (data?.latest ?? []).filter(m => m.dimension === '');
    const dimensioned = useMemo(() => {
        const groups = new Map<string, LatestMetric[]>();
        for (const m of data?.latest ?? []) {
            if (m.dimension === '') continue;
            (groups.get(m.key) ?? groups.set(m.key, []).get(m.key)!).push(m);
        }
        return [...groups.entries()];
    }, [data]);
    const lastRun = data?.runs?.[0];

    return (
        <section className="facility-metrics">
            <div className="facility-metrics-header">
                <div className="flex items-center gap-2">
                    <Activity size={15} className="text-emerald-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Facility metrics</h3>
                    <span className="text-[11px] text-gray-400">computed daily</span>
                </div>
                <div className="flex items-center gap-2">
                    <select className="field-input facility-metrics-select" value={compare} onChange={e => setCompare(parseInt(e.target.value, 10))} title="Compare against">
                        <option value={1}>vs yesterday</option>
                        <option value={7}>vs 7 days ago</option>
                        <option value={30}>vs 30 days ago</option>
                    </select>
                    {canCompute && (
                        <>
                            <button className="btn-secondary text-xs px-2.5 py-1.5" onClick={() => compute()} disabled={!!busy} title="Recompute today's snapshot">
                                <RefreshCw size={12} className={busy === 'now' ? 'animate-spin' : ''} /> Recompute now
                            </button>
                            {(data?.latest.length ?? 0) < 5 && (
                                <button className="btn-secondary text-xs px-2.5 py-1.5" onClick={() => compute(90)} disabled={!!busy} title="Compute the last 90 days so trends show from day one">
                                    {busy === 'backfill' ? 'Backfilling…' : 'Backfill 90 days'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

            {loading && !data ? (
                <p className="text-xs text-gray-400 py-6 text-center">Loading metrics…</p>
            ) : !data || data.latest.length === 0 ? (
                <div className="facility-metrics-empty">
                    <p>No snapshots yet. The first one is written by tonight's scheduled run{canCompute ? ', or press Recompute now' : ''}.</p>
                </div>
            ) : (
                <>
                    <div className="facility-metrics-grid">
                        {facility.map(m => <MetricTile key={m.key} metric={m} def={defs.get(m.key)} compare={data.compareDays} />)}
                    </div>

                    {dimensioned.length > 0 && (
                        <div className="facility-metrics-dims">
                            {dimensioned.map(([key, rows]) => {
                                const def = defs.get(key);
                                const shown = rows.slice(0, 8);
                                return (
                                    <div key={key} className="facility-metrics-dim">
                                        <div className="facility-metrics-dim-title" title={def?.description}>{def?.label ?? key}</div>
                                        <table className="room-map-mini-table">
                                            <tbody>
                                                {shown.map(m => (
                                                    <tr key={m.dimension}>
                                                        <td>{def?.dimension === 'issue' ? contaminantLabel(m.dimension) : m.dimension}</td>
                                                        <td style={{ textAlign: 'right' }}>{formatValue(m.value, def)}</td>
                                                        <td style={{ textAlign: 'right', width: 70 }}><Change metric={m} def={def} /></td>
                                                    </tr>
                                                ))}
                                                {rows.length > shown.length && (
                                                    <tr><td colSpan={3} className="text-gray-400">+{rows.length - shown.length} more</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {lastRun && (
                        <p className="text-[11px] text-gray-400 mt-3">
                            Last run {new Date(lastRun.startedAt).toLocaleString()} · {lastRun.trigger} · {lastRun.status}{lastRun.status === 'succeeded' ? ` · ${lastRun.metricsWritten} rows` : ''}{lastRun.error ? ` · ${lastRun.error}` : ''}
                        </p>
                    )}
                </>
            )}
        </section>
    );
};

export function formatValue(value: number, def?: MetricDefinition): string {
    if (!def) return String(value);
    switch (def.kind) {
        case 'ratio': return `${Math.round(value * 1000) / 10}%`;
        case 'grams': return value >= 1000 ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg` : `${Math.round(value).toLocaleString()} g`;
        case 'gauge': return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
        default: return Math.round(value).toLocaleString();
    }
}

const Change: React.FC<{ metric: LatestMetric; def?: MetricDefinition }> = ({ metric, def }) => {
    if (metric.change == null) return <span className="text-gray-300">—</span>;
    if (metric.change === 0) return <span className="text-gray-400 inline-flex items-center gap-1"><Minus size={10} /> 0</span>;
    const up = metric.change > 0;
    const good = def?.goodWhenUp == null ? null : def.goodWhenUp === up;
    const color = good == null ? '#6b7280' : good ? '#2E9A5C' : '#C44442';
    const text = def?.kind === 'ratio'
        ? `${up ? '+' : ''}${Math.round(metric.change * 1000) / 10} pts`
        : metric.changePct != null ? `${up ? '+' : ''}${metric.changePct}%` : `${up ? '+' : ''}${formatValue(metric.change, def)}`;
    return (
        <span className="inline-flex items-center gap-1 tabular-nums" style={{ color }} title={`was ${formatValue(metric.previous ?? 0, def)}`}>
            {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />} {text}
        </span>
    );
};

const MetricTile: React.FC<{ metric: LatestMetric; def?: MetricDefinition; compare: number }> = ({ metric, def, compare }) => (
    <div className="facility-metric-tile" title={def?.description}>
        <div className="facility-metric-label">{def?.label ?? metric.key}</div>
        <div className="facility-metric-value">{formatValue(metric.value, def)}</div>
        <div className="facility-metric-change"><Change metric={metric} def={def} /> <span className="text-gray-300">· {compare}d</span></div>
    </div>
);

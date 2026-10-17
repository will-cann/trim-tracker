import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Scissors, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getReportsData, shiftWeek, formatDateRange, getWeekRange, isSameRange, DEFAULT_HOURLY_WAGE, type ReportsData, type DateRange, type TrimmerStat } from '../../services/reportsData';
import { useAuth } from '../../contexts/authContext';
import { DataTable, EmptyState } from '../ui';
import type { Column } from '../ui';
import { ErrorRetry } from '../ErrorRetry';
import { PageSkeleton } from '../Skeleton';
import { StatTile } from './StatTile';
import { formatLbs, formatHours, formatMoney } from './format';
import { CHART_ACCENT, CHART_CHROME, CHART_TOOLTIP_STYLE } from '../../lib/chartColors';

/**
 * Trim performance: one week of completed trim sessions. Output and labor
 * headline figures, daily output and hours as two single-axis charts, and
 * the per-trimmer table. Executives also see the labor-cost estimate.
 */
export const TrimPerformance: React.FC = () => {
    const { user } = useAuth();
    const isExecutive = user?.role === 'admin' || user?.role === 'owner';
    const [data, setData] = useState<ReportsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [wage, setWage] = useState<number>(DEFAULT_HOURLY_WAGE);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const requestId = useRef(0);

    // Loading/error flip in the handlers that change the week (and in the
    // initial state), so the effect only fetches.
    const changeRange = (range: DateRange | undefined) => {
        setLoading(true);
        setError(null);
        setDateRange(range);
    };

    useEffect(() => {
        const id = ++requestId.current;
        getReportsData(dateRange)
            .then(result => {
                if (id !== requestId.current) return;
                setData(result);
                if (!dateRange) setDateRange(result.dateRange);
            })
            .catch(e => {
                if (id !== requestId.current) return;
                setError(e instanceof Error ? e.message : 'Failed to load reports');
            })
            .finally(() => { if (id === requestId.current) setLoading(false); });
    }, [dateRange]);

    const latestWeek = data?.availableRange ? getWeekRange(data.availableRange.end) : null;
    const onLatestWeek = !!(latestWeek && dateRange && isSameRange(latestWeek, dateRange));

    const weekNav = dateRange ? (
        <div className="report-week-nav">
            <button type="button" onClick={() => changeRange(shiftWeek(dateRange, -1))} aria-label="Previous week" className="dashboard-header-nav-btn">
                <ChevronLeft size={18} />
            </button>
            <span className="report-week-label">{formatDateRange(dateRange)}</span>
            <button type="button" onClick={() => changeRange(shiftWeek(dateRange, 1))} aria-label="Next week" className="dashboard-header-nav-btn">
                <ChevronRight size={18} />
            </button>
        </div>
    ) : null;

    const toolbar = (
        <div className="report-toolbar">
            <div className="report-toolbar-status">
                {weekNav}
                {latestWeek && !onLatestWeek && (
                    <button className="report-link-btn" onClick={() => changeRange(latestWeek)}>
                        Latest week with data <ArrowRight size={12} />
                    </button>
                )}
            </div>
            {data && data.summary.sessionCount > 0 && (
                <div className="report-toolbar-actions">
                    <span className="report-toolbar-count">{data.summary.sessionCount} session{data.summary.sessionCount === 1 ? '' : 's'}</span>
                </div>
            )}
        </div>
    );

    if (loading && !data) return <PageSkeleton label="Loading trim performance…" />;

    if (error) {
        return (
            <div className="report-section">
                {toolbar}
                <div className="report-panel"><ErrorRetry message={error} onRetry={() => changeRange(dateRange ? { ...dateRange } : undefined)} /></div>
            </div>
        );
    }

    if (!data || data.summary.sessionCount === 0) {
        return (
            <div className="report-section">
                {toolbar}
                <div className="report-panel">
                    <EmptyState
                        icon={Scissors}
                        title={data?.availableRange ? 'No sessions this week' : 'No completed trim sessions yet'}
                        description={data?.availableRange
                            ? 'Nothing was completed in this week. Browse to another week, or jump to the most recent one with data.'
                            : 'Trim performance is built from completed sessions. Start one from the Trim Tracker and submit it to see output, hours and per-trimmer rates here.'}
                        action={latestWeek && !onLatestWeek ? (
                            <button className="btn-primary" onClick={() => changeRange(latestWeek)}>
                                Go to latest week with data <ArrowRight size={14} />
                            </button>
                        ) : undefined}
                    />
                </div>
            </div>
        );
    }

    const { summary, throughput, trimmerStats } = data;
    const laborCost = summary.trimLaborHours * wage;
    const costPerLb = summary.flowerTrimmedLbs > 0 ? laborCost / summary.flowerTrimmedLbs : 0;

    return (
        <div className={`report-section${loading ? ' report-section--refreshing' : ''}`}>
            {toolbar}

            <div className="report-stat-grid report-stat-grid--4">
                <StatTile label="Flower trimmed" value={formatLbs(summary.flowerTrimmedLbs)} unit="lb" accent={CHART_ACCENT.flower} hint={summary.shakeLbs > 0 ? `${formatLbs(summary.shakeLbs)} lb shake` : undefined} />
                <StatTile label="Trim" value={formatLbs(summary.trimLbs)} unit="lb" accent={CHART_ACCENT.trim} />
                <StatTile label="Labor" value={formatHours(summary.trimLaborHours)} unit="hrs" accent={CHART_ACCENT.neutral} hint={`${trimmerStats.length} trimmer${trimmerStats.length === 1 ? '' : 's'}`} />
                <StatTile label="Throughput" value={Math.round(summary.avgGramsPerHour).toLocaleString()} unit="g / hr" accent={CHART_ACCENT.flower} hint="all material, per labor hour" />
            </div>

            {isExecutive && (
                <div className="report-panel report-cost">
                    <div className="report-cost-input">
                        <label className="report-stat-label" htmlFor="trim-wage">Hourly wage</label>
                        <div className="report-cost-field">
                            <span>$</span>
                            <input id="trim-wage" type="number" min={0} step={0.5} value={wage} onChange={e => setWage(Math.max(0, parseFloat(e.target.value) || 0))} className="field-input" />
                        </div>
                    </div>
                    <div className="report-cost-figure">
                        <div className="report-stat-label">Estimated labor cost</div>
                        <div className="report-stat-value">{formatMoney(laborCost)}</div>
                    </div>
                    <div className="report-cost-figure">
                        <div className="report-stat-label">Labor cost per lb of flower</div>
                        <div className="report-stat-value">{formatMoney(costPerLb, 2)}</div>
                    </div>
                    <p className="report-cost-note">An estimate from logged shift times × this wage. Adjust the wage to match your crew.</p>
                </div>
            )}

            <div className="report-chart-grid">
                <div className="report-panel">
                    <div className="report-panel-head">
                        <h3 className="report-panel-title">Daily output</h3>
                        <span className="report-panel-sub">lb per day</span>
                    </div>
                    <div className="report-chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={throughput} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%">
                                <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
                                <XAxis dataKey="date" tick={CHART_CHROME.axisTick} axisLine={false} tickLine={false} />
                                <YAxis tick={CHART_CHROME.axisTick} axisLine={false} tickLine={false} width={44} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(0,0,0,0.03)' }} formatter={(v: number) => `${formatLbs(v)} lb`} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="flowerLbs" name="Flower" stackId="out" fill={CHART_ACCENT.flower} stroke="#fff" strokeWidth={2} maxBarSize={36} />
                                <Bar dataKey="trimLbs" name="Trim" stackId="out" fill={CHART_ACCENT.trim} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="report-panel">
                    <div className="report-panel-head">
                        <h3 className="report-panel-title">Labor hours</h3>
                        <span className="report-panel-sub">logged shift time per day</span>
                    </div>
                    <div className="report-chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={throughput} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%">
                                <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
                                <XAxis dataKey="date" tick={CHART_CHROME.axisTick} axisLine={false} tickLine={false} />
                                <YAxis tick={CHART_CHROME.axisTick} axisLine={false} tickLine={false} width={44} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(0,0,0,0.03)' }} formatter={(v: number) => `${formatHours(v)} hrs`} />
                                <Bar dataKey="laborHours" name="Hours" fill={CHART_ACCENT.neutral} radius={[4, 4, 0, 0]} maxBarSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <TrimmerTable rows={trimmerStats} />
        </div>
    );
};

type SortKey = 'name' | 'totalGrams' | 'gramsPerHour' | 'flowerRatio' | 'laborHours';

const TrimmerTable: React.FC<{ rows: TrimmerStat[] }> = ({ rows }) => {
    const [sortKey, setSortKey] = useState<SortKey>('gramsPerHour');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const sorted = useMemo(() => {
        const list = rows.slice();
        list.sort((a, b) => {
            const av = a[sortKey]; const bv = b[sortKey];
            const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return list;
    }, [rows, sortKey, sortDir]);

    const onSort = (key: string) => {
        if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key as SortKey); setSortDir(key === 'name' ? 'asc' : 'desc'); }
    };

    const maxRate = Math.max(...rows.map(r => r.gramsPerHour), 0) || 1;

    const columns: Column<TrimmerStat>[] = [
        {
            key: 'name', label: 'Trimmer', sortable: true,
            render: r => <span style={{ fontWeight: 600 }}>{r.name}</span>,
        },
        {
            key: 'gramsPerHour', label: 'g / hr', sortable: true, width: 220,
            render: r => (
                <span className="report-table-bar">
                    <span className="report-bar-track"><span className="report-bar-fill" style={{ width: `${Math.max(2, (r.gramsPerHour / maxRate) * 100)}%`, background: CHART_ACCENT.flower }} /></span>
                    <span className="tabular-nums">{Math.round(r.gramsPerHour).toLocaleString()}</span>
                </span>
            ),
        },
        {
            key: 'totalGrams', label: 'Output', sortable: true, width: 110, align: 'right',
            render: r => <span className="tabular-nums">{formatLbs(r.totalGrams / 453.592)} lb</span>,
        },
        {
            key: 'flowerRatio', label: 'Flower share', sortable: true, width: 120, align: 'right',
            render: r => <span className="tabular-nums">{Math.round(r.flowerRatio * 100)}%</span>,
        },
        {
            key: 'laborHours', label: 'Hours', sortable: true, width: 90, align: 'right',
            render: r => <span className="tabular-nums">{formatHours(r.laborHours)}</span>,
        },
    ];

    return (
        <div className="report-panel report-panel--flush">
            <div className="report-panel-head report-panel-head--padded">
                <h3 className="report-panel-title">By trimmer</h3>
                <span className="report-panel-sub">rate is all material per logged hour</span>
            </div>
            <DataTable columns={columns} data={sorted} sortKey={sortKey} sortDir={sortDir} onSort={onSort} emptyMessage="No trimmer shifts logged this week." />
        </div>
    );
};

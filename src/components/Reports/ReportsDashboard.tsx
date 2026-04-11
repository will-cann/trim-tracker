import React, { useEffect, useState } from 'react';
import { TrimmerStatsTable } from './TrimmerStatsTable';
import { CostRatioChart } from './CostRatioChart';
import { TrimmerPerformanceChart } from './TrimmerPerformanceChart';
import { MetricCard } from './MetricCard';
import { ThroughputChart } from './ThroughputChart';
import { CostMetricsRow } from './CostMetricsRow';
import { ReportsBuilder } from './ReportsBuilder';
import { getReportsData, shiftWeek, formatDateRange, type ReportsData, type DateRange } from '../../services/reportsData';
import { ChevronLeft, ChevronRight, MoreVertical, ChevronUp, BarChart3 } from 'lucide-react';
import { PageSkeleton } from '../Skeleton';
import { useAuth } from '../../contexts/authContext';
import { DashboardHeader, EmptyState } from '../ui';

type ReportsTab = 'dashboards' | 'trim-performance';

export const ReportsDashboard: React.FC = () => {
    const { user } = useAuth();
    const isExecutive = user?.role === 'admin' || user?.role === 'owner';
    const [activeTab] = useState<ReportsTab>('trim-performance');
    const [data, setData] = useState<ReportsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [customWage, setCustomWage] = useState<number>(15);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        loadData(dateRange);
    }, [dateRange]);

    const loadData = async (range?: DateRange) => {
        setLoading(true);
        const reportsData = await getReportsData(range);
        setData(reportsData);
        if (reportsData && !range) {
            setCustomWage(reportsData.summary.avgHourlyWage);
            setDateRange(reportsData.dateRange);
        }
        setLoading(false);
    };

    const handlePrev = () => {
        if (dateRange) setDateRange(shiftWeek(dateRange, -1));
    };

    const handleNext = () => {
        if (dateRange) setDateRange(shiftWeek(dateRange, 1));
    };

    const dateRangeNav = dateRange ? (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#FFFFFF',
                padding: '4px 6px',
                borderRadius: 8,
                border: '1px solid #E0E0E0',
            }}
        >
            <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous week"
                className="dashboard-header-nav-btn"
            >
                <ChevronLeft size={18} />
            </button>
            <span
                className="text-body"
                style={{
                    color: '#1A1A1A',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                    padding: '0 6px',
                }}
            >
                {formatDateRange(dateRange)}
            </span>
            <button
                type="button"
                onClick={handleNext}
                aria-label="Next week"
                className="dashboard-header-nav-btn"
            >
                <ChevronRight size={18} />
            </button>
        </div>
    ) : null;

    const renderTrimPerformance = () => {
        if (loading) {
            return <PageSkeleton label="Loading reports…" />;
        }

        if (!data || data.summary.trimLaborHours === 0) {
            return (
                <EmptyState
                    icon={BarChart3}
                    title="No data for this week"
                    description="No completed trim sessions in this period. Use the arrows above to browse other weeks, or start a new session from the Trim Tracker."
                />
            );
        }

        const { summary } = data;
        const estimatedLaborCost = summary.trimLaborHours * customWage;
        const avgLaborCostPerLb = summary.flowerTrimmedLbs > 0 ? estimatedLaborCost / summary.flowerTrimmedLbs : 0;

        return (
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard value={summary.trimLaborHours} label="Trim Labor Hours" variant="trim" />
                    <MetricCard value={summary.avgGramsPerHour} label="Avg g/hour" variant="flower" />
                    <MetricCard value={summary.flowerTrimmedLbs} label="Flower Trimmed (LBs)" variant="flower" />
                    <MetricCard value={summary.trimLbs} label="Trim (LBs)" variant="shake" />
                </div>

                {isExecutive && (
                    <CostMetricsRow
                        hourlyWage={customWage}
                        estimatedLaborCost={estimatedLaborCost}
                        avgLaborCostPerLb={avgLaborCostPerLb}
                        onUpdateWage={setCustomWage}
                    />
                )}

                <div className="space-y-8">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-200 bg-white">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-900">Throughput and Labor Hours</h3>
                                <div className="flex gap-2">
                                    <button className="text-gray-400 hover:text-gray-600 transition-colors"><MoreVertical size={20} /></button>
                                    <button className="text-gray-400 hover:text-gray-600 transition-colors"><ChevronUp size={20} /></button>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 h-96" style={{ height: '384px' }}>
                            <ThroughputChart data={data.throughput} />
                        </div>
                    </div>

                    <TrimmerStatsTable data={data.trimmerStats} />
                    {isExecutive && <CostRatioChart data={data.costRatio} />}
                    <TrimmerPerformanceChart data={data.trimmerPerformance} trimmerStats={data.trimmerStats} />
                </div>
            </div>
        );
    };

    return (
        <div className="reports-dashboard">
            <DashboardHeader
                eyebrow="Reports"
                title="Trim Performance"
                density="compact"
                actions={dateRangeNav}
            />

            {/* Tab content */}
            {activeTab === 'dashboards' ? <ReportsBuilder /> : renderTrimPerformance()}
        </div>
    );
};

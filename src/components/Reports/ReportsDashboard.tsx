import React, { useEffect, useState } from 'react';
import { TrimmerStatsTable } from './TrimmerStatsTable';
import { CostRatioChart } from './CostRatioChart';
import { TrimmerPerformanceChart } from './TrimmerPerformanceChart';
import { MetricCard } from './MetricCard';
import { ThroughputChart } from './ThroughputChart';
import { CostMetricsRow } from './CostMetricsRow';
import { getReportsData, shiftWeek, formatDateRange, type ReportsData, type DateRange } from '../../services/reportsData';
import { ChevronLeft, ChevronRight, MoreVertical, ChevronUp, BarChart3 } from 'lucide-react';
import { PageSkeleton } from '../Skeleton';
import { useAuth } from '../../contexts/authContext';

export const ReportsDashboard: React.FC = () => {
    const { user } = useAuth();
    const isExecutive = user?.role === 'admin' || user?.role === 'owner';
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

    if (loading) {
        return (
            <div className="reports-dashboard p-8 max-w-7xl mx-auto">
                <PageSkeleton />
            </div>
        );
    }

    if (!data || data.summary.trimLaborHours === 0) {
        return (
            <div className="reports-dashboard p-8 max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Trim Tracker Report</h1>
                    {dateRange && (
                        <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                            <button
                                onClick={handlePrev}
                                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-medium text-green-600 whitespace-nowrap">
                                {formatDateRange(dateRange)}
                            </span>
                            <button
                                onClick={handleNext}
                                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    )}
                </div>
                <div className="bg-white p-12 rounded-xl border border-gray-100 shadow-sm text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mb-4 mx-auto">
                        <BarChart3 size={28} className="text-gray-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">No data for this week</h3>
                    <p className="text-sm text-gray-400 max-w-sm mx-auto">
                        No completed trim sessions in this period. Use the arrows above to browse other weeks,
                        or start a new session from the Trim Tracker.
                    </p>
                </div>
            </div>
        );
    }

    const { summary } = data;

    // Recalculate costs based on custom wage
    const estimatedLaborCost = summary.trimLaborHours * customWage;
    const avgLaborCostPerLb = summary.flowerTrimmedLbs > 0 ? estimatedLaborCost / summary.flowerTrimmedLbs : 0;

    return (
        <div className="reports-dashboard p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Trim Tracker Report</h1>
                {dateRange && (
                    <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                        <button
                            onClick={handlePrev}
                            className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-sm font-medium text-green-600 whitespace-nowrap">
                            {formatDateRange(dateRange)}
                        </span>
                        <button
                            onClick={handleNext}
                            className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}
            </div>

            {/* Top Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    value={summary.trimLaborHours}
                    label="Trim Labor Hours"
                    color="blue"
                />
                <MetricCard
                    value={summary.avgGramsPerHour}
                    label="Avg g/hour"
                    color="green"
                />
                <MetricCard
                    value={summary.flowerTrimmedLbs}
                    label="Flower Trimmed (LBs)"
                    color="purple"
                />
                <MetricCard
                    value={summary.trimLbs}
                    label="Trim (LBs)"
                    color="red"
                />
            </div>

            {/* Cost Calculator Section — executive only */}
            {isExecutive && (
                <CostMetricsRow
                    hourlyWage={customWage}
                    estimatedLaborCost={estimatedLaborCost}
                    avgLaborCostPerLb={avgLaborCostPerLb}
                    onUpdateWage={setCustomWage}
                />
            )}

            {/* Charts Section */}
            <div className="space-y-8">
                {/* Throughput Chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-200 bg-white">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">Throughput and Labor Hours</h3>
                            <div className="flex gap-2">
                                <button className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <MoreVertical size={20} />
                                </button>
                                <button className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <ChevronUp size={20} />
                                </button>
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

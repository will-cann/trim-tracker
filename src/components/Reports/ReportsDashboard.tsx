import React, { useEffect, useState } from 'react';
import { TrimmerStatsTable } from './TrimmerStatsTable';
import { CostRatioChart } from './CostRatioChart';
import { TrimmerPerformanceChart } from './TrimmerPerformanceChart';
import { MetricCard } from './MetricCard';
import { ThroughputChart } from './ThroughputChart';
import { CostMetricsRow } from './CostMetricsRow';
import { getReportsData, shiftWeek, formatDateRange, type ReportsData, type DateRange } from '../../services/reportsData';
import { ChevronLeft, ChevronRight, MoreVertical, ChevronUp } from 'lucide-react';

export const ReportsDashboard: React.FC = () => {
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
                <div className="flex items-center justify-center h-64">
                    <div className="text-gray-500">Loading reports...</div>
                </div>
            </div>
        );
    }

    if (!data || data.summary.trimLaborHours === 0) {
        return (
            <div className="reports-dashboard p-8 max-w-7xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-8">Trim Tracker Report</h1>
                <div className="bg-white p-12 rounded-xl border border-gray-100 shadow-sm text-center">
                    <div className="text-gray-400 mb-4">
                        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Yet</h3>
                    <p className="text-gray-600">Submit some trim sessions to see reports and analytics.</p>
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

            {/* Cost Calculator Section */}
            <CostMetricsRow
                hourlyWage={customWage}
                estimatedLaborCost={estimatedLaborCost}
                avgLaborCostPerLb={avgLaborCostPerLb}
                onUpdateWage={setCustomWage}
            />

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

                <CostRatioChart data={data.costRatio} />

                <TrimmerPerformanceChart data={data.trimmerPerformance} trimmerStats={data.trimmerStats} />
            </div>

        </div>
    );
};

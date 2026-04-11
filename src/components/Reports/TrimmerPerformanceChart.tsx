import React, { useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer

} from 'recharts';
import type { TrimmerPerformanceData, TrimmerStat } from '../../services/reportsData';
import { MoreVertical } from 'lucide-react';
import { CHART_PALETTE, CHART_CHROME, CHART_TOOLTIP_STYLE } from '../../lib/chartColors';

interface TrimmerPerformanceChartProps {
    data: TrimmerPerformanceData[];
    trimmerStats: TrimmerStat[];
}

export const TrimmerPerformanceChart: React.FC<TrimmerPerformanceChartProps> = ({ data, trimmerStats }) => {
    // Get all trimmer names from the stats
    const allTrimmerNames = trimmerStats.map(t => t.name);

    // Initialize with first 3 trimmers (or all if less than 3)
    const [selectedTrimmers, setSelectedTrimmers] = useState<string[]>(
        allTrimmerNames.slice(0, Math.min(3, allTrimmerNames.length))
    );

    const toggleTrimmer = (name: string) => {
        if (selectedTrimmers.includes(name)) {
            setSelectedTrimmers(selectedTrimmers.filter(t => t !== name));
        } else {
            setSelectedTrimmers([...selectedTrimmers, name]);
        }
    };

    const toggleSelectAll = () => {
        if (selectedTrimmers.length === allTrimmerNames.length) {
            setSelectedTrimmers([]);
        } else {
            setSelectedTrimmers(allTrimmerNames);
        }
    };

    const colors = CHART_PALETTE;

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">Grams Per Hour by Trimmer</h3>
                <div className="flex gap-2">
                    <button className="text-gray-400 hover:text-gray-600"><MoreVertical size={20} /></button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Sidebar for selection */}
                <div className="w-full lg:w-64 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="checkbox"
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            checked={selectedTrimmers.length === allTrimmerNames.length && allTrimmerNames.length > 0}
                            onChange={toggleSelectAll}
                        />
                        <span className="text-sm font-semibold text-gray-700">Select All</span>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {allTrimmerNames.map((name, index) => (
                            <div key={name} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={selectedTrimmers.includes(name)}
                                    onChange={() => toggleTrimmer(name)}
                                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <div className={`w-3 h-3 rounded-sm`} style={{ backgroundColor: colors[index % colors.length] }}></div>
                                <span className="text-sm text-gray-600">{name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chart */}
                <div className="flex-1 h-80 w-full min-w-0" style={{ height: '320px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            margin={{
                                top: 20,
                                right: 20,
                                bottom: 20,
                                left: 20,
                            }}
                        >
                            <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
                            <XAxis
                                dataKey="date"
                                scale="point"
                                padding={{ left: 30, right: 30 }}
                                tick={CHART_CHROME.axisTick}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={CHART_CHROME.axisTick}
                                axisLine={false}
                                tickLine={false}
                                label={{ value: 'Grams Per Hour (AVG)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: CHART_CHROME.axisLabel, fontSize: 12 } }}
                            />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            {selectedTrimmers.map((name, index) => (
                                <Line
                                    key={name}
                                    type="monotone"
                                    dataKey={name}
                                    stroke={colors[index % colors.length]}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

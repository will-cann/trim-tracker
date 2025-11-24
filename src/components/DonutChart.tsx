import React from 'react';
import { PieChart, Pie, ResponsiveContainer, Cell, Legend } from 'recharts';
import type { TrimEntry } from '../types/definitions';

interface DonutChartProps {
    entry: TrimEntry;
}

const COLORS = {
    flower: '#10B981', // Emerald 500
    shake: '#F59E0B',  // Amber 500
    trim: '#8B5CF6',   // Violet 500
    waste: '#EF4444',  // Red 500
    remaining: '#E5E7EB', // Gray 200
    empty: '#E0E0E0'   // Grey for empty state
};

export const DonutChart: React.FC<DonutChartProps & { showLegend?: boolean; height?: number }> = ({
    entry,
    showLegend = true,
    height = 200
}) => {
    const { flowerWeight, shakeWeight, trimWeight, wasteWeight, startWeight } = entry;
    const totalWeight = flowerWeight + shakeWeight + trimWeight + wasteWeight;
    const remaining = Math.max(0, startWeight - totalWeight);

    const data = [
        { name: 'Flower', value: flowerWeight, fill: COLORS.flower },
        { name: 'Shake', value: shakeWeight, fill: COLORS.shake },
        { name: 'Trim', value: trimWeight, fill: COLORS.trim },
        { name: 'Waste', value: wasteWeight, fill: COLORS.waste },
        { name: 'Remaining', value: remaining, fill: COLORS.remaining },
    ].filter(item => item.value > 0);

    // If no data (and no remaining), show a grey placeholder
    const chartData = data.length > 0 ? data : [{ name: 'Empty', value: 1, fill: COLORS.empty }];

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={60}
                        paddingAngle={2}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                        ))}
                    </Pie>
                    {showLegend && data.length > 0 && (
                        <Legend
                            layout="vertical"
                            align="right"
                            verticalAlign="middle"
                            iconType="circle"
                            formatter={(value, entry: any) => (
                                <span style={{ color: '#333', fontWeight: 500 }}>
                                    {value} <span style={{ color: '#888', marginLeft: 4 }}>({entry.payload.value.toFixed(0)}g)</span>
                                </span>
                            )}
                        />
                    )}
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

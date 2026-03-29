import React from 'react';
import { PieChart, Pie, ResponsiveContainer, Cell, Label } from 'recharts';
import type { TrimEntry } from '../types/definitions';

interface DonutChartProps {
    entry: TrimEntry;
}

const COLORS = {
    flower: '#3BB570', // chameleon
    shake: '#FA9E52',  // lion
    trim: '#1C9EFF',   // macaw
    waste: '#DF5B59',  // cardinal
    remaining: '#E0E0E0',
    empty: '#E0E0E0'   // Grey for empty state
};

export const DonutChart: React.FC<DonutChartProps & { showLegend?: boolean; height?: number }> = ({
    entry,
    height = 200
}) => {
    const { flowerWeight, shakeWeight, trimWeight, wasteWeight, startWeight } = entry;
    const totalWeight = flowerWeight + shakeWeight + trimWeight + wasteWeight;
    const remaining = Math.max(0, startWeight - totalWeight);
    const percentComplete = startWeight > 0 ? Math.min(100, Math.round((totalWeight / startWeight) * 100)) : 0;

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
                        <Label
                            value={`${percentComplete}%`}
                            position="center"
                            fill="#374151"
                            style={{
                                fontSize: '1.2rem',
                                fontWeight: 'bold',
                                fontFamily: 'var(--font-family)'
                            }}
                        />
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

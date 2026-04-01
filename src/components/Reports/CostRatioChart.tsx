import React from 'react';
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import type { CostMetric } from '../../services/reportsData';
import { MoreVertical } from 'lucide-react';

interface CostRatioChartProps {
    data: CostMetric[];
}

export const CostRatioChart: React.FC<CostRatioChartProps> = ({ data }) => {

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">Relationship btw AVG Labor Cost/Lb to Flower/Trim Ratio</h3>
                <div className="flex gap-2">
                    <button className="text-gray-400 hover:text-gray-600"><MoreVertical size={20} /></button>
                </div>
            </div>
            <div className="h-80 w-full min-w-0" style={{ height: '320px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={data}
                        margin={{
                            top: 20,
                            right: 20,
                            bottom: 20,
                            left: 20,
                        }}
                    >
                        <CartesianGrid stroke="#f5f5f5" vertical={false} />
                        <XAxis
                            dataKey="date"
                            scale="point"
                            padding={{ left: 30, right: 30 }}
                            tick={{ fontSize: 12, fill: '#959595' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 12, fill: '#959595' }}
                            axisLine={false}
                            tickLine={false}
                            label={{ value: 'Estimated Labor Cost Per LB (AVG)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#959595', fontSize: 12 } }}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 12, fill: '#959595' }}
                            axisLine={false}
                            tickLine={false}
                            label={{ value: 'Flower Ratio x100 (AVG)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#959595', fontSize: 12 } }}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Legend iconType="square" />
                        <Line yAxisId="right" type="monotone" dataKey="flowerRatio" name="Flower Ratio" stroke="#59A14F" strokeWidth={3} dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="costPerLb" name="Estimated Cost Per Gram" stroke="#4E79A7" strokeWidth={3} dot={{ r: 4, fill: '#4E79A7', strokeWidth: 2, stroke: '#fff' }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

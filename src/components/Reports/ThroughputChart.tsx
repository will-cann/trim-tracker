import React from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import type { DailyThroughput } from '../../services/reportsData';

interface ThroughputChartProps {
    data: DailyThroughput[];
}

export const ThroughputChart: React.FC<ThroughputChartProps> = ({ data }) => {

    return (
        <div className="h-full w-full min-h-[300px] min-w-0">
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
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 12, fill: '#959595' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Legend iconType="circle" />
                    <Bar yAxisId="left" dataKey="flowerLbs" name="Flower (LBs)" stackId="a" fill="#4E79A7" radius={[0, 0, 4, 4]} barSize={40} />
                    <Bar yAxisId="left" dataKey="trimLbs" name="Trim (LBs)" stackId="a" fill="#76B7B2" radius={[4, 4, 0, 0]} barSize={40} />
                    <Line yAxisId="right" type="monotone" dataKey="laborHours" name="Labor Hours" stroke="#E15759" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

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
import { CHART_ACCENT, CHART_CHROME, CHART_TOOLTIP_STYLE } from '../../lib/chartColors';

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
                        yAxisId="left"
                        tick={CHART_CHROME.axisTick}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={CHART_CHROME.axisTick}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend iconType="circle" />
                    <Bar yAxisId="left" dataKey="flowerLbs" name="Flower (LBs)" stackId="a" fill={CHART_ACCENT.flower} radius={[0, 0, 4, 4]} barSize={40} />
                    <Bar yAxisId="left" dataKey="trimLbs" name="Trim (LBs)" stackId="a" fill={CHART_ACCENT.trim} radius={[4, 4, 0, 0]} barSize={40} />
                    <Line yAxisId="right" type="monotone" dataKey="laborHours" name="Labor Hours" stroke={CHART_ACCENT.labor} strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

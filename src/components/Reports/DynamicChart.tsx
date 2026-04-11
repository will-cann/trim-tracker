import React from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  ComposedChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ReportSpec } from '../../types/definitions';
import { CHART_PALETTE, CHART_CHROME, CHART_TOOLTIP_STYLE } from '../../lib/chartColors';

const COLORS = CHART_PALETTE;
const TOOLTIP_STYLE = CHART_TOOLTIP_STYLE;
const AXIS_TICK = CHART_CHROME.axisTick;

interface DynamicChartProps {
  spec: ReportSpec;
  data: Record<string, any>[];
}

function formatValue(val: any): string {
  if (val == null) return '—';
  if (typeof val === 'number') {
    return val % 1 === 0 ? val.toLocaleString() : val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(val);
}

const MetricView: React.FC<{ spec: ReportSpec; data: Record<string, any>[] }> = ({ spec, data }) => {
  const row = data[0] || {};
  const metrics = spec.chart.yAxis.map((key, i) => ({
    label: key.replace(/_/g, ' '),
    value: formatValue(row[key]),
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="report-metric-grid">
      {metrics.map((m) => (
        <div key={m.label} className="report-metric-card">
          <div className="report-metric-value" style={{ color: m.color }}>{m.value}</div>
          <div className="report-metric-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
};

const TableView: React.FC<{ spec: ReportSpec; data: Record<string, any>[] }> = ({ data }) => {
  if (data.length === 0) return <div className="report-empty">No data to display</div>;
  const columns = Object.keys(data[0]);

  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col}>{col.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col}>{formatValue(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ChartView: React.FC<DynamicChartProps> = ({ spec, data }) => {
  const { visualization, chart } = spec;
  const { xAxis, yAxis, stacked } = chart;

  const commonProps = {
    data,
    margin: { top: 20, right: 20, bottom: 20, left: 20 },
  };

  const renderAxes = (
    <>
      <CartesianGrid stroke={CHART_CHROME.gridline} vertical={false} />
      <XAxis
        dataKey={xAxis}
        tick={AXIS_TICK}
        axisLine={false}
        tickLine={false}
        padding={{ left: 20, right: 20 }}
      />
      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      <Legend iconType="circle" />
    </>
  );

  if (visualization === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart {...commonProps}>
          {renderAxes}
          {yAxis.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              name={key.replace(/_/g, ' ')}
              fill={COLORS[i % COLORS.length]}
              stackId={stacked ? 'stack' : undefined}
              radius={[4, 4, 0, 0]}
              barSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (visualization === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart {...commonProps}>
          {renderAxes}
          {yAxis.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={key.replace(/_/g, ' ')}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (visualization === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart {...commonProps}>
          {renderAxes}
          {yAxis.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={key.replace(/_/g, ' ')}
              fill={COLORS[i % COLORS.length]}
              stroke={COLORS[i % COLORS.length]}
              fillOpacity={0.3}
              stackId={stacked ? 'stack' : undefined}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (visualization === 'composed') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart {...commonProps}>
          {renderAxes}
          {yAxis.map((key, i) => (
            i === 0
              ? <Bar key={key} dataKey={key} name={key.replace(/_/g, ' ')} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} barSize={40} />
              : <Line key={key} type="monotone" dataKey={key} name={key.replace(/_/g, ' ')} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (visualization === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={yAxis[0]}
            nameKey={xAxis}
            cx="50%"
            cy="50%"
            outerRadius="70%"
            label={({ name, value }: any) => `${name || ''}: ${formatValue(value)}`}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return <div className="report-empty">Unsupported chart type</div>;
};

export const DynamicChart: React.FC<DynamicChartProps> = ({ spec, data }) => {
  if (!data || data.length === 0) {
    return <div className="report-empty" style={{ height: 256 }}>No results for this query — try adjusting the question</div>;
  }

  if (spec.visualization === 'metric') return <MetricView spec={spec} data={data} />;
  if (spec.visualization === 'table') return <TableView spec={spec} data={data} />;

  return (
    <div style={{ height: 400, width: '100%', minWidth: 0 }}>
      <ChartView spec={spec} data={data} />
    </div>
  );
};

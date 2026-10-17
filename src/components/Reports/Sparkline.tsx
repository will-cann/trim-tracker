import React, { useId } from 'react';

interface SparklineProps {
    values: number[];
    height?: number;
    color: string;
    /** Render a soft fill under the line. */
    area?: boolean;
}

/**
 * Minimal inline SVG trend line for stat tiles. Fills its container's width
 * (non-scaling stroke keeps the line crisp) and scales to the series' own
 * min/max so the shape is visible even for metrics that barely move; the
 * tile's delta carries the magnitude.
 */
export const Sparkline: React.FC<SparklineProps> = ({ values, height = 28, color, area = true }) => {
    const width = 200;
    const id = useId();
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 2;
    const stepX = (width - pad * 2) / (values.length - 1);
    const points = values.map((v, i) => [pad + i * stepX, pad + (height - pad * 2) * (1 - (v - min) / span)] as const);
    const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    const areaPath = `${path} L${last[0].toFixed(1)},${height} L${pad},${height} Z`;

    return (
        <svg className="report-sparkline" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {area && (
                <>
                    <defs>
                        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <path d={areaPath} fill={`url(#${id})`} />
                </>
            )}
            <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
};

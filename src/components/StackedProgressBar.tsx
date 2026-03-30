import React from 'react';

interface Segment {
    label: string;
    value: number;
    color: string;
}

interface StackedProgressBarProps {
    segments: Segment[];
    total: number;
    height?: number;
    showLegend?: boolean;
    showPercentage?: boolean;
    className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    flower: '#3BB570',
    shake: '#FA9E52',
    trim: '#1C9EFF',
    waste: '#DF5B59',
    remaining: '#E0E0E0',
};

export function buildSegments(weights: {
    flower: number;
    shake: number;
    trim: number;
    waste: number;
}, total: number): Segment[] {
    const processed = weights.flower + weights.shake + weights.trim + weights.waste;
    const remaining = Math.max(0, total - processed);

    const segments: Segment[] = [
        { label: 'Flower', value: weights.flower, color: CATEGORY_COLORS.flower },
        { label: 'Shake', value: weights.shake, color: CATEGORY_COLORS.shake },
        { label: 'Trim', value: weights.trim, color: CATEGORY_COLORS.trim },
        { label: 'Waste', value: weights.waste, color: CATEGORY_COLORS.waste },
    ];

    if (remaining > 0) {
        segments.push({ label: 'Remaining', value: remaining, color: CATEGORY_COLORS.remaining });
    }

    return segments;
}

export const StackedProgressBar: React.FC<StackedProgressBarProps> = ({
    segments,
    total,
    height = 10,
    showLegend = false,
    showPercentage = false,
    className = '',
}) => {
    if (total === 0) {
        return (
            <div className={`stacked-bar-wrapper ${className}`}>
                <div className="stacked-bar" style={{ height }}>
                    <div className="stacked-bar-empty" />
                </div>
            </div>
        );
    }

    const processed = segments
        .filter(s => s.label !== 'Remaining')
        .reduce((sum, s) => sum + s.value, 0);
    const pct = Math.min(100, Math.round((processed / total) * 100));

    return (
        <div className={`stacked-bar-wrapper ${className}`}>
            {showPercentage && (
                <span className="stacked-bar-pct">{pct}%</span>
            )}
            <div className="stacked-bar" style={{ height }}>
                {segments.map((seg) => {
                    const widthPct = (seg.value / total) * 100;
                    if (widthPct === 0) return null;
                    return (
                        <div
                            key={seg.label}
                            className="stacked-bar-segment"
                            style={{
                                width: `${widthPct}%`,
                                backgroundColor: seg.color,
                            }}
                            title={`${seg.label}: ${Math.round(seg.value)}g (${Math.round(widthPct)}%)`}
                        />
                    );
                })}
            </div>
            {showLegend && (
                <div className="stacked-bar-legend">
                    {segments.filter(s => s.value > 0).map((seg) => (
                        <div key={seg.label} className="stacked-bar-legend-item">
                            <span className="stacked-bar-dot" style={{ backgroundColor: seg.color }} />
                            <span className="stacked-bar-legend-label">{seg.label}</span>
                            <span className="stacked-bar-legend-value">{Math.round(seg.value)}g</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

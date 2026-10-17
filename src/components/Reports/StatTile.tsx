import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Sparkline } from './Sparkline';

export type DeltaTone = 'good' | 'bad' | 'neutral';

export interface StatDelta {
    /** Pre-formatted change text, e.g. "+12%" or "−3 pts". */
    text: string;
    direction: 'up' | 'down' | 'flat';
    tone: DeltaTone;
    /** Pre-formatted comparison basis, e.g. "vs 7d ago". */
    basis?: string;
    title?: string;
}

interface StatTileProps {
    label: string;
    value: string;
    unit?: string;
    delta?: StatDelta | null;
    /** Secondary line under the value, e.g. "3 overdue". */
    hint?: string;
    trend?: number[];
    accent?: string;
    description?: string;
    onClick?: () => void;
}

const TONE_COLOR: Record<DeltaTone, string> = {
    good: '#1A7A42',
    bad: '#A8403E',
    neutral: '#737373',
};

export const DeltaChip: React.FC<{ delta: StatDelta }> = ({ delta }) => {
    const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;
    return (
        <span className={`report-delta report-delta--${delta.tone}`} style={{ color: TONE_COLOR[delta.tone] }} title={delta.title}>
            <Icon size={12} strokeWidth={2.5} />
            <span>{delta.text}</span>
            {delta.basis && <span className="report-delta-basis">{delta.basis}</span>}
        </span>
    );
};

/**
 * KPI tile: a label, one headline figure, its change against an earlier
 * snapshot, and an optional sparkline of the recent series.
 */
export const StatTile: React.FC<StatTileProps> = ({ label, value, unit, delta, hint, trend, accent = '#3BB570', description, onClick }) => {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag className={`report-stat-tile${onClick ? ' report-stat-tile--clickable' : ''}`} title={description} onClick={onClick} type={onClick ? 'button' : undefined}>
            <div className="report-stat-label">{label}</div>
            <div className="report-stat-value-row">
                <span className="report-stat-value">{value}</span>
                {unit && <span className="report-stat-unit">{unit}</span>}
            </div>
            {trend && trend.length > 1 && <Sparkline values={trend} color={accent} />}
            <div className="report-stat-meta">
                {delta && <DeltaChip delta={delta} />}
                {hint && <span className="report-stat-hint">{hint}</span>}
            </div>
        </Tag>
    );
};

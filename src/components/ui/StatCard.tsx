import React from 'react';

/**
 * Semantic variant for the icon tile. Each variant picks a brand-anchored
 * tint (background) + accent (icon color) pair from the animal palette.
 */
export type StatCardVariant =
    | 'flower'    // chameleon — primary output, active count
    | 'trim'      // macaw — secondary / info
    | 'shake'     // lion — intermediate / warning
    | 'waste'     // cardinal — danger / destructive
    | 'neutral';  // rhino/koala — muted / remaining / completed

const VARIANT_STYLES: Record<StatCardVariant, React.CSSProperties> = {
    flower:  { backgroundColor: 'rgba(59, 181, 112, 0.10)', color: '#1A7A42' },
    trim:    { backgroundColor: 'rgba(28, 158, 255, 0.10)', color: '#1B5EB5' },
    shake:   { backgroundColor: 'rgba(250, 158, 82, 0.12)', color: '#B06A1F' },
    waste:   { backgroundColor: 'rgba(223, 91, 89, 0.10)', color: '#A8403E' },
    neutral: { backgroundColor: '#F1F1F1',                 color: '#5C5C5C' },
};

interface StatCardProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    variant?: StatCardVariant;
}

export const StatCard: React.FC<StatCardProps> = ({
    icon,
    label,
    value,
    variant = 'neutral',
}) => {
    return (
        <div className="stat-item">
            <div className="stat-icon" style={VARIANT_STYLES[variant]}>
                {icon}
            </div>
            <div className="stat-content">
                <label>{label}</label>
                <p className="stat-value">{value}</p>
            </div>
        </div>
    );
};

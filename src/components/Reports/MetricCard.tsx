import React from 'react';

/**
 * Semantic variant for the metric card. Uses the same brand-anchored language
 * as StatCard — keep the two aligned so Reports metrics and dashboard stats
 * share a visual vocabulary.
 */
export type MetricCardVariant =
    | 'flower'    // chameleon — output / primary wins
    | 'trim'      // macaw — trim weight / hours / secondary
    | 'shake'     // lion — intermediate / warning
    | 'waste'     // cardinal — loss / danger
    | 'neutral';  // rhino — default / no semantic weight

interface VariantStyle {
    bg: string;
    value: string;
    label: string;
}

const VARIANT_STYLES: Record<MetricCardVariant, VariantStyle> = {
    flower:  { bg: 'rgba(59, 181, 112, 0.08)', value: '#1A7A42', label: '#2E9A5C' },
    trim:    { bg: 'rgba(28, 158, 255, 0.08)', value: '#1B5EB5', label: '#0E82DB' },
    shake:   { bg: 'rgba(250, 158, 82, 0.10)', value: '#B06A1F', label: '#E0863A' },
    waste:   { bg: 'rgba(223, 91, 89, 0.08)', value: '#A8403E', label: '#C44442' },
    neutral: { bg: '#F1F1F1',                  value: '#1A1A1A', label: '#737373' },
};

interface MetricCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    variant?: MetricCardVariant;
    icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({
    label,
    value,
    subtext,
    variant = 'neutral',
}) => {
    const style = VARIANT_STYLES[variant];
    return (
        <div
            className="rounded-xl p-6 flex flex-col justify-center h-28"
            style={{ background: style.bg }}
        >
            <div
                className="text-h1"
                style={{
                    color: style.value,
                    marginBottom: 4,
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {value}
            </div>
            <div
                className="text-label"
                style={{ color: style.label, textTransform: 'none' }}
            >
                {label}
            </div>
            {subtext && (
                <div
                    className="text-micro"
                    style={{ color: style.label, marginTop: 4, opacity: 0.7, fontWeight: 400 }}
                >
                    {subtext}
                </div>
            )}
        </div>
    );
};

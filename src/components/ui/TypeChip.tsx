import React from 'react';
import {
    TYPE_CHIP_PALETTES,
    normalizeTypeChipKey,
    type TypeChipPalette,
} from './typeChipPalettes';

interface TypeChipProps {
    palette: TypeChipPalette;
    value: string | null | undefined;
    /** Fallback label when value is missing or unrecognized. Defaults to '--'. */
    fallback?: string;
}

export const TypeChip: React.FC<TypeChipProps> = ({ palette, value, fallback = '--' }) => {
    if (value === null || value === undefined || value === '') {
        return <span style={{ color: '#959595' }}>{fallback}</span>;
    }
    const style = TYPE_CHIP_PALETTES[palette][normalizeTypeChipKey(value)];
    if (!style) {
        const humanized = value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return <span style={chipBaseStyle('#F1F1F1', '#1A1A1A')}>{humanized}</span>;
    }
    return (
        <span style={chipBaseStyle(style.bg, style.color)}>
            {style.icon}
            {style.label}
        </span>
    );
};

const chipBaseStyle = (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: '0.6875rem',
    fontWeight: 700,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    background: bg,
    color,
});

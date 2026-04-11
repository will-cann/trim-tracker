import type { CSSProperties } from 'react';

/**
 * Reports chart palette.
 *
 * Reports gets its own categorical palette because charts need 6+ distinguishable
 * series without crowding the animal palette used by TypeChip. Values stay strictly
 * brand-anchored: the 4 animal accents, their darker variants, and rhino for neutral.
 *
 * Never inline hex in chart components — import from here.
 */

// ── Categorical palette (ordered by visual discrimination) ───────────────────

const CHAMELEON = '#3BB570';
const MACAW = '#1C9EFF';
const LION = '#FA9E52';
const CARDINAL = '#DF5B59';
const CHAMELEON_DEEP = '#1A7A42';
const MACAW_DEEP = '#0E6A8A';
const LION_DEEP = '#B06A1F';
const RHINO = '#5C5C5C';

export const CHART_PALETTE: readonly string[] = [
    CHAMELEON,
    MACAW,
    LION,
    CARDINAL,
    CHAMELEON_DEEP,
    MACAW_DEEP,
    LION_DEEP,
    RHINO,
] as const;

/** Semantic accents for single-value fills (metric cards, hero lines). */
export const CHART_ACCENT = {
    flower:   CHAMELEON,
    trim:     MACAW,
    shake:    LION,
    waste:    CARDINAL,
    labor:    CARDINAL,
    neutral:  RHINO,
} as const;

/** Gridlines, axis labels, tooltip surround — keep uniform across every chart. */
export const CHART_CHROME = {
    gridline:  '#F1F1F1', // koala
    axisLabel: '#959595', // rhino
    axisTick:  { fontSize: 12, fill: '#959595' },
} as const;

/** Tooltip content style — drop-in for recharts <Tooltip contentStyle={...} />. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
    borderRadius: 8,
    border: 'none',
    boxShadow: '0 4px 12px -2px rgba(26, 26, 26, 0.12)',
    fontSize: 13,
    padding: '8px 12px',
};

/** Pick the nth color from the categorical palette, wrapping if needed. */
export const chartColor = (index: number): string =>
    CHART_PALETTE[index % CHART_PALETTE.length];

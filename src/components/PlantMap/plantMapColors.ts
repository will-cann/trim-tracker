import type { RiskLevel } from '../../types/plantMap';

/** Heat colour for a 0–1 hot-spot score: nothing → amber → red. */
export function heatColor(score: number): string | undefined {
    if (score < 0.08) return undefined;
    const hue = Math.round(45 - 45 * Math.min(1, score));      // 45° amber → 0° red
    const alpha = 0.18 + 0.62 * Math.min(1, score);
    return `hsla(${hue}, 85%, 52%, ${alpha.toFixed(2)})`;
}

export const RISK_LABEL: Record<RiskLevel, string> = {
    none: 'Clear',
    low: 'Low risk',
    medium: 'Hot spot',
    high: 'Severe hot spot',
};

export const RISK_TEXT_COLOR: Record<RiskLevel, string> = {
    none: '#959595',
    low: '#B7791F',
    medium: '#C05621',
    high: '#C53030',
};

/** Stable categorical palette for cohort overlays (feed / flower length / stretch). */
const CATEGORY_PALETTE = [
    '#3BB570', '#4C8EDA', '#F0BF00', '#A66BBE', '#FA9E52',
    '#2CA8A8', '#DF5B59', '#8C8C3B', '#6B7280', '#D96AA7',
];

export function categoryColor(index: number): string {
    return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

export const SEVERITY_COLOR: Record<number, string> = {
    1: '#F0BF00',
    2: '#F0A000',
    3: '#FA9E52',
    4: '#E0604A',
    5: '#C53030',
};

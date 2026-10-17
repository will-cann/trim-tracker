import type { LatestMetric, MetricDefinition } from '../../services/apiService';
import type { StatDelta } from './StatTile';

const GRAMS_PER_LB = 453.592;

/** Format a snapshot value for display according to its metric kind. */
export function formatMetricValue(value: number, def?: Pick<MetricDefinition, 'kind'>): string {
    if (!def) return value.toLocaleString();
    switch (def.kind) {
        case 'ratio': return `${Math.round(value * 1000) / 10}%`;
        case 'grams': return formatGrams(value);
        case 'gauge': return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
        default: return Math.round(value).toLocaleString();
    }
}

export function formatGrams(grams: number): string {
    if (grams >= 1000) return `${(grams / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    return `${Math.round(grams).toLocaleString()} g`;
}

export function formatLbs(lbs: number): string {
    return lbs.toLocaleString(undefined, { maximumFractionDigits: lbs >= 100 ? 0 : 1 });
}

export function gramsToLbs(grams: number): number {
    return grams / GRAMS_PER_LB;
}

export function formatHours(hours: number): string {
    return hours.toLocaleString(undefined, { maximumFractionDigits: hours >= 100 ? 0 : 1 });
}

export function formatMoney(amount: number, fractionDigits = 0): string {
    return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/** "Oct 17" or "Oct 17, 2025" when the year differs from today. */
export function formatSnapshotDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Turn a snapshot's change against an earlier day into a delta chip: sign, tone (by goodWhenUp) and text by kind. */
export function metricDelta(m: LatestMetric, def: MetricDefinition | undefined, basis?: string): StatDelta | null {
    if (m.change == null || m.previous == null) return null;
    const title = `was ${formatMetricValue(m.previous, def)}`;
    const up = m.change > 0;
    const good = def?.goodWhenUp == null ? null : def.goodWhenUp === up;
    // Shown as points for ratios, as a percentage when the base is big enough
    // for one to mean something, else as the raw difference.
    const magnitude = def?.kind === 'ratio'
        ? `${Math.abs(Math.round(m.change * 1000) / 10)} pts`
        : m.changePct != null && Math.abs(m.previous) >= 1
            ? `${Math.abs(m.changePct)}%`
            : formatMetricValue(Math.abs(m.change), def);
    if (m.change === 0 || /^0(\.0)? /.test(magnitude) || /^0%$/.test(magnitude)) {
        return { text: 'No change', direction: 'flat', tone: 'neutral', basis, title };
    }
    const text = `${up ? '+' : '−'}${magnitude}`;
    return { text, direction: up ? 'up' : 'down', tone: good == null ? 'neutral' : good ? 'good' : 'bad', basis, title };
}

/** Metric labels carry a unit hint for the AI ("Active inventory (g)"); the formatted value already shows it. */
export function tileLabel(label: string): string {
    return label.replace(/\s*\((g|grams)\)$/i, '');
}

const DIMENSION_PLURAL: Record<string, string> = { room: 'rooms', phase: 'phases', strain: 'strains', issue: 'issues', status: 'statuses' };
export function dimensionCount(dimension: string | null | undefined, n: number): string {
    if (!dimension) return '';
    const plural = DIMENSION_PLURAL[dimension] ?? `${dimension}s`;
    return `${n} ${n === 1 ? dimension : plural}`;
}

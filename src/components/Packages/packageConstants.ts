import type { LabTestingState, AdjustmentReason } from '../../types/definitions';
import { CircleDashed, Clock, CircleCheck, CircleX, type LucideIcon } from 'lucide-react';

export const LAB_LABEL: Record<string, string> = {
    not_submitted: 'Not Submitted',
    submitted: 'Submitted',
    passed: 'Passed',
    failed: 'Failed',
};

export const LAB_CLASS: Record<string, string> = {
    not_submitted: 'text-[var(--color-dolphin)]',
    submitted: 'text-[#FA9E52]',
    passed: 'text-[var(--color-flower)]',
    failed: 'text-[var(--color-waste)]',
};

export const LAB_ICON: Record<string, LucideIcon> = {
    not_submitted: CircleDashed,
    submitted: Clock,
    passed: CircleCheck,
    failed: CircleX,
};

export const LAB_OPTIONS: { value: LabTestingState; label: string }[] = [
    { value: 'not_submitted', label: 'Not Submitted' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' },
];

export const ADJUSTMENT_REASONS: { value: AdjustmentReason; label: string }[] = [
    { value: 'Waste', label: 'Waste' },
    { value: 'Moisture Loss', label: 'Moisture Loss' },
    { value: 'Processing Loss', label: 'Processing Loss' },
    { value: 'Theft', label: 'Theft' },
    { value: 'Reconciliation', label: 'Reconciliation' },
];

/** True for packages measured in grams (the default unit). */
export const isGramUnit = (unit?: string): boolean => {
    const u = (unit || 'g').toLowerCase();
    return u === 'g' || u === 'grams';
};

/** Grams → "850 g" / "1.2 kg"; other units keep their unit ("150 ea"). */
export const formatPackageQuantity = (qty: number, unit?: string): string => {
    if (isGramUnit(unit)) {
        if (qty >= 1000) {
            return `${(qty / 1000).toLocaleString(undefined, { maximumFractionDigits: qty >= 100000 ? 1 : 2 })} kg`;
        }
        return `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} g`;
    }
    const u = (unit || '').toLowerCase() === 'each' ? 'ea' : unit;
    return `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${u}`;
};

/**
 * Metrc item names arrive as "M00001350209: Proper - Sauce+ - 1g"; drop the
 * item id so the name reads as a name.
 */
export const itemDisplayName = (itemName?: string | null): string =>
    (itemName ?? '').replace(/^M\d+:\s*/, '').trim();

/** What to call a package: its strain, else its (Metrc) item name. */
export const packageTitle = (pkg: { strain?: string | null; itemName?: string | null }): string =>
    pkg.strain?.trim() || itemDisplayName(pkg.itemName) || '—';

export interface EditFields {
    wasteWeight: number;
    location: string;
    labTestingState: LabTestingState;
    itemName: string;
    notes: string;
}

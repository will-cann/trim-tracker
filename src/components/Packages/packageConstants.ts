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

export interface EditFields {
    wasteWeight: number;
    location: string;
    labTestingState: LabTestingState;
    itemName: string;
    notes: string;
}

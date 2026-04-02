import React from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
    /** Display size — sm: 14px, md: 16px, lg: 24px */
    size?: 'sm' | 'md' | 'lg';
    /** Optional label shown next to the spinner */
    label?: string;
    /** Color override — defaults to text-gray-400 */
    className?: string;
}

const SIZE_MAP = { sm: 14, md: 16, lg: 24 } as const;

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label, className = 'text-gray-400' }) => (
    <span className={`inline-flex items-center gap-2 ${className}`}>
        <Loader2 size={SIZE_MAP[size]} className="animate-spin" />
        {label && <span className="text-xs text-gray-400">{label}</span>}
    </span>
);

interface CenteredSpinnerProps extends SpinnerProps {
    /** Height of the centering container */
    height?: string;
}

/** Spinner centered in a flex container — for content areas, modals, expanded panels. */
export const CenteredSpinner: React.FC<CenteredSpinnerProps> = ({ height = 'h-64', ...props }) => (
    <div className={`flex items-center justify-center ${height}`}>
        <Spinner {...props} />
    </div>
);

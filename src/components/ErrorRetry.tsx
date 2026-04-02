import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorRetryProps {
    message?: string;
    onRetry: () => void;
    compact?: boolean;
}

export const ErrorRetry: React.FC<ErrorRetryProps> = ({
    message = 'Something went wrong.',
    onRetry,
    compact = false,
}) => (
    <div className={`flex ${compact ? 'items-center gap-3' : 'flex-col items-center gap-2 text-center px-4 py-8'}`}>
        <AlertCircle size={compact ? 16 : 20} className="text-red-400 shrink-0" />
        <p className="text-xs text-gray-500">{message}</p>
        <button
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
        >
            <RefreshCw size={12} /> Retry
        </button>
    </div>
);

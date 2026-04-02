import { useEffect, useState } from 'react';
import { Undo2, X } from 'lucide-react';

interface UndoToastProps {
    message: string;
    duration?: number;
    onUndo: () => void;
    onDismiss: () => void;
}

export const UndoToast = ({ message, duration = 4000, onUndo, onDismiss }: UndoToastProps) => {
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => {
            const elapsed = Date.now() - start;
            const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
            setProgress(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                onDismiss();
            }
        }, 50);
        return () => clearInterval(interval);
    }, [duration, onDismiss]);

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-slide-up">
            <div className="flex items-center gap-3 bg-[#1A1A1A] text-white rounded-lg shadow-lg pl-4 pr-2 py-2.5 min-w-[280px]">
                <span className="text-sm flex-1">{message}</span>
                <button
                    onClick={onUndo}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium text-[#3BB570] hover:text-white hover:bg-white/10 rounded transition-colors"
                >
                    <Undo2 size={13} />
                    Undo
                </button>
                <button
                    onClick={onDismiss}
                    className="p-1 text-white/40 hover:text-white/80 transition-colors"
                >
                    <X size={14} />
                </button>
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 rounded-b-lg overflow-hidden">
                    <div
                        className="h-full bg-[#3BB570] transition-[width] duration-100 ease-linear"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

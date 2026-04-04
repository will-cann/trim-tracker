import React from 'react';
import { LayoutGrid, List, Calendar } from 'lucide-react';

export type ViewMode = 'cards' | 'table' | 'schedule';

interface ViewToggleProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
    showSchedule?: boolean;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ mode, onChange, showSchedule }) => {
    return (
        <div className="view-toggle">
            <button
                onClick={() => onChange('cards')}
                className={`view-toggle-btn ${mode === 'cards' ? 'active' : ''}`}
                title="Card view"
            >
                <LayoutGrid size={15} />
            </button>
            <button
                onClick={() => onChange('table')}
                className={`view-toggle-btn ${mode === 'table' ? 'active' : ''}`}
                title="Table view"
            >
                <List size={15} />
            </button>
            {showSchedule && (
                <button
                    onClick={() => onChange('schedule')}
                    className={`view-toggle-btn ${mode === 'schedule' ? 'active' : ''}`}
                    title="Schedule view"
                >
                    <Calendar size={15} />
                </button>
            )}
        </div>
    );
};

/** Hook to persist view mode preference per view */
export function useViewMode(viewKey: string, defaultMode: ViewMode = 'cards'): [ViewMode, (mode: ViewMode) => void] {
    const storageKey = `viewMode_${viewKey}`;
    const [mode, setModeState] = React.useState<ViewMode>(() => {
        const saved = sessionStorage.getItem(storageKey);
        return saved === 'cards' || saved === 'table' || saved === 'schedule' ? saved : defaultMode;
    });

    const setMode = React.useCallback((newMode: ViewMode) => {
        sessionStorage.setItem(storageKey, newMode);
        setModeState(newMode);
    }, [storageKey]);

    return [mode, setMode];
}

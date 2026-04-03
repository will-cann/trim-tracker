import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'cards' | 'table';

interface ViewToggleProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ mode, onChange }) => {
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
        </div>
    );
};

/** Hook to persist view mode preference per view */
export function useViewMode(viewKey: string, defaultMode: ViewMode = 'cards'): [ViewMode, (mode: ViewMode) => void] {
    const storageKey = `viewMode_${viewKey}`;
    const [mode, setModeState] = React.useState<ViewMode>(() => {
        const saved = sessionStorage.getItem(storageKey);
        return saved === 'cards' || saved === 'table' ? saved : defaultMode;
    });

    const setMode = React.useCallback((newMode: ViewMode) => {
        sessionStorage.setItem(storageKey, newMode);
        setModeState(newMode);
    }, [storageKey]);

    return [mode, setMode];
}

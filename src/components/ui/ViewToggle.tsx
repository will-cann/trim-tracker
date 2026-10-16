import React from 'react';
import { LayoutGrid, List, GanttChart, CalendarDays, Columns3, Grid3x3 } from 'lucide-react';

export type ViewMode = 'cards' | 'table' | 'schedule' | 'calendar' | 'kanban' | 'map';

interface ViewToggleProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
    showSchedule?: boolean;
    showCalendar?: boolean;
    showKanban?: boolean;
    /** Room grid / hot-spot map (plant map only). */
    showMap?: boolean;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ mode, onChange, showSchedule, showCalendar, showKanban, showMap }) => {
    return (
        <div className="view-toggle">
            {showMap && (
                <button
                    onClick={() => onChange('map')}
                    className={`view-toggle-btn ${mode === 'map' ? 'active' : ''}`}
                    title="Room map"
                >
                    <Grid3x3 size={15} />
                </button>
            )}
            {showKanban && (
                <button
                    onClick={() => onChange('kanban')}
                    className={`view-toggle-btn ${mode === 'kanban' ? 'active' : ''}`}
                    title="Pipeline view"
                >
                    <Columns3 size={15} />
                </button>
            )}
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
                    title="Timeline view"
                >
                    <GanttChart size={15} />
                </button>
            )}
            {showCalendar && (
                <button
                    onClick={() => onChange('calendar')}
                    className={`view-toggle-btn ${mode === 'calendar' ? 'active' : ''}`}
                    title="Calendar view"
                >
                    <CalendarDays size={15} />
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
        return saved === 'cards' || saved === 'table' || saved === 'schedule' || saved === 'calendar' || saved === 'kanban' || saved === 'map' ? saved : defaultMode;
    });

    const setMode = React.useCallback((newMode: ViewMode) => {
        sessionStorage.setItem(storageKey, newMode);
        setModeState(newMode);
    }, [storageKey]);

    return [mode, setMode];
}

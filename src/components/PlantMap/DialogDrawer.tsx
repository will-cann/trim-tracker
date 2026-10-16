import React from 'react';
import { X, Trash2, RefreshCw, ArrowRightLeft, Scissors, Heart, Sprout, Package } from 'lucide-react';
import type { PlantPhase, PlantGroup } from '../../types/plantMap';

interface DialogAction {
    key: string;
    label: string;
    icon: React.ReactNode;
    phases: PlantPhase[];
    implemented: boolean;
}

const ACTIONS: DialogAction[] = [
    { key: 'destroy', label: 'Destroy', icon: <Trash2 size={13} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'change-phase', label: 'Change phase', icon: <RefreshCw size={13} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'change-room', label: 'Change room', icon: <ArrowRightLeft size={13} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'create-harvest', label: 'Schedule harvest', icon: <Scissors size={13} />, phases: ['flowering'], implemented: true },
    { key: 'plant-health', label: 'Health report', icon: <Heart size={13} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'split-plantings', label: 'Split plantings', icon: <Sprout size={13} />, phases: ['nursery'], implemented: false },
    { key: 'create-packages', label: 'Create packages', icon: <Package size={13} />, phases: ['nursery'], implemented: false },
];

interface DialogDrawerProps {
    isOpen: boolean;
    totalSelected: number;
    phase: PlantPhase;
    phaseLabel: string;
    selectedGroups: Array<PlantGroup & { id: string }>;
    roomName: string;
    onAction: (actionKey: string) => void;
    onClearSelection: () => void;
}

/**
 * Bulk-action bar for the selected strain groups in an expanded room. Renders
 * as a single row above the table (rather than a side drawer) so the table
 * keeps its full width while rows are selected.
 */
export const DialogDrawer: React.FC<DialogDrawerProps> = ({
    isOpen,
    totalSelected,
    phase,
    selectedGroups,
    onAction,
    onClearSelection,
}) => {
    if (!isOpen) return null;

    const availableActions = ACTIONS.filter(a => a.phases.includes(phase));
    const selectedPlants = selectedGroups.reduce((sum, g) => sum + g.totalPlants, 0);

    return (
        <div className="strain-actions-bar" role="toolbar" aria-label="Actions for selected strains">
            <span className="strain-actions-count">
                <span className="font-bold tabular-nums">{totalSelected}</span> {totalSelected === 1 ? 'strain' : 'strains'}
                <span className="text-gray-400"> · </span>
                <span className="font-bold tabular-nums">{selectedPlants.toLocaleString()}</span> plant{selectedPlants !== 1 ? 's' : ''}
            </span>
            <span className="strain-actions-divider" />
            {availableActions.map(action => (
                <button
                    key={action.key}
                    type="button"
                    onClick={() => action.implemented && onAction(action.key)}
                    disabled={!action.implemented}
                    className="strain-action-btn"
                    title={action.implemented ? action.label : `${action.label} (coming soon)`}
                >
                    {action.icon}
                    {action.label}
                    {!action.implemented && <span className="strain-action-soon">Soon</span>}
                </button>
            ))}
            <button type="button" onClick={onClearSelection} className="strain-action-btn strain-action-btn--clear" title="Clear selection">
                <X size={13} />
                Clear
            </button>
        </div>
    );
};

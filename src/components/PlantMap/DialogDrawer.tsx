import React, { useState } from 'react';
import { ChevronLeft, X, Trash2, RefreshCw, ArrowRightLeft, Scissors, Heart, Sprout, Package } from 'lucide-react';
import type { PlantPhase, PlantGroup } from '../../types/plantMap';

interface DialogAction {
    key: string;
    label: string;
    icon: React.ReactNode;
    phases: PlantPhase[];
    implemented: boolean;
}

const ACTIONS: DialogAction[] = [
    { key: 'destroy', label: 'Destroy Plants', icon: <Trash2 size={14} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'change-phase', label: 'Change Growth Phase', icon: <RefreshCw size={14} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'change-room', label: 'Change Rooms', icon: <ArrowRightLeft size={14} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'create-harvest', label: 'Create Harvests', icon: <Scissors size={14} />, phases: ['flowering'], implemented: false },
    { key: 'plant-health', label: 'Plant Health Report', icon: <Heart size={14} />, phases: ['nursery', 'vegetative', 'flowering'], implemented: true },
    { key: 'split-plantings', label: 'Split Plantings', icon: <Sprout size={14} />, phases: ['nursery'], implemented: false },
    { key: 'create-packages', label: 'Create Packages', icon: <Package size={14} />, phases: ['nursery'], implemented: false },
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

export const DialogDrawer: React.FC<DialogDrawerProps> = ({
    isOpen,
    totalSelected,
    phase,
    phaseLabel,
    onAction,
    onClearSelection,
}) => {
    const [expanded, setExpanded] = useState(true);

    const availableActions = ACTIONS.filter(a => a.phases.includes(phase));

    if (!isOpen) return null;

    // Collapsed state — just a slim bar with chevron
    if (!expanded) {
        return (
            <div className="w-10 border-l border-gray-100 flex flex-col items-center pt-3 shrink-0">
                <button
                    onClick={() => setExpanded(true)}
                    className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                    title="Expand actions"
                >
                    <ChevronLeft size={14} className="text-gray-400" />
                </button>
                <span className="text-[10px] text-emerald-600 font-semibold mt-2 [writing-mode:vertical-lr]">
                    {totalSelected} selected
                </span>
            </div>
        );
    }

    // Expanded state — full action list
    return (
        <div className="w-44 border-l border-gray-100 flex flex-col shrink-0 animate-in slide-in-from-right-2">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <span className="text-[10px] font-medium text-emerald-600">
                    {totalSelected} selected
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onClearSelection}
                        className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => setExpanded(false)}
                        className="p-1 rounded hover:bg-gray-100 transition-colors"
                    >
                        <X size={12} className="text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="flex-1 overflow-auto py-1">
                <p className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">
                    {phaseLabel} Actions
                </p>
                {availableActions.map(action => (
                    <button
                        key={action.key}
                        onClick={() => action.implemented && onAction(action.key)}
                        disabled={!action.implemented}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                            action.implemented
                                ? 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer'
                                : 'text-gray-300 cursor-not-allowed'
                        }`}
                    >
                        <span className={action.implemented ? 'text-gray-400' : 'text-gray-200'}>{action.icon}</span>
                        {action.label}
                        {!action.implemented && (
                            <span className="ml-auto text-[9px] text-gray-300">Soon</span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

import React from 'react';
import { Package } from 'lucide-react';
import type { TrimEntry, TrimmerProfile } from '../types/definitions';
import { TrimCard } from './TrimCard';

interface EntryListProps {
    entries: TrimEntry[];
    onUpdateWeight: (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => void;
    onUpdateStrain: (entryId: string, strain: string) => void;
    onAddTrimmer: (entryId: string) => void;
    onUpdateTrimmer: (entryId: string, trimmerId: string, updates: Partial<Record<string, string | number>>) => void;
    onRemoveTrimmer: (entryId: string, trimmerId: string) => void;
    onDeleteBatch: (entryId: string) => void;
    onSubmitBatch?: (entryId: string) => void;
    onStartBatch?: (entryId: string) => void;
    onRevertBatch?: (entryId: string) => void;
    trimmerProfiles: TrimmerProfile[];
}

export const EntryList: React.FC<EntryListProps> = ({
    entries,
    onUpdateWeight,
    onUpdateStrain,
    onAddTrimmer,
    onUpdateTrimmer,
    onRemoveTrimmer,
    onDeleteBatch,
    onSubmitBatch,
    onStartBatch,
    onRevertBatch,
    trimmerProfiles
}) => {
    return (
        <div className="entry-list-container">
            <div className="entry-grid">
                {entries.map(entry => (
                    <TrimCard
                        key={entry.id}
                        entry={entry}
                        onUpdateWeight={onUpdateWeight}
                        onUpdateStrain={onUpdateStrain}
                        onAddTrimmer={onAddTrimmer}
                        onUpdateTrimmer={onUpdateTrimmer}
                        onRemoveTrimmer={onRemoveTrimmer}
                        onDeleteBatch={onDeleteBatch}
                        onSubmitBatch={onSubmitBatch}
                        onStartBatch={onStartBatch}
                        onRevertBatch={onRevertBatch}
                        trimmerProfiles={trimmerProfiles}
                    />
                ))}
                {entries.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <Package size={20} className="text-gray-300" />
                        </div>
                        <p className="text-sm text-gray-500 font-medium">No batches in this tab</p>
                        <p className="text-xs text-gray-400 mt-1">Batches will appear here as they move through the workflow.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

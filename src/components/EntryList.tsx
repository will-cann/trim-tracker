import React from 'react';
import type { TrimEntry } from '../types/definitions';
import { TrimCard } from './TrimCard';

interface EntryListProps {
    entries: TrimEntry[];
    onUpdateWeight: (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => void;
    onUpdateStrain: (entryId: string, strain: string) => void;
    onAddTrimmer: (entryId: string) => void;
    onUpdateTrimmer: (entryId: string, trimmerId: string, updates: any) => void;
    onRemoveTrimmer: (entryId: string, trimmerId: string) => void;
    onDeleteBatch: (entryId: string) => void;
    onSubmitBatch?: (entryId: string) => void;
    onStartBatch?: (entryId: string) => void;
    onRevertBatch?: (entryId: string) => void;
    trimmerProfiles: any[];
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
                    <div className="empty-state">
                        <p>No batches found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

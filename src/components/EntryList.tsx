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
    trimmerProfiles
}) => {
    const activeBatches = entries.filter(entry => entry.status === 'active');
    const submittedBatches = entries.filter(entry => entry.status === 'submitted');

    return (
        <div className="entry-list-container">
            <div className="batches-section">
                <h2>Active Batches</h2>
                <div className="entry-grid">
                    {activeBatches.map(entry => (
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
                            trimmerProfiles={trimmerProfiles}
                        />
                    ))}
                    {activeBatches.length === 0 && (
                        <div className="empty-state">
                            <p>No active batches. Add a new batch to get started.</p>
                        </div>
                    )}
                </div>
            </div>

            {submittedBatches.length > 0 && (
                <div className="batches-section">
                    <h2>Submitted Batches</h2>
                    <div className="entry-grid">
                        {submittedBatches.map(entry => (
                            <TrimCard
                                key={entry.id}
                                entry={entry}
                                onUpdateWeight={onUpdateWeight}
                                onUpdateStrain={onUpdateStrain}
                                onAddTrimmer={onAddTrimmer}
                                onUpdateTrimmer={onUpdateTrimmer}
                                onRemoveTrimmer={onRemoveTrimmer}
                                onDeleteBatch={onDeleteBatch}
                                trimmerProfiles={trimmerProfiles}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

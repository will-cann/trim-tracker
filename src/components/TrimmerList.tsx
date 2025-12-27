import React from 'react';
import { Plus } from 'lucide-react';
import type { Trimmer, TrimmerProfile } from '../types/definitions';
import { TrimmerItem } from './TrimmerItem';

interface TrimmerListProps {
    trimmers: Trimmer[];
    profiles: TrimmerProfile[];
    onAddTrimmer?: () => void;
    onUpdateTrimmer?: (id: string, updates: Partial<Trimmer>) => void;
    onRemoveTrimmer?: (id: string) => void;
    readOnly?: boolean;
}

export const TrimmerList: React.FC<TrimmerListProps> = ({
    trimmers,
    profiles,
    onAddTrimmer,
    onUpdateTrimmer,
    onRemoveTrimmer,
    readOnly = false
}) => {
    return (
        <div className="trimmer-list-container">
            <div className="trimmer-list-header">
                <div className="header-title">
                    <h4>Trimmers</h4>
                </div>
                {!readOnly && onAddTrimmer && (
                    <button className="btn-add-trimmer" onClick={onAddTrimmer}>
                        <Plus size={16} />
                        <span>Add Trimmer</span>
                    </button>
                )}
            </div>

            {trimmers.length === 0 ? (
                <div className="no-trimmers">
                    <p>Add a trimmer to enter weights.</p>
                </div>
            ) : (
                <div className="trimmers-table">
                    <div className="trimmers-body">
                        {trimmers.map(trimmer => (
                            <TrimmerItem
                                key={trimmer.id}
                                trimmer={trimmer}
                                profiles={profiles}
                                onUpdate={onUpdateTrimmer || (() => { })}
                                onRemove={onRemoveTrimmer || (() => { })}
                                readOnly={readOnly}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

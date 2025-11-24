import React, { useState } from 'react';
import type { TrimEntry, Trimmer, TrimmerProfile } from '../types/definitions';
import { DonutChart } from './DonutChart';
import { TrimmerList } from './TrimmerList';
import { ChevronDown, Pencil, Check, X, Trash2, CheckCircle } from 'lucide-react';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

interface TrimCardProps {
    entry: TrimEntry;
    onUpdateWeight: (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => void;
    onUpdateStrain: (entryId: string, strain: string) => void;
    onAddTrimmer: (entryId: string) => void;
    onUpdateTrimmer: (entryId: string, trimmerId: string, updates: Partial<Trimmer>) => void;
    onRemoveTrimmer: (entryId: string, trimmerId: string) => void;
    onDeleteBatch: (entryId: string) => void;
    onSubmitBatch?: (entryId: string) => void;
    trimmerProfiles: TrimmerProfile[];
}

export const TrimCard: React.FC<TrimCardProps> = ({
    entry,
    // onUpdateWeight, // Kept in interface but unused in component body
    onUpdateStrain,
    onAddTrimmer,
    onUpdateTrimmer,
    onRemoveTrimmer,
    onDeleteBatch,
    onSubmitBatch,
    trimmerProfiles
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditingStrain, setIsEditingStrain] = useState(false);
    const [editStrainValue, setEditStrainValue] = useState(entry.strain || '');

    const toggleExpand = () => setIsExpanded(!isExpanded);

    const handleSaveStrain = (e: React.MouseEvent) => {
        e.stopPropagation();
        onUpdateStrain(entry.id, editStrainValue);
        setIsEditingStrain(false);
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditStrainValue(entry.strain || '');
        setIsEditingStrain(false);
    };

    const startEditing = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditingStrain(true);
        setEditStrainValue(entry.strain || '');
    };

    const totalWeight = entry.flowerWeight + entry.shakeWeight + entry.trimWeight + entry.wasteWeight;
    const progress = entry.startWeight > 0 ? (totalWeight / entry.startWeight) * 100 : 0;

    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = () => {
        onDeleteBatch(entry.id);
        setShowDeleteModal(false);
    };

    const handleSubmitBatch = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onSubmitBatch) {
            onSubmitBatch(entry.id);
        }
    };

    return (
        <>
            <div className={`trim-card ${isExpanded ? 'expanded' : ''} ${entry.status === 'submitted' ? 'submitted' : ''}`}>
                <div className="trim-card-header" onClick={toggleExpand}>
                    <div className="trim-card-top">
                        <div className="trim-card-title">
                            <h3>{entry.harvestName}</h3>
                            <div className="trim-card-subtitle">
                                {isEditingStrain ? (
                                    <div className="strain-edit-container" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="text"
                                            value={editStrainValue}
                                            onChange={e => setEditStrainValue(e.target.value)}
                                            className="strain-edit-input"
                                            autoFocus
                                        />
                                        <button className="icon-btn save-btn" onClick={handleSaveStrain}>
                                            <Check size={16} />
                                        </button>
                                        <button className="icon-btn cancel-btn" onClick={handleCancelEdit}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="strain-name">{entry.strain || 'No Strain'}</span>
                                        {entry.status === 'active' && (
                                            <button className="icon-btn edit-btn" onClick={startEditing}>
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </>
                                )}
                                <span className="separator">•</span>
                                <span className="license-number">{entry.licenseNumber}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {entry.status === 'active' && onSubmitBatch && (
                                <button
                                    className="icon-btn submit-batch-btn"
                                    onClick={handleSubmitBatch}
                                    title="Submit Batch"
                                >
                                    <CheckCircle size={20} />
                                </button>
                            )}
                            {entry.status === 'active' && (
                                <button
                                    className="icon-btn delete-batch-btn"
                                    onClick={handleDeleteClick}
                                    title="Delete Batch"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                            <div className="expand-icon">
                                <ChevronDown size={24} />
                            </div>
                        </div>
                    </div>

                    <div className="progress-bar-container">
                        <div className="progress-bar" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                    </div>

                    {!isExpanded && (
                        <div className="trim-card-summary">
                            <div className="summary-item">
                                <span className="label">Start</span>
                                <span className="value">{Math.round(entry.startWeight)}g</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Current</span>
                                <span className="value">{totalWeight.toFixed(0)}g</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Remaining</span>
                                <span className="value">{(entry.startWeight - totalWeight).toFixed(0)}g</span>
                            </div>
                        </div>
                    )}
                </div>

                {isExpanded && (
                    <div className="trim-card-body">
                        <div className="expanded-summary-container">
                            <div className="chart-stats-column">
                                <div className="main-stats-row">
                                    <div className="summary-item">
                                        <span className="label">Start</span>
                                        <span className="value">{Math.round(entry.startWeight)}g</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="label">Current</span>
                                        <span className="value">{totalWeight.toFixed(0)}g</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="label">Remaining</span>
                                        <span className="value">{(entry.startWeight - totalWeight).toFixed(0)}g</span>
                                    </div>
                                </div>
                                <div className="expanded-chart-wrapper">
                                    <DonutChart entry={entry} showLegend={false} height={140} />
                                </div>
                            </div>

                            <div className="breakdown-grid-container">
                                <div className="batch-summary-item">
                                    <span className="label">Flower</span>
                                    <span className="value text-flower">{Math.round(entry.flowerWeight)}g</span>
                                </div>
                                <div className="batch-summary-item">
                                    <span className="label">Shake</span>
                                    <span className="value text-shake">{Math.round(entry.shakeWeight)}g</span>
                                </div>
                                <div className="batch-summary-item">
                                    <span className="label">Trim</span>
                                    <span className="value text-trim">{Math.round(entry.trimWeight)}g</span>
                                </div>
                                <div className="batch-summary-item">
                                    <span className="label">Waste</span>
                                    <span className="value text-waste">{Math.round(entry.wasteWeight)}g</span>
                                </div>
                            </div>

                            <div className="compact-trimmers-section">
                                <TrimmerList
                                    trimmers={entry.trimmers || []}
                                    profiles={trimmerProfiles}
                                    onAddTrimmer={entry.status === 'active' ? () => onAddTrimmer(entry.id) : undefined}
                                    onUpdateTrimmer={entry.status === 'active' ? (trimmerId, updates) => onUpdateTrimmer(entry.id, trimmerId, updates) : undefined}
                                    onRemoveTrimmer={entry.status === 'active' ? (trimmerId) => onRemoveTrimmer(entry.id, trimmerId) : undefined}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showDeleteModal && (
                <DeleteConfirmationModal
                    title="Delete Batch"
                    message={`Are you sure you want to delete batch "${entry.harvestName}"? This action cannot be undone.`}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
        </>
    );
};

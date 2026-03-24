import React, { useState } from 'react';
import type { TrimEntry, Trimmer, TrimmerProfile } from '../types/definitions';
import { DonutChart } from './DonutChart';
import { TrimmerList } from './TrimmerList';
import { ChevronDown, Pencil, Check, X, Trash2, CheckCircle, Clock, Undo2 } from 'lucide-react';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { calculateDuration, formatDuration } from '../utils/timeUtils';

interface TrimCardProps {
    entry: TrimEntry;
    onUpdateWeight: (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => void;
    onUpdateStrain: (entryId: string, strain: string) => void;
    onAddTrimmer: (entryId: string) => void;
    onUpdateTrimmer: (entryId: string, trimmerId: string, updates: Partial<Trimmer>) => void;
    onRemoveTrimmer: (entryId: string, trimmerId: string) => void;
    onDeleteBatch: (entryId: string) => void;
    onSubmitBatch?: (entryId: string) => void;
    onStartBatch?: (entryId: string) => void;
    onRevertBatch?: (entryId: string) => void;
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
    onStartBatch,
    onRevertBatch,
    trimmerProfiles
}) => {
    const cardRef = React.useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditingStrain, setIsEditingStrain] = useState(false);
    const [editStrainValue, setEditStrainValue] = useState(entry.strain || '');
    const [isStatusHovered, setIsStatusHovered] = useState(false);
    const [justStarted, setJustStarted] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

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

    // Calculate total labor time
    const totalMinutes = (entry.trimmers || []).reduce((acc, trimmer) => {
        return acc + calculateDuration(trimmer.startTime, trimmer.endTime || '');
    }, 0);
    const totalTimeText = formatDuration(totalMinutes);

    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this batch?')) {
            onDeleteBatch(entry.id);
        }
    };

    const handleConfirmDelete = () => {
        onDeleteBatch(entry.id);
        setShowDeleteModal(false);
    };

    const validateBatch = (entry: TrimEntry): string | null => {
        if (!entry.trimmers || entry.trimmers.length === 0) {
            return "Please add at least one trimmer to the batch.";
        }

        for (const trimmer of entry.trimmers) {
            if (!trimmer.profileId) {
                return "All trimmers must have a selected profile.";
            }
            if (!trimmer.startTime) {
                return `Please enter a start time for ${trimmer.name || 'all trimmers'}.`;
            }
            if (!trimmer.endTime) {
                return `Please enter an end time for ${trimmer.name || 'all trimmers'}.`;
            }
        }

        return null;
    };

    const handleSubmitBatch = (e: React.MouseEvent) => {
        e.stopPropagation();

        const error = validateBatch(entry);
        if (error) {
            setValidationError(error);
            setIsExpanded(true);
            return;
        }

        setValidationError(null);
        if (onSubmitBatch) {
            onSubmitBatch(entry.id);
        }
    };

    const handleStartBatch = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(true);
        setJustStarted(true);
        if (onStartBatch) {
            onStartBatch(entry.id);
        }
    };

    // Auto-scroll to card when it's just been started
    React.useEffect(() => {
        if (justStarted && entry.status === 'active' && cardRef.current) {
            setTimeout(() => {
                cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setJustStarted(false);
            }, 100);
        }
    }, [justStarted, entry.status]);

    const canRevertToUpcoming = entry.status === 'active' && onRevertBatch;

    const getStatusBadge = () => {
        if (entry.status === 'upcoming') return { text: 'Upcoming', className: 'status-upcoming' };
        if (entry.status === 'active') return { text: 'Active', className: 'status-active' };
        if (entry.status === 'submitted') return { text: 'Complete', className: 'status-complete' };
        return { text: '', className: '' };
    };

    const statusBadge = getStatusBadge();

    const handleStatusBadgeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (canRevertToUpcoming && onRevertBatch) {
            onRevertBatch(entry.id);
        }
    };

    return (
        <>
            <div ref={cardRef} className={`trim-card ${isExpanded ? 'expanded' : ''} ${entry.status === 'submitted' ? 'submitted' : ''} ${entry.status === 'upcoming' ? 'upcoming' : ''}`}>
                <div className="trim-card-header" onClick={toggleExpand}>
                    <div className="trim-card-top">
                        <div className="trim-card-title">
                            <div className="title-with-badge">
                                <h3>{entry.harvestName}</h3>
                                {statusBadge.text && (
                                    <span
                                        className={`status-badge ${statusBadge.className} ${canRevertToUpcoming ? 'status-badge-outline clickable' : ''}`}
                                        onClick={canRevertToUpcoming ? handleStatusBadgeClick : undefined}
                                        onMouseEnter={() => canRevertToUpcoming && setIsStatusHovered(true)}
                                        onMouseLeave={() => setIsStatusHovered(false)}
                                        title={canRevertToUpcoming ? 'Click to move back to Upcoming' : undefined}
                                    >
                                        {canRevertToUpcoming && isStatusHovered ? (
                                            <>
                                                <Undo2 size={12} style={{ marginRight: '4px' }} />
                                                Upcoming
                                            </>
                                        ) : (
                                            statusBadge.text
                                        )}
                                    </span>
                                )}
                            </div>
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
                                {isExpanded && totalTimeText && (
                                    <>
                                        <span className="separator">•</span>
                                        <span className="total-time">
                                            <Clock size={14} />
                                            {totalTimeText}
                                        </span>
                                    </>
                                )}

                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {entry.status === 'upcoming' && onStartBatch && (
                                <button
                                    className="btn-start-batch"
                                    onClick={handleStartBatch}
                                    title="Start Batch"
                                >
                                    Start Batch
                                </button>
                            )}
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

                    {validationError && (
                        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-300 text-sm rounded mx-4 mt-2">
                            {validationError}
                        </div>
                    )}

                    {entry.status !== 'upcoming' && (
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                        </div>
                    )}

                    {!isExpanded && (
                        <div className="trim-card-summary">
                            {entry.status === 'upcoming' ? (
                                <>
                                    <div className="summary-item">
                                        <span className="label">Start Weight</span>
                                        <span className="value">{Math.round(entry.startWeight)}g</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="label">Status</span>
                                        <span className="value">Ready to Start</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="summary-item">
                                        <span className="label">Start</span>
                                        <span className="value">{Math.round(entry.startWeight)}g</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="label">Completed</span>
                                        <span className="value">{totalWeight.toFixed(0)}g</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="label">Remaining</span>
                                        <span className="value">{(entry.startWeight - totalWeight).toFixed(0)}g</span>
                                    </div>
                                </>
                            )}
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
                                        <span className="label">Completed</span>
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
                                    onAddTrimmer={entry.status === 'active' ? () => { setValidationError(null); onAddTrimmer(entry.id); } : undefined}
                                    onUpdateTrimmer={entry.status === 'active' ? (trimmerId, updates) => { setValidationError(null); onUpdateTrimmer(entry.id, trimmerId, updates); } : undefined}
                                    onRemoveTrimmer={entry.status === 'active' ? (trimmerId) => onRemoveTrimmer(entry.id, trimmerId) : undefined}
                                    readOnly={entry.status === 'submitted'}
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

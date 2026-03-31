import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Trash2, Snowflake, Flower2, ArrowRightLeft, Scissors, Clock, Plus, Scale, PackagePlus } from 'lucide-react';
import type { Harvest, HarvestWasteType, CreatePackageDTO } from '../../types/definitions';
import { WasteEntryForm } from './WasteEntryForm';
import { RecordWeightModal } from './RecordWeightModal';
import { AllocateModal } from './AllocateModal';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { CreatePackageModal } from '../Packages/CreatePackageModal';

interface HarvestCardProps {
    harvest: Harvest;
    onRecordWetWeight: (harvestId: string, weight: number) => void;
    onAllocate: (harvestId: string, allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }>) => void;
    onRecordWaste: (harvestId: string, wasteType: HarvestWasteType, weight: number) => void;
    onConvertToTrim: (allocationId: string) => void;
    onDelete: (harvestId: string) => void;
    onUpdate: (harvestId: string, updates: Record<string, any>) => void;
    onCreatePackage?: (data: CreatePackageDTO) => Promise<void>;
}

const STATUS_CLASS: Record<string, string> = {
    planning: 'status-upcoming',
    active: 'status-active',
    submitted: 'status-active',
    drying: 'status-drying',
    ready: 'status-complete',
    completed: 'status-complete',
};

const STATUS_LABEL: Record<string, string> = {
    planning: 'Planning',
    active: 'Active',
    submitted: 'Submitted',
    drying: 'Drying',
    ready: 'Ready',
    completed: 'Completed',
};

export const HarvestCard: React.FC<HarvestCardProps> = ({
    harvest,
    onRecordWetWeight,
    onAllocate,
    onRecordWaste,
    onConvertToTrim,
    onDelete,
    onUpdate,
    onCreatePackage,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showWeightModal, setShowWeightModal] = useState(false);
    const [showAllocateModal, setShowAllocateModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showPackageModal, setShowPackageModal] = useState(false);
    const [packagePrefill, setPackagePrefill] = useState<{ strain?: string; licenseNumber?: string; harvestId?: string; flowerWeight?: number } | null>(null);
    const [, setTick] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    const available = harvest.totalWetWeight - harvest.totalWasteWeight;

    const toggleExpand = useCallback(() => {
        const next = !isExpanded;
        setIsExpanded(next);
        if (next) {
            requestAnimationFrame(() => {
                cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
    }, [isExpanded]);

    // Tick every minute to keep drying time live
    useEffect(() => {
        if (harvest.status !== 'drying') return;
        const interval = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, [harvest.status]);

    const getDryingInfo = () => {
        const startDate = harvest.harvestEndDate || harvest.createdAt;
        if (!startDate || harvest.status !== 'drying') return null;
        const start = new Date(startDate);
        const now = new Date();
        const diffMs = now.getTime() - start.getTime();
        const days = Math.floor(diffMs / 86400000);
        const hours = Math.floor((diffMs % 86400000) / 3600000);
        return {
            harvestDate: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
            duration: days > 0 ? `${days}d ${hours}h` : `${hours}h`,
        };
    };
    const dryingInfo = getDryingInfo();

    return (
        <>
            <div ref={cardRef} className={`trim-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="trim-card-header" onClick={toggleExpand}>
                    <div className="trim-card-top">
                        <div className="trim-card-title">
                            <div className="title-with-badge">
                                <h3>{harvest.batchId}</h3>
                                <span className={`status-badge ${STATUS_CLASS[harvest.status] || ''}`}>
                                    {STATUS_LABEL[harvest.status] || harvest.status}
                                </span>
                                {harvest.isOnHold && (
                                    <span className="status-badge" style={{ backgroundColor: 'rgba(223, 91, 89, 0.12)', color: 'var(--danger-color)' }}>Hold</span>
                                )}
                            </div>
                            <div className="trim-card-subtitle">
                                <span className="strain-name">{harvest.strain}</span>
                                {harvest.licenseNumber && (
                                    <>
                                        <span className="separator">&bull;</span>
                                        <span className="license-number">{harvest.licenseNumber}</span>
                                    </>
                                )}
                                {harvest.plantCount > 0 && (
                                    <>
                                        <span className="separator">&bull;</span>
                                        <span>{harvest.plantCount} plant{harvest.plantCount > 1 ? 's' : ''}</span>
                                    </>
                                )}
                                {harvest.dryingLocation && (
                                    <>
                                        <span className="separator">&bull;</span>
                                        <span>{harvest.dryingLocation}</span>
                                    </>
                                )}
                                {dryingInfo && (
                                    <>
                                        <span className="separator">&bull;</span>
                                        <span>{dryingInfo.harvestDate}</span>
                                        <span className="separator">&bull;</span>
                                        <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--warning-color)' }}>
                                            <Clock size={11} />
                                            {dryingInfo.duration}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {harvest.status === 'planning' && (
                                <button
                                    className="icon-btn delete-batch-btn"
                                    onClick={e => { e.stopPropagation(); setShowDeleteModal(true); }}
                                    title="Delete Harvest"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                            <div className="expand-icon">
                                <ChevronDown size={24} />
                            </div>
                        </div>
                    </div>

                    {/* Collapsed summary */}
                    {!isExpanded && (
                        <div className="trim-card-summary">
                            <div className="summary-item">
                                <span className="label">Wet Weight</span>
                                {harvest.totalWetWeight > 0 ? (
                                    <span
                                        className="value cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); setShowWeightModal(true); }}
                                        title="Update weight"
                                    >
                                        {harvest.totalWetWeight.toFixed(0)}g
                                    </span>
                                ) : (
                                    <button
                                        className="ghost-action"
                                        onClick={(e) => { e.stopPropagation(); setShowWeightModal(true); }}
                                    >
                                        <Scale size={12} />
                                        Add
                                    </button>
                                )}
                            </div>
                            {harvest.allocations.length > 0 ? (
                                harvest.allocations.map(a => (
                                    <div className="summary-item" key={a.id}>
                                        <span className="label">{a.allocationType === 'flower' ? 'Flower' : 'Frozen'}</span>
                                        <span className="value">{a.targetWeight.toFixed(0)}g</span>
                                    </div>
                                ))
                            ) : (
                                <div className="summary-item">
                                    <span className="label">Allocation</span>
                                    <button
                                        className="ghost-action"
                                        onClick={(e) => { e.stopPropagation(); setShowAllocateModal(true); }}
                                    >
                                        <Plus size={12} />
                                        Set
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div className="trim-card-body" onClick={e => e.stopPropagation()}>
                        {/* Weight grid */}
                        <div className="trim-card-summary" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                            <div className="summary-item">
                                <span className="label">Wet Weight</span>
                                {harvest.totalWetWeight > 0 ? (
                                    <span
                                        className="value text-lg cursor-pointer"
                                        onClick={() => setShowWeightModal(true)}
                                        title="Update weight"
                                    >
                                        {harvest.totalWetWeight.toFixed(0)}g
                                    </span>
                                ) : (
                                    <button
                                        className="ghost-action"
                                        onClick={() => setShowWeightModal(true)}
                                    >
                                        <Scale size={12} />
                                        Record weight
                                    </button>
                                )}
                            </div>
                            <div className="summary-item">
                                <span className="label">Waste</span>
                                <span className="value text-lg" style={{ color: 'var(--danger-color)' }}>
                                    {harvest.totalWasteWeight.toFixed(0)}g
                                </span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Available</span>
                                <span className="value text-lg" style={{ color: 'var(--primary-color)' }}>
                                    {available > 0 ? `${available.toFixed(0)}g` : '0g'}
                                </span>
                            </div>
                        </div>

                        {harvest.plantCount > 0 && (
                            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                {harvest.plantCount} plant{harvest.plantCount > 1 ? 's' : ''}
                            </p>
                        )}

                        {/* Allocations */}
                        {harvest.allocations.length > 0 && (
                            <div className="mb-4">
                                <h4 className="card-section-heading">Allocations</h4>
                                {harvest.allocations.map(alloc => (
                                    <div
                                        key={alloc.id}
                                        className="flex justify-between items-center px-3 py-2 rounded-lg mb-1.5 text-sm"
                                        style={{ backgroundColor: alloc.allocationType === 'flower' ? 'rgba(250, 158, 82, 0.08)' : 'rgba(28, 158, 255, 0.08)' }}
                                    >
                                        <div className="flex items-center gap-2">
                                            {alloc.allocationType === 'flower'
                                                ? <Flower2 size={16} style={{ color: 'var(--warning-color)' }} />
                                                : <Snowflake size={16} style={{ color: 'var(--secondary-color)' }} />
                                            }
                                            <span className="font-medium">
                                                {alloc.allocationType === 'flower' ? 'Flower (Dry Trim)' : 'Fresh Frozen'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{alloc.targetWeight.toFixed(0)}g</span>
                                            <span className={`status-badge ${alloc.status === 'completed' ? 'status-complete' : 'status-upcoming'}`}>
                                                {alloc.status}
                                            </span>
                                            {alloc.allocationType === 'flower' && alloc.status !== 'completed' && harvest.status === 'ready' && (
                                                <button className="btn-start-batch" onClick={() => onConvertToTrim(alloc.id)}>
                                                    <Scissors size={12} className="mr-1" />
                                                    Send to Trim
                                                </button>
                                            )}
                                            {alloc.allocationType === 'frozen' && onCreatePackage && (
                                                <button
                                                    className="btn-start-batch"
                                                    onClick={() => {
                                                        setPackagePrefill({
                                                            strain: harvest.strain,
                                                            licenseNumber: harvest.licenseNumber,
                                                            harvestId: harvest.id,
                                                            flowerWeight: alloc.targetWeight,
                                                        });
                                                        setShowPackageModal(true);
                                                    }}
                                                >
                                                    <PackagePlus size={12} className="mr-1" />
                                                    Package
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Waste section */}
                        {harvest.status !== 'completed' && (
                            <div className="mb-4">
                                <h4 className="card-section-heading">Waste</h4>
                                <WasteEntryForm
                                    wasteEntries={harvest.waste}
                                    totalWasteWeight={harvest.totalWasteWeight}
                                    onAdd={(type, weight) => onRecordWaste(harvest.id, type, weight)}
                                />
                            </div>
                        )}

                        {/* Action buttons — only render when there are actions */}
                        {(((harvest.status === 'planning' || harvest.status === 'active') && harvest.allocations.length === 0)
                            || harvest.status === 'drying') && (
                            <div className="flex gap-2 flex-wrap pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                                {(harvest.status === 'planning' || harvest.status === 'active') && harvest.allocations.length === 0 && (
                                    <button className="btn-start-batch" onClick={() => setShowAllocateModal(true)}>
                                        <ArrowRightLeft size={14} className="mr-1" />
                                        Set Allocation
                                    </button>
                                )}
                                {harvest.status === 'drying' && (
                                    <button
                                        className="btn-start-batch"
                                        onClick={() => onUpdate(harvest.id, { status: 'ready' })}
                                    >
                                        Mark as Ready to Trim
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showWeightModal && (
                <RecordWeightModal
                    onClose={() => setShowWeightModal(false)}
                    onSubmit={weight => {
                        onRecordWetWeight(harvest.id, weight);
                        setShowWeightModal(false);
                    }}
                    currentWeight={harvest.totalWetWeight > 0 ? harvest.totalWetWeight : undefined}
                />
            )}
            {showAllocateModal && (
                <AllocateModal
                    harvest={harvest}
                    onClose={() => setShowAllocateModal(false)}
                    onSubmit={allocations => {
                        onAllocate(harvest.id, allocations);
                        setShowAllocateModal(false);
                    }}
                />
            )}
            {showDeleteModal && (
                <DeleteConfirmationModal
                    title="Delete Harvest"
                    message={`This will permanently remove "${harvest.batchId}" and all its weight and waste records.`}
                    onConfirm={() => {
                        onDelete(harvest.id);
                        setShowDeleteModal(false);
                    }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
            {showPackageModal && onCreatePackage && packagePrefill && (
                <CreatePackageModal
                    onClose={() => { setShowPackageModal(false); setPackagePrefill(null); }}
                    onSubmit={async (data) => {
                        if (Array.isArray(data)) {
                            for (const d of data) await onCreatePackage(d);
                        } else {
                            await onCreatePackage(data);
                        }
                        setShowPackageModal(false);
                        setPackagePrefill(null);
                    }}
                    prefill={packagePrefill}
                />
            )}
        </>
    );
};

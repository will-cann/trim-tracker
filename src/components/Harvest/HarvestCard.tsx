import React, { useState } from 'react';
import { ChevronDown, Trash2, Snowflake, Flower2, ArrowRightLeft, Scissors } from 'lucide-react';
import type { Harvest, HarvestWasteType } from '../../types/definitions';
import { WasteEntryForm } from './WasteEntryForm';
import { RecordWeightModal } from './RecordWeightModal';
import { AllocateModal } from './AllocateModal';

interface HarvestCardProps {
    harvest: Harvest;
    onRecordWetWeight: (harvestId: string, weight: number) => void;
    onAllocate: (harvestId: string, allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }>) => void;
    onRecordWaste: (harvestId: string, wasteType: HarvestWasteType, weight: number) => void;
    onConvertToTrim: (allocationId: string) => void;
    onDelete: (harvestId: string) => void;
    onUpdate: (harvestId: string, updates: Record<string, any>) => void;
}

const STATUS_CLASS: Record<string, string> = {
    planning: 'status-upcoming',
    active: 'status-active',
    drying: 'status-active',
    ready: 'status-complete',
    completed: 'status-complete',
};

const STATUS_LABEL: Record<string, string> = {
    planning: 'Planning',
    active: 'Active',
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
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showWeightModal, setShowWeightModal] = useState(false);
    const [showAllocateModal, setShowAllocateModal] = useState(false);

    const available = harvest.totalWetWeight - harvest.totalWasteWeight;

    return (
        <>
            <div className={`trim-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="trim-card-header" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="trim-card-top">
                        <div className="trim-card-title">
                            <div className="title-with-badge">
                                <h3>{harvest.batchId}</h3>
                                <span className={`status-badge ${STATUS_CLASS[harvest.status] || ''}`}>
                                    {STATUS_LABEL[harvest.status] || harvest.status}
                                </span>
                                {harvest.isOnHold && (
                                    <span className="status-badge" style={{ backgroundColor: '#fef2f2', color: '#ef4444' }}>Hold</span>
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
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {harvest.status === 'planning' && (
                                <button
                                    className="icon-btn delete-batch-btn"
                                    onClick={e => { e.stopPropagation(); if (confirm('Delete this harvest?')) onDelete(harvest.id); }}
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
                                        className="value"
                                        style={{ cursor: 'pointer' }}
                                        onClick={(e) => { e.stopPropagation(); setShowWeightModal(true); }}
                                        title="Update weight"
                                    >
                                        {harvest.totalWetWeight.toFixed(0)}g
                                    </span>
                                ) : (
                                    <span
                                        className="value"
                                        style={{ cursor: 'pointer', color: '#10b981' }}
                                        onClick={(e) => { e.stopPropagation(); setShowWeightModal(true); }}
                                        title="Record wet weight"
                                    >
                                        —
                                    </span>
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
                                    <span className="value">—</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div className="trim-card-body" onClick={e => e.stopPropagation()}>
                        {/* Weight grid */}
                        <div className="trim-card-summary" style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                            <div className="summary-item">
                                <span className="label">Wet Weight</span>
                                <span
                                    className="value"
                                    style={{ fontSize: '1.125rem', cursor: 'pointer' }}
                                    onClick={() => setShowWeightModal(true)}
                                    title={harvest.totalWetWeight > 0 ? 'Update weight' : 'Record wet weight'}
                                >
                                    {harvest.totalWetWeight > 0 ? `${harvest.totalWetWeight.toFixed(0)}g` : <span style={{ color: '#10b981' }}>—</span>}
                                </span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Waste</span>
                                <span className="value" style={{ fontSize: '1.125rem', color: '#ef4444' }}>
                                    {harvest.totalWasteWeight.toFixed(0)}g
                                </span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Available</span>
                                <span className="value" style={{ fontSize: '1.125rem', color: '#10b981' }}>
                                    {available > 0 ? `${available.toFixed(0)}g` : '—'}
                                </span>
                            </div>
                        </div>

                        {harvest.plantCount > 0 && (
                            <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 0.75rem' }}>
                                {harvest.plantCount} plant{harvest.plantCount > 1 ? 's' : ''}
                            </p>
                        )}

                        {/* Allocations */}
                        {harvest.allocations.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                    Allocations
                                </h4>
                                {harvest.allocations.map(alloc => (
                                    <div
                                        key={alloc.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '0.5rem 0.75rem',
                                            backgroundColor: alloc.allocationType === 'flower' ? '#fffbeb' : '#eff6ff',
                                            borderRadius: '0.5rem',
                                            marginBottom: '0.375rem',
                                            fontSize: '0.8125rem',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {alloc.allocationType === 'flower'
                                                ? <Flower2 size={16} color="#d97706" />
                                                : <Snowflake size={16} color="#3b82f6" />
                                            }
                                            <span style={{ fontWeight: 500 }}>
                                                {alloc.allocationType === 'flower' ? 'Flower (Dry Trim)' : 'Fresh Frozen'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontWeight: 600 }}>{alloc.targetWeight.toFixed(0)}g</span>
                                            <span className={`status-badge ${alloc.status === 'completed' ? 'status-complete' : 'status-upcoming'}`}>
                                                {alloc.status}
                                            </span>
                                            {alloc.allocationType === 'flower' && alloc.status !== 'completed' && harvest.status === 'ready' && (
                                                <button className="btn-start-batch" onClick={() => onConvertToTrim(alloc.id)}>
                                                    <Scissors size={12} style={{ marginRight: '0.25rem' }} />
                                                    Send to Trim
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Waste section */}
                        {harvest.status !== 'completed' && (
                            <div style={{ marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                    Waste
                                </h4>
                                <WasteEntryForm
                                    wasteEntries={harvest.waste}
                                    totalWasteWeight={harvest.totalWasteWeight}
                                    onAdd={(type, weight) => onRecordWaste(harvest.id, type, weight)}
                                />
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                            {harvest.status === 'active' && harvest.totalWetWeight > 0 && harvest.allocations.length === 0 && (
                                <button className="btn-start-batch" onClick={() => setShowAllocateModal(true)}>
                                    <ArrowRightLeft size={14} style={{ marginRight: '0.25rem' }} />
                                    Allocate
                                </button>
                            )}
                            {harvest.status === 'drying' && (
                                <button
                                    className="btn-start-batch"
                                    style={{ backgroundColor: '#10b981', color: 'white', borderColor: '#10b981' }}
                                    onClick={() => onUpdate(harvest.id, { status: 'ready' })}
                                >
                                    Mark Ready
                                </button>
                            )}
                        </div>
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
        </>
    );
};

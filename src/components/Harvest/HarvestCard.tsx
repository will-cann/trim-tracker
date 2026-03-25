import React, { useState } from 'react';
import { ChevronDown, Scale, Trash2, Snowflake, Flower2, ArrowRightLeft, Scissors } from 'lucide-react';
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

const STATUS_CONFIG: Record<string, { text: string; color: string; bg: string }> = {
    planning: { text: 'Planning', color: '#6b7280', bg: '#f3f4f6' },
    active: { text: 'Active', color: '#d97706', bg: '#fffbeb' },
    drying: { text: 'Drying', color: '#8b5cf6', bg: '#f5f3ff' },
    ready: { text: 'Ready', color: '#10b981', bg: '#ecfdf5' },
    completed: { text: 'Completed', color: '#6b7280', bg: '#f9fafb' },
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

    const status = STATUS_CONFIG[harvest.status] || STATUS_CONFIG.planning;
    const available = harvest.totalWetWeight - harvest.totalWasteWeight;
    const flowerAlloc = harvest.allocations.find(a => a.allocationType === 'flower');
    const frozenAlloc = harvest.allocations.find(a => a.allocationType === 'frozen');

    return (
        <>
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '0.75rem',
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s',
                    cursor: 'pointer',
                }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Header */}
                <div style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: 0 }}>
                                    {harvest.batchId}
                                </h3>
                                <span style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 600,
                                    padding: '0.125rem 0.5rem',
                                    borderRadius: '9999px',
                                    color: status.color,
                                    backgroundColor: status.bg,
                                    border: `1px solid ${status.color}20`,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.025em',
                                }}>
                                    {status.text}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                <span style={{ color: '#10b981', fontWeight: 500 }}>{harvest.strain}</span>
                                <span style={{ color: '#d1d5db' }}>·</span>
                                <span style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>{harvest.licenseNumber}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {harvest.status === 'planning' && (
                                <button
                                    onClick={e => { e.stopPropagation(); if (confirm('Delete this harvest?')) onDelete(harvest.id); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                >
                                    <Trash2 size={18} color="#ef4444" />
                                </button>
                            )}
                            <ChevronDown
                                size={20}
                                color="#9ca3af"
                                style={{
                                    transition: 'transform 0.2s',
                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                }}
                            />
                        </div>
                    </div>

                    {/* Summary row */}
                    {!isExpanded && (
                        <div style={{
                            display: 'flex',
                            gap: '1.5rem',
                            marginTop: '0.75rem',
                            fontSize: '0.8125rem',
                        }}>
                            <div>
                                <span style={{ color: '#9ca3af', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Wet Weight</span>
                                <p style={{ fontWeight: 600, color: '#111827', margin: '0.125rem 0 0' }}>
                                    {harvest.totalWetWeight > 0 ? `${harvest.totalWetWeight.toFixed(0)}g` : '—'}
                                </p>
                            </div>
                            <div>
                                <span style={{ color: '#9ca3af', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Waste</span>
                                <p style={{ fontWeight: 600, color: '#111827', margin: '0.125rem 0 0' }}>
                                    {harvest.totalWasteWeight > 0 ? `${harvest.totalWasteWeight.toFixed(0)}g` : '—'}
                                </p>
                            </div>
                            {harvest.allocations.length > 0 && (
                                <div>
                                    <span style={{ color: '#9ca3af', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Allocated</span>
                                    <p style={{ fontWeight: 600, color: '#111827', margin: '0.125rem 0 0' }}>
                                        {harvest.allocations.map(a => (
                                            <span key={a.id} style={{ marginRight: '0.5rem' }}>
                                                {a.allocationType === 'flower' ? '🌸' : '❄️'} {a.targetWeight.toFixed(0)}g
                                            </span>
                                        ))}
                                    </p>
                                </div>
                            )}
                            {harvest.dryingLocation && (
                                <div>
                                    <span style={{ color: '#9ca3af', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Location</span>
                                    <p style={{ fontWeight: 600, color: '#111827', margin: '0.125rem 0 0' }}>
                                        {harvest.dryingLocation}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div
                        style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid #f3f4f6' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Info grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '1rem',
                            padding: '1rem 0',
                        }}>
                            <div>
                                <span style={{ color: '#9ca3af', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Wet Weight</span>
                                <p style={{ fontWeight: 600, fontSize: '1.125rem', color: '#111827', margin: '0.125rem 0 0' }}>
                                    {harvest.totalWetWeight > 0 ? `${harvest.totalWetWeight.toFixed(0)}g` : '—'}
                                </p>
                            </div>
                            <div>
                                <span style={{ color: '#9ca3af', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Waste</span>
                                <p style={{ fontWeight: 600, fontSize: '1.125rem', color: '#ef4444', margin: '0.125rem 0 0' }}>
                                    {harvest.totalWasteWeight.toFixed(0)}g
                                </p>
                            </div>
                            <div>
                                <span style={{ color: '#9ca3af', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Available</span>
                                <p style={{ fontWeight: 600, fontSize: '1.125rem', color: '#10b981', margin: '0.125rem 0 0' }}>
                                    {available > 0 ? `${available.toFixed(0)}g` : '—'}
                                </p>
                            </div>
                        </div>

                        {harvest.plantCount > 0 && (
                            <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                                {harvest.plantCount} plant{harvest.plantCount > 1 ? 's' : ''}
                                {harvest.dryingLocation && ` · ${harvest.dryingLocation}`}
                            </p>
                        )}

                        {/* Allocations */}
                        {harvest.allocations.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
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
                                            backgroundColor: alloc.allocationType === 'flower' ? '#fef3c7' : '#dbeafe',
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
                                            <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                                                {alloc.allocationType === 'flower' ? 'Flower (Dry Trim)' : 'Fresh Frozen'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span>{alloc.targetWeight.toFixed(0)}g</span>
                                            <span style={{
                                                fontSize: '0.6875rem',
                                                padding: '0.125rem 0.375rem',
                                                borderRadius: '4px',
                                                backgroundColor: alloc.status === 'completed' ? '#dcfce7' : '#f3f4f6',
                                                color: alloc.status === 'completed' ? '#16a34a' : '#6b7280',
                                            }}>
                                                {alloc.status}
                                            </span>
                                            {alloc.allocationType === 'flower' && alloc.status !== 'completed' && harvest.status === 'ready' && (
                                                <button
                                                    onClick={() => onConvertToTrim(alloc.id)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '0.375rem',
                                                        border: '1px solid #10b981',
                                                        backgroundColor: '#ecfdf5',
                                                        color: '#065f46',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <Scissors size={12} />
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
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
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
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
                            {(harvest.status === 'planning' || harvest.status === 'active') && (
                                <button
                                    onClick={() => setShowWeightModal(true)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                                        padding: '0.375rem 0.75rem', borderRadius: '0.375rem',
                                        border: '1px solid #d1d5db', backgroundColor: 'white',
                                        fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 500,
                                    }}
                                >
                                    <Scale size={14} />
                                    {harvest.totalWetWeight > 0 ? 'Update Weight' : 'Record Wet Weight'}
                                </button>
                            )}

                            {harvest.status === 'active' && harvest.totalWetWeight > 0 && harvest.allocations.length === 0 && (
                                <button
                                    onClick={() => setShowAllocateModal(true)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                                        padding: '0.375rem 0.75rem', borderRadius: '0.375rem',
                                        border: '1px solid #10b981', backgroundColor: '#ecfdf5',
                                        color: '#065f46', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 500,
                                    }}
                                >
                                    <ArrowRightLeft size={14} />
                                    Allocate
                                </button>
                            )}

                            {harvest.status === 'drying' && (
                                <button
                                    onClick={() => onUpdate(harvest.id, { status: 'ready' })}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                                        padding: '0.375rem 0.75rem', borderRadius: '0.375rem',
                                        border: '1px solid #10b981', backgroundColor: '#10b981',
                                        color: 'white', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 500,
                                    }}
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

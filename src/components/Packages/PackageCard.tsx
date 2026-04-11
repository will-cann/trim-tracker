import React, { useState } from 'react';
import { ChevronDown, Trash2, Pause, Play, CheckCircle, MapPin, Tag, FlaskConical, Pencil, X, Save, Cloud, Scale } from 'lucide-react';
import type { Package, LabTestingState, AdjustmentReason, PackageAdjustment } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { TypeChip } from '../ui';

interface PackageCardProps {
    pkg: Package;
    onUpdate: (packageId: string, updates: Record<string, any>) => void;
    onDelete: (packageId: string) => void;
}

const STATUS_CLASS: Record<string, string> = {
    active: 'status-complete',
    on_hold: 'status-upcoming',
    finished: 'status-finished',
    archived: 'status-finished',
};

const STATUS_LABEL: Record<string, string> = {
    active: 'Active',
    on_hold: 'On Hold',
    finished: 'Finished',
    archived: 'Archived',
};

const LAB_LABEL: Record<string, string> = {
    not_submitted: 'Not Submitted',
    submitted: 'Submitted',
    passed: 'Passed',
    failed: 'Failed',
};

const LAB_CLASS: Record<string, string> = {
    not_submitted: 'text-[var(--color-dolphin)]',
    submitted: 'text-[#FA9E52]',
    passed: 'text-[var(--color-flower)]',
    failed: 'text-[var(--color-waste)]',
};

const LAB_OPTIONS: { value: LabTestingState; label: string }[] = [
    { value: 'not_submitted', label: 'Not Submitted' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' },
];

const ADJUSTMENT_REASONS: { value: AdjustmentReason; label: string }[] = [
    { value: 'Waste', label: 'Waste' },
    { value: 'Moisture Loss', label: 'Moisture Loss' },
    { value: 'Processing Loss', label: 'Processing Loss' },
    { value: 'Theft', label: 'Theft' },
    { value: 'Reconciliation', label: 'Reconciliation' },
];

interface EditFields {
    wasteWeight: number;
    location: string;
    labTestingState: LabTestingState;
    itemName: string;
    notes: string;
}

export const PackageCard: React.FC<PackageCardProps> = ({ pkg, onUpdate, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localFields, setLocalFields] = useState<EditFields>({
        wasteWeight: pkg.wasteWeight,
        location: pkg.location || '',
        labTestingState: pkg.labTestingState,
        itemName: pkg.itemName || '',
        notes: pkg.notes || '',
    });

    // Adjustment state
    const [showAdjustForm, setShowAdjustForm] = useState(false);
    const [adjustDelta, setAdjustDelta] = useState('');
    const [adjustReason, setAdjustReason] = useState<AdjustmentReason>('Waste');
    const [adjustNotes, setAdjustNotes] = useState('');
    const [adjusting, setAdjusting] = useState(false);
    const [adjustments, setAdjustments] = useState<(PackageAdjustment & { createdByName?: string })[]>([]);
    const [adjustmentsLoaded, setAdjustmentsLoaded] = useState(false);

    const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);

    const isEditable = pkg.status === 'active' || pkg.status === 'on_hold';

    const enterEditMode = async () => {
        if (rooms.length === 0) {
            try {
                const r = await apiService.getRooms();
                setRooms(r);
            } catch { /* rooms will be empty, location falls back to text */ }
        }
        setLocalFields({
            wasteWeight: pkg.wasteWeight,
            location: pkg.location || '',
            labTestingState: pkg.labTestingState,
            itemName: pkg.itemName || '',
            notes: pkg.notes || '',
        });
        setError(null);
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setError(null);
    };

    const handleCollapse = () => {
        if (isEditing) cancelEdit();
        setIsExpanded(false);
    };

    const handleSave = async () => {
        if (localFields.wasteWeight < 0) {
            setError('Waste weight cannot be negative');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const updates: Record<string, any> = {};
            if (localFields.wasteWeight !== pkg.wasteWeight) updates.wasteWeight = localFields.wasteWeight;
            if ((localFields.location || '') !== (pkg.location || '')) updates.location = localFields.location || null;
            if (localFields.labTestingState !== pkg.labTestingState) updates.labTestingState = localFields.labTestingState;
            if ((localFields.itemName || '') !== (pkg.itemName || '')) updates.itemName = localFields.itemName || null;
            if ((localFields.notes || '') !== (pkg.notes || '')) updates.notes = localFields.notes || null;

            if (Object.keys(updates).length > 0) {
                await onUpdate(pkg.id, updates);
            }
            setIsEditing(false);
        } catch {
            setError('Save failed — try again');
        } finally {
            setSaving(false);
        }
    };

    const updateField = <K extends keyof EditFields>(field: K, value: EditFields[K]) => {
        setLocalFields(prev => ({ ...prev, [field]: value }));
    };

    const netWeight = isEditing
        ? pkg.quantity - localFields.wasteWeight
        : pkg.quantity - pkg.wasteWeight;

    const loadAdjustments = async () => {
        if (adjustmentsLoaded) return;
        try {
            const data = await apiService.getPackageAdjustments(pkg.id);
            setAdjustments(data as any);
            setAdjustmentsLoaded(true);
        } catch { /* silent */ }
    };

    const handleAdjust = async () => {
        const delta = Number(adjustDelta);
        if (!delta || delta === 0) {
            setError('Enter a non-zero adjustment amount');
            return;
        }
        setAdjusting(true);
        setError(null);
        try {
            const result = await apiService.createPackageAdjustment({
                packageId: pkg.id,
                quantityDelta: delta,
                reason: adjustReason,
                notes: adjustNotes || undefined,
            });
            // Refresh package via parent
            onUpdate(pkg.id, {});
            // Add to local history
            setAdjustments(prev => [result.adjustment as any, ...prev]);
            setShowAdjustForm(false);
            setAdjustDelta('');
            setAdjustNotes('');
        } catch (e: any) {
            setError(e.message || 'Adjustment failed');
        } finally {
            setAdjusting(false);
        }
    };

    return (
        <>
            <div className={`trim-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="trim-card-header" onClick={() => isExpanded ? handleCollapse() : setIsExpanded(true)}>
                    <div className="trim-card-top">
                        <div className="trim-card-title">
                            <div className="title-with-badge">
                                <h3>{pkg.label}</h3>
                                <span className={`status-badge ${STATUS_CLASS[pkg.status] || ''}`}>
                                    {STATUS_LABEL[pkg.status] || pkg.status}
                                </span>
                                <TypeChip palette="packageType" value={pkg.packageType} />
                            </div>
                            <div className="trim-card-subtitle">
                                <span className="strain-name">{pkg.strain}</span>
                                <span className="separator">&bull;</span>
                                <span>{pkg.quantity.toFixed(0)}g</span>
                                {pkg.licenseNumber && (
                                    <>
                                        <span className="separator">&bull;</span>
                                        <span className="license-number">{pkg.licenseNumber}</span>
                                    </>
                                )}
                                {pkg.location && (
                                    <>
                                        <span className="separator">&bull;</span>
                                        <span>{pkg.location}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isExpanded && isEditable && !isEditing && (
                                <button
                                    className="icon-btn"
                                    onClick={(e) => { e.stopPropagation(); enterEditMode(); }}
                                    title="Edit package"
                                >
                                    <Pencil size={16} />
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
                                <span className="label">Quantity</span>
                                <span className="value">{pkg.quantity.toFixed(0)}g</span>
                            </div>
                            {pkg.wasteWeight > 0 && (
                                <div className="summary-item">
                                    <span className="label">Waste</span>
                                    <span className="value text-[var(--color-waste)]">{pkg.wasteWeight.toFixed(0)}g</span>
                                </div>
                            )}
                            <div className="summary-item">
                                <span className="label">Lab Testing</span>
                                <span className={`value ${LAB_CLASS[pkg.labTestingState]}`}>
                                    {LAB_LABEL[pkg.labTestingState]}
                                </span>
                            </div>
                            {pkg.tagNumber && (
                                <div className="summary-item">
                                    <span className="label">Tag</span>
                                    <span className="value">{pkg.tagNumber}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div className="trim-card-body" onClick={e => e.stopPropagation()}>
                        {/* Quantity / Waste / Net */}
                        <div className="trim-card-summary border-b border-[var(--background-color)] pb-3 mb-3">
                            <div className="summary-item">
                                <span className="label">Quantity</span>
                                <span className="value text-lg">{pkg.quantity.toFixed(1)}g</span>
                            </div>
                            {isEditing ? (
                                <div className="summary-item">
                                    <span className="label">Waste</span>
                                    <div className="field-input-wrap" style={{ maxWidth: 120 }}>
                                        <input
                                            type="number"
                                            className="field-input"
                                            value={localFields.wasteWeight}
                                            onChange={e => updateField('wasteWeight', Number(e.target.value))}
                                            min="0"
                                            step="0.1"
                                        />
                                        <span className="field-input-unit">g</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="summary-item">
                                    <span className="label">Waste</span>
                                    <span className="value text-lg text-[var(--color-waste)]">{pkg.wasteWeight.toFixed(1)}g</span>
                                </div>
                            )}
                            <div className="summary-item">
                                <span className="label">Net</span>
                                <span className={`value text-lg ${netWeight >= 0 ? 'text-[var(--color-flower)]' : 'text-[var(--color-waste)]'}`}>
                                    {netWeight.toFixed(1)}g
                                </span>
                            </div>
                            {isEditable && !isEditing && !showAdjustForm && (
                                <button
                                    className="icon-btn"
                                    onClick={() => { setShowAdjustForm(true); loadAdjustments(); }}
                                    title="Adjust quantity"
                                    style={{ alignSelf: 'center' }}
                                >
                                    <Scale size={14} />
                                </button>
                            )}
                        </div>

                        {/* Adjust quantity form */}
                        {showAdjustForm && (
                            <div style={{
                                padding: '10px 12px',
                                marginBottom: '12px',
                                borderRadius: '8px',
                                background: 'var(--detail-bg)',
                                border: '1px solid var(--detail-border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--detail-text-strong)' }}>
                                    Adjust Quantity
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
                                    <div className="field" style={{ flex: '0 0 120px' }}>
                                        <label className="field-label" style={{ fontSize: '11px' }}>Amount (g)</label>
                                        <input
                                            type="number"
                                            className="field-input"
                                            value={adjustDelta}
                                            onChange={e => setAdjustDelta(e.target.value)}
                                            placeholder="-50"
                                            step="0.1"
                                            style={{ fontSize: '13px' }}
                                        />
                                    </div>
                                    <div className="field" style={{ flex: 1 }}>
                                        <label className="field-label" style={{ fontSize: '11px' }}>Reason</label>
                                        <select
                                            className="field-input"
                                            value={adjustReason}
                                            onChange={e => setAdjustReason(e.target.value as AdjustmentReason)}
                                            style={{ fontSize: '13px' }}
                                        >
                                            {ADJUSTMENT_REASONS.map(r => (
                                                <option key={r.value} value={r.value}>{r.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    className="field-input"
                                    value={adjustNotes}
                                    onChange={e => setAdjustNotes(e.target.value)}
                                    placeholder="Notes (optional)"
                                    style={{ fontSize: '13px' }}
                                />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn-start-batch"
                                        onClick={handleAdjust}
                                        disabled={adjusting || !adjustDelta || Number(adjustDelta) === 0}
                                    >
                                        {adjusting ? 'Adjusting...' : 'Apply'}
                                    </button>
                                    <button
                                        className="btn-cancel"
                                        onClick={() => { setShowAdjustForm(false); setError(null); }}
                                        disabled={adjusting}
                                    >
                                        Cancel
                                    </button>
                                    {adjustDelta && Number(adjustDelta) !== 0 && (
                                        <span style={{ fontSize: '12px', color: 'var(--detail-text)', alignSelf: 'center' }}>
                                            {pkg.quantity.toFixed(1)}g → {(pkg.quantity + Number(adjustDelta)).toFixed(1)}g
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Adjustment history */}
                        {adjustmentsLoaded && adjustments.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--detail-text)', marginBottom: '6px' }}>
                                    Adjustment History
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {adjustments.slice(0, 5).map(adj => (
                                        <div key={adj.id} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            fontSize: '12px',
                                            color: 'var(--detail-text)',
                                            padding: '4px 0',
                                            borderBottom: '1px solid var(--detail-bg-hover)',
                                        }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={{
                                                    fontWeight: 600,
                                                    color: adj.quantityDelta > 0 ? 'var(--color-flower)' : 'var(--color-waste)',
                                                }}>
                                                    {adj.quantityDelta > 0 ? '+' : ''}{adj.quantityDelta.toFixed(1)}g
                                                </span>
                                                <span style={{
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    background: 'var(--detail-bg-hover)',
                                                    fontSize: '11px',
                                                }}>
                                                    {adj.reason}
                                                </span>
                                                {adj.notes && (
                                                    <span style={{ fontStyle: 'italic', color: 'var(--detail-text-light)' }}>
                                                        {adj.notes}
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ color: 'var(--detail-text-light)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                {new Date(adj.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    ))}
                                    {adjustments.length > 5 && (
                                        <div style={{ fontSize: '11px', color: 'var(--detail-text-light)', textAlign: 'center', padding: '4px 0' }}>
                                            +{adjustments.length - 5} more
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Details */}
                        <div className="space-y-2 mb-4">
                            {pkg.tagNumber && (
                                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <Tag size={14} className="text-[var(--color-dolphin)]" />
                                    <span className="font-medium">Tag:</span> {pkg.tagNumber}
                                </div>
                            )}

                            {/* Location */}
                            {isEditing ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <MapPin size={14} className="text-[var(--color-dolphin)] shrink-0" />
                                    <span className="font-medium shrink-0">Location:</span>
                                    <select
                                        className="field-input text-sm flex-1"
                                        value={localFields.location}
                                        onChange={e => updateField('location', e.target.value)}
                                    >
                                        <option value="">Select room...</option>
                                        {rooms.map(r => (
                                            <option key={r.id} value={r.name}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : pkg.location ? (
                                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <MapPin size={14} className="text-[var(--color-dolphin)]" />
                                    <span className="font-medium">Location:</span> {pkg.location}
                                </div>
                            ) : null}

                            {/* Lab Testing State */}
                            {isEditing ? (
                                <div className="flex items-start gap-2 text-sm">
                                    <FlaskConical size={14} className="text-[var(--color-dolphin)] mt-1 shrink-0" />
                                    <div>
                                        <span className="font-medium">Lab Testing:</span>
                                        <div className="chip-group mt-1">
                                            {LAB_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => updateField('labTestingState', opt.value)}
                                                    className={`chip ${localFields.labTestingState === opt.value ? 'chip-active' : ''}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <FlaskConical size={14} className={LAB_CLASS[pkg.labTestingState]} />
                                    <span className="font-medium">Lab Testing:</span>
                                    <span className={LAB_CLASS[pkg.labTestingState]}>
                                        {LAB_LABEL[pkg.labTestingState]}
                                    </span>
                                </div>
                            )}

                            {/* Item Name */}
                            {isEditing ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium shrink-0">Item:</span>
                                    <input
                                        type="text"
                                        className="field-input text-sm flex-1"
                                        value={localFields.itemName}
                                        onChange={e => updateField('itemName', e.target.value)}
                                        placeholder="Enter item name"
                                    />
                                </div>
                            ) : pkg.itemName ? (
                                <div className="text-sm text-[var(--text-secondary)]">
                                    <span className="font-medium">Item:</span> {pkg.itemName}
                                </div>
                            ) : null}

                            {/* Notes */}
                            {isEditing ? (
                                <div className="text-sm">
                                    <span className="font-medium text-[var(--text-secondary)]">Notes:</span>
                                    <textarea
                                        className="field-input text-sm w-full mt-1"
                                        rows={2}
                                        value={localFields.notes}
                                        onChange={e => updateField('notes', e.target.value)}
                                        placeholder="Add notes..."
                                    />
                                </div>
                            ) : pkg.notes ? (
                                <div className="text-sm text-[var(--text-secondary)] mt-2 italic">
                                    {pkg.notes}
                                </div>
                            ) : null}

                            {/* METRC Compliance Details — only show when there's visible METRC data */}
                            {(pkg.isProductionBatch || pkg.isTradeSample || pkg.isDonation || (pkg.sourceHarvestNames && pkg.sourceHarvestNames.length > 0) || (pkg.sourcePackageLabels && pkg.sourcePackageLabels.length > 0)) && (
                                <div style={{
                                    marginTop: '8px',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    background: 'var(--detail-bg)',
                                    border: '1px solid var(--detail-border)',
                                    fontSize: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                }}>
                                    <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--detail-text)', marginBottom: '2px' }}>
                                        METRC
                                    </div>
                                    {pkg.sourceHarvestNames && pkg.sourceHarvestNames.length > 0 && (
                                        <div className="text-[var(--text-secondary)]">
                                            <span className="font-medium">Source Harvests:</span> {pkg.sourceHarvestNames.join(', ')}
                                        </div>
                                    )}
                                    {pkg.sourcePackageLabels && pkg.sourcePackageLabels.length > 0 && (
                                        <div className="text-[var(--text-secondary)]">
                                            <span className="font-medium">Source Packages:</span> {pkg.sourcePackageLabels.join(', ')}
                                        </div>
                                    )}
                                    {(pkg.isProductionBatch || pkg.isTradeSample || pkg.isDonation) && (
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {pkg.isProductionBatch && (
                                                <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--detail-bg-hover)', color: 'var(--detail-text-strong)' }}>
                                                    Production Batch
                                                </span>
                                            )}
                                            {pkg.isTradeSample && (
                                                <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--detail-bg-hover)', color: 'var(--detail-text-strong)' }}>
                                                    Trade Sample
                                                </span>
                                            )}
                                            {pkg.isDonation && (
                                                <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--detail-bg-hover)', color: 'var(--detail-text-strong)' }}>
                                                    Donation
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="text-xs text-[var(--color-dolphin)] mt-2" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>
                                    Packaged: {new Date(pkg.packagedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {pkg.finishedDate && (
                                        <> &bull; Finished: {new Date(pkg.finishedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                    )}
                                </span>
                                {pkg.metrcSyncedAt && (
                                    <span title={`Synced: ${new Date(pkg.metrcSyncedAt).toLocaleString()}`}>
                                        <Cloud size={12} className="text-[var(--color-flower)]" />
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Error banner */}
                        {error && (
                            <div className="text-sm text-[var(--color-waste)] bg-[#FDF2F2] border border-[#F5C6C6] rounded-lg px-3 py-2 mb-3">
                                {error}
                            </div>
                        )}

                        {/* Edit mode Save/Cancel */}
                        {isEditing && (
                            <div className="flex gap-2 pt-3 border-t border-[var(--background-color)] mb-2">
                                <button
                                    className="btn-start-batch"
                                    onClick={handleSave}
                                    disabled={saving}
                                >
                                    <Save size={12} className="mr-1" />
                                    {saving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    className="btn-cancel"
                                    onClick={cancelEdit}
                                    disabled={saving}
                                >
                                    <X size={12} className="mr-1" />
                                    Cancel
                                </button>
                            </div>
                        )}

                        {/* Status Actions */}
                        {!isEditing && pkg.status !== 'archived' && (
                            <div className="flex gap-2 flex-wrap pt-3 border-t border-[var(--background-color)]">
                                {pkg.status === 'active' && (
                                    <>
                                        <button
                                            className="btn-start-batch"
                                            onClick={() => onUpdate(pkg.id, { status: 'on_hold' })}
                                        >
                                            <Pause size={12} className="mr-1" />
                                            Hold
                                        </button>
                                        <button
                                            className="btn-start-batch"
                                            onClick={() => onUpdate(pkg.id, { status: 'finished' })}
                                        >
                                            <CheckCircle size={12} className="mr-1" />
                                            Finish
                                        </button>
                                    </>
                                )}
                                {pkg.status === 'on_hold' && (
                                    <button
                                        className="btn-start-batch"
                                        onClick={() => onUpdate(pkg.id, { status: 'active' })}
                                    >
                                        <Play size={12} className="mr-1" />
                                        Release
                                    </button>
                                )}
                                {pkg.status === 'finished' && (
                                    <button
                                        className="btn-start-batch"
                                        onClick={() => onUpdate(pkg.id, { status: 'active' })}
                                    >
                                        <Play size={12} className="mr-1" />
                                        Reactivate
                                    </button>
                                )}
                                <button
                                    className="icon-btn delete-batch-btn"
                                    onClick={() => setShowDeleteModal(true)}
                                    title="Delete Package"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showDeleteModal && (
                <DeleteConfirmationModal
                    title="Delete Package"
                    message={`Are you sure you want to delete package "${pkg.label}"? This cannot be undone.`}
                    onConfirm={() => {
                        onDelete(pkg.id);
                        setShowDeleteModal(false);
                    }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
        </>
    );
};

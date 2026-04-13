import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Pause, Play, CheckCircle, MapPin, Tag, FlaskConical, Save, X, Scale, Cloud, ChevronDown, Loader2 } from 'lucide-react';
import type { Package, AdjustmentReason, PackageAdjustment, Tag as TagType } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { Modal, TypeChip } from '../ui';
import { LAB_LABEL, LAB_CLASS, LAB_OPTIONS, ADJUSTMENT_REASONS, type EditFields } from './packageConstants';

interface PackageDetailModalProps {
    pkg: Package;
    onUpdate: (packageId: string, updates: Record<string, any>) => void;
    onDelete: (packageId: string) => void;
    onRefresh: () => Promise<void>;
    onClose: () => void;
    userRole?: string;
}

export const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
    pkg, onUpdate, onDelete, onRefresh, onClose, userRole,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
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

    // Tag assignment state
    const [availableTags, setAvailableTags] = useState<TagType[]>([]);
    const [tagsLoaded, setTagsLoaded] = useState(false);
    const [tagsLoading, setTagsLoading] = useState(false);
    const [assigningTag, setAssigningTag] = useState(false);

    const isEditable = pkg.status === 'active' || pkg.status === 'on_hold';
    const canDelete = userRole === 'admin' || userRole === 'director';

    const loadAvailableTags = useCallback(async () => {
        if (tagsLoaded) return;
        setTagsLoading(true);
        try {
            const tags = await apiService.getTags({ status: 'available' });
            setAvailableTags(tags);
            setTagsLoaded(true);
        } catch { /* silent */ }
        setTagsLoading(false);
    }, [tagsLoaded]);

    // Load tags on mount if package has no tag and is editable
    useEffect(() => {
        if (isEditable && !pkg.tagId) loadAvailableTags();
    }, [isEditable, pkg.tagId, loadAvailableTags]);

    const handleAssignTag = async (tagId: string) => {
        setAssigningTag(true);
        try {
            await apiService.assignTag(tagId, undefined, undefined, pkg.id);
            await onRefresh();
        } catch { /* silent */ }
        setAssigningTag(false);
    };

    const handleUnassignTag = async () => {
        if (!pkg.tagId) return;
        setAssigningTag(true);
        try {
            await apiService.unassignTag(pkg.tagId);
            await onRefresh();
        } catch { /* silent */ }
        setAssigningTag(false);
    };

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
            onRefresh();
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

    const handleStatusChange = (status: string) => {
        onUpdate(pkg.id, { status });
    };

    const formatDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const title = (
        <div className="flex items-center gap-2 flex-wrap">
            <span>{pkg.label}</span>
            <TypeChip palette="packageStatus" value={pkg.status} />
            <TypeChip palette="packageType" value={pkg.packageType} />
        </div>
    );

    const footer = (
        <div className="flex items-center justify-between w-full">
            <div>
                {canDelete && pkg.status !== 'archived' && (
                    <button
                        className="icon-btn delete-batch-btn"
                        onClick={() => setShowDeleteModal(true)}
                        title="Delete Package"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
            <div className="flex gap-2">
                {isEditing ? (
                    <>
                        <button
                            className="btn-start-batch"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            <Save size={12} className="mr-1" />
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn-cancel" onClick={cancelEdit} disabled={saving}>
                            <X size={12} className="mr-1" />
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        {isEditable && (
                            <button className="btn-start-batch" onClick={enterEditMode}>
                                Edit
                            </button>
                        )}
                        {!isEditing && pkg.status !== 'archived' && (
                            <>
                                {pkg.status === 'active' && (
                                    <>
                                        <button className="btn-start-batch" onClick={() => handleStatusChange('on_hold')}>
                                            <Pause size={12} className="mr-1" /> Hold
                                        </button>
                                        <button className="btn-start-batch" onClick={() => handleStatusChange('finished')}>
                                            <CheckCircle size={12} className="mr-1" /> Finish
                                        </button>
                                    </>
                                )}
                                {pkg.status === 'on_hold' && (
                                    <button className="btn-start-batch" onClick={() => handleStatusChange('active')}>
                                        <Play size={12} className="mr-1" /> Release
                                    </button>
                                )}
                                {pkg.status === 'finished' && (
                                    <button className="btn-start-batch" onClick={() => handleStatusChange('active')}>
                                        <Play size={12} className="mr-1" /> Reactivate
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );

    return (
        <>
            <Modal title={title} size="lg" onClose={onClose} footer={footer}>
                {/* Read-only summary */}
                <div className="space-y-1 text-sm text-[var(--text-secondary)] mb-4">
                    <div><span className="font-medium">Strain:</span> {pkg.strain}</div>
                    {pkg.licenseNumber && (
                        <div><span className="font-medium">License:</span> <span className="license-number">{pkg.licenseNumber}</span></div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-[var(--color-dolphin)]">
                        <span>Packaged: {formatDate(pkg.packagedDate)}</span>
                        {pkg.finishedDate && <span>Finished: {formatDate(pkg.finishedDate)}</span>}
                        {pkg.metrcSyncedAt && (
                            <span className="flex items-center gap-1" title={`Synced: ${new Date(pkg.metrcSyncedAt).toLocaleString()}`}>
                                <Cloud size={12} className="text-[var(--color-flower)]" /> Synced
                            </span>
                        )}
                    </div>
                    {/* Tag assignment */}
                    <div className="flex items-center gap-2">
                        <Tag size={14} className="text-[var(--color-dolphin)]" />
                        <span className="font-medium">Tag:</span>
                        {pkg.tagNumber ? (
                            <>
                                <span className="license-number">{pkg.tagNumber}</span>
                                {isEditable && (
                                    <button
                                        className="text-xs text-[var(--color-dolphin)] hover:text-[var(--color-waste)]"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit' }}
                                        onClick={handleUnassignTag}
                                        disabled={assigningTag}
                                        title="Remove tag"
                                    >
                                        {assigningTag ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                                    </button>
                                )}
                            </>
                        ) : isEditable ? (
                            <div style={{ position: 'relative', flex: 1, maxWidth: 200 }}>
                                <select
                                    className="field-input text-sm"
                                    style={{ paddingRight: 24, appearance: 'none', cursor: 'pointer' }}
                                    value=""
                                    onChange={e => { if (e.target.value) handleAssignTag(e.target.value); }}
                                    onFocus={() => { if (!tagsLoaded) loadAvailableTags(); }}
                                    disabled={assigningTag}
                                >
                                    <option value="">
                                        {tagsLoading ? 'Loading...' : assigningTag ? 'Assigning...' : 'Assign tag...'}
                                    </option>
                                    {availableTags.map(t => (
                                        <option key={t.id} value={t.id}>{t.tagNumber}</option>
                                    ))}
                                </select>
                                <ChevronDown size={12} style={{
                                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                    color: 'var(--color-dolphin)', pointerEvents: 'none',
                                }} />
                            </div>
                        ) : (
                            <span style={{ color: 'var(--color-dolphin)' }}>None</span>
                        )}
                    </div>
                </div>

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
                                    {pkg.quantity.toFixed(1)}g &rarr; {(pkg.quantity + Number(adjustDelta)).toFixed(1)}g
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

                {/* Editable fields */}
                <div className="space-y-2 mb-4">
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

                    {/* METRC Compliance Details */}
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
                </div>

                {/* Error banner */}
                {error && (
                    <div className="text-sm text-[var(--color-waste)] bg-[#FDF2F2] border border-[#F5C6C6] rounded-lg px-3 py-2 mb-3">
                        {error}
                    </div>
                )}
            </Modal>

            {showDeleteModal && (
                <DeleteConfirmationModal
                    title="Delete Package"
                    message={`Are you sure you want to delete package "${pkg.label}"? This cannot be undone.`}
                    onConfirm={() => {
                        setShowDeleteModal(false);
                        onClose();
                        onDelete(pkg.id);
                    }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
        </>
    );
};

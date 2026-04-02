import React, { useState } from 'react';
import { ChevronDown, Trash2, Pause, Play, CheckCircle, MapPin, Tag, FlaskConical, Pencil, X, Save } from 'lucide-react';
import type { Package, LabTestingState } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';

interface PackageCardProps {
    pkg: Package;
    onUpdate: (packageId: string, updates: Record<string, any>) => void;
    onDelete: (packageId: string) => void;
}

const STATUS_CLASS: Record<string, string> = {
    active: 'status-active',
    on_hold: 'status-upcoming',
    finished: 'status-complete',
    archived: 'status-complete',
};

const STATUS_LABEL: Record<string, string> = {
    active: 'Active',
    on_hold: 'On Hold',
    finished: 'Finished',
    archived: 'Archived',
};

const TYPE_CLASS: Record<string, string> = {
    flower: 'bg-[#FFF8E7] text-[#B8860B]',
    trim: 'bg-[#ECFDF5] text-[#3BB570]',
    shake: 'bg-[#EFF8FF] text-[#1C9EFF]',
    fresh_frozen: 'bg-[#ECFEFF] text-[#0E7490]',
    bubble_hash: 'bg-[#FFF7ED] text-[#FA9E52]',
    rosin: 'bg-[#FFF8E7] text-[#B8860B]',
    rosin_cart: 'bg-[#F5F3FF] text-[#7C6AE8]',
};

const TYPE_LABEL: Record<string, string> = {
    flower: 'Flower',
    trim: 'Trim',
    shake: 'Shake',
    fresh_frozen: 'Fresh Frozen',
    bubble_hash: 'Bubble Hash',
    rosin: 'Rosin',
    rosin_cart: 'Rosin Cart',
};

const LAB_LABEL: Record<string, string> = {
    not_submitted: 'Not Submitted',
    submitted: 'Submitted',
    passed: 'Passed',
    failed: 'Failed',
};

const LAB_CLASS: Record<string, string> = {
    not_submitted: 'text-[#C0C0C0]',
    submitted: 'text-[#FA9E52]',
    passed: 'text-[#3BB570]',
    failed: 'text-[#DF5B59]',
};

const LAB_OPTIONS: { value: LabTestingState; label: string }[] = [
    { value: 'not_submitted', label: 'Not Submitted' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' },
];

interface EditFields {
    quantity: number;
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
        quantity: pkg.quantity,
        wasteWeight: pkg.wasteWeight,
        location: pkg.location || '',
        labTestingState: pkg.labTestingState,
        itemName: pkg.itemName || '',
        notes: pkg.notes || '',
    });

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
            quantity: pkg.quantity,
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
        if (localFields.quantity <= 0) {
            setError('Quantity must be greater than 0');
            return;
        }
        if (localFields.wasteWeight < 0) {
            setError('Waste weight cannot be negative');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const updates: Record<string, any> = {};
            if (localFields.quantity !== pkg.quantity) updates.quantity = localFields.quantity;
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
        ? localFields.quantity - localFields.wasteWeight
        : pkg.quantity - pkg.wasteWeight;

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
                                <span className={`status-badge ${TYPE_CLASS[pkg.packageType] || ''}`}>
                                    {TYPE_LABEL[pkg.packageType] || pkg.packageType.charAt(0).toUpperCase() + pkg.packageType.slice(1)}
                                </span>
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
                                    <span className="value text-[#DF5B59]">{pkg.wasteWeight.toFixed(0)}g</span>
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
                        <div className="trim-card-summary border-b border-[#F1F1F1] pb-3 mb-3">
                            {isEditing ? (
                                <>
                                    <div className="summary-item">
                                        <span className="label">Quantity</span>
                                        <div className="field-input-wrap" style={{ maxWidth: 120 }}>
                                            <input
                                                type="number"
                                                className="field-input"
                                                value={localFields.quantity}
                                                onChange={e => updateField('quantity', Number(e.target.value))}
                                                min="0.1"
                                                step="0.1"
                                            />
                                            <span className="field-input-unit">g</span>
                                        </div>
                                    </div>
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
                                    <div className="summary-item">
                                        <span className="label">Net</span>
                                        <span className={`value text-lg ${netWeight >= 0 ? 'text-[#3BB570]' : 'text-[#DF5B59]'}`}>
                                            {netWeight.toFixed(1)}g
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="summary-item">
                                        <span className="label">Quantity</span>
                                        <span className="value text-lg">{pkg.quantity.toFixed(1)}g</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="label">Waste</span>
                                        <span className="value text-lg text-[#DF5B59]">{pkg.wasteWeight.toFixed(1)}g</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="label">Net</span>
                                        <span className="value text-lg text-[#3BB570]">
                                            {(pkg.quantity - pkg.wasteWeight).toFixed(1)}g
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Details */}
                        <div className="space-y-2 mb-4">
                            {pkg.tagNumber && (
                                <div className="flex items-center gap-2 text-sm text-[#959595]">
                                    <Tag size={14} className="text-[#C0C0C0]" />
                                    <span className="font-medium">Tag:</span> {pkg.tagNumber}
                                </div>
                            )}

                            {/* Location */}
                            {isEditing ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <MapPin size={14} className="text-[#C0C0C0] shrink-0" />
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
                                <div className="flex items-center gap-2 text-sm text-[#959595]">
                                    <MapPin size={14} className="text-[#C0C0C0]" />
                                    <span className="font-medium">Location:</span> {pkg.location}
                                </div>
                            ) : null}

                            {/* Lab Testing State */}
                            {isEditing ? (
                                <div className="flex items-start gap-2 text-sm">
                                    <FlaskConical size={14} className="text-[#C0C0C0] mt-1 shrink-0" />
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
                                <div className="flex items-center gap-2 text-sm text-[#959595]">
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
                                <div className="text-sm text-[#959595]">
                                    <span className="font-medium">Item:</span> {pkg.itemName}
                                </div>
                            ) : null}

                            {/* Notes */}
                            {isEditing ? (
                                <div className="text-sm">
                                    <span className="font-medium text-[#959595]">Notes:</span>
                                    <textarea
                                        className="field-input text-sm w-full mt-1"
                                        rows={2}
                                        value={localFields.notes}
                                        onChange={e => updateField('notes', e.target.value)}
                                        placeholder="Add notes..."
                                    />
                                </div>
                            ) : pkg.notes ? (
                                <div className="text-sm text-[#959595] mt-2 italic">
                                    {pkg.notes}
                                </div>
                            ) : null}

                            <div className="text-xs text-[#C0C0C0] mt-2">
                                Packaged: {new Date(pkg.packagedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {pkg.finishedDate && (
                                    <> &bull; Finished: {new Date(pkg.finishedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                )}
                            </div>
                        </div>

                        {/* Error banner */}
                        {error && (
                            <div className="text-sm text-[#DF5B59] bg-[#FDF2F2] border border-[#F5C6C6] rounded-lg px-3 py-2 mb-3">
                                {error}
                            </div>
                        )}

                        {/* Edit mode Save/Cancel */}
                        {isEditing && (
                            <div className="flex gap-2 pt-3 border-t border-[#F1F1F1] mb-2">
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
                            <div className="flex gap-2 flex-wrap pt-3 border-t border-[#F1F1F1]">
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

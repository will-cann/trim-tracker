import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { CreatePackageDTO, PackageType, Strain, License } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

interface CreatePackageModalProps {
    onClose: () => void;
    onSubmit: (data: CreatePackageDTO | CreatePackageDTO[]) => void;
    prefill?: {
        strain?: string;
        licenseNumber?: string;
        harvestId?: string;
        trimEntryId?: string;
        flowerWeight?: number;
        trimWeight?: number;
        shakeWeight?: number;
    };
}

const PACKAGE_TYPES: { value: PackageType; label: string }[] = [
    { value: 'flower', label: 'Flower' },
    { value: 'trim', label: 'Trim' },
    { value: 'shake', label: 'Shake' },
    { value: 'fresh_frozen', label: 'Fresh Frozen' },
    { value: 'bubble_hash', label: 'Bubble Hash' },
    { value: 'rosin', label: 'Rosin' },
    { value: 'rosin_cart', label: 'Rosin Cart' },
];

type PackageRow = {
    key: string;
    label: string;
    packageType: PackageType;
    quantity: string;
    location: string;
};

function buildAutoRows(prefill: CreatePackageModalProps['prefill']): PackageRow[] | null {
    if (!prefill) return null;
    const { flowerWeight, shakeWeight, trimWeight, strain } = prefill;
    const hasMultiple = [flowerWeight, shakeWeight, trimWeight].filter(w => w && w > 0).length > 0;
    if (!hasMultiple) return null;

    const rows: PackageRow[] = [];
    const prefix = strain ? strain.replace(/\s+/g, '-').substring(0, 10).toUpperCase() : 'PKG';
    const date = new Date().toISOString().slice(0, 10);

    if (flowerWeight && flowerWeight > 0) {
        rows.push({
            key: 'flower',
            label: `${prefix}-FLR-${date}`,
            packageType: 'flower',
            quantity: String(Math.round(flowerWeight)),
            location: '',
        });
    }
    if (shakeWeight && shakeWeight > 0) {
        rows.push({
            key: 'shake',
            label: `${prefix}-SHAKE-${date}`,
            packageType: 'shake',
            quantity: String(Math.round(shakeWeight)),
            location: '',
        });
    }
    if (trimWeight && trimWeight > 0) {
        rows.push({
            key: 'trim',
            label: `${prefix}-TRIM-${date}`,
            packageType: 'trim',
            quantity: String(Math.round(trimWeight)),
            location: '',
        });
    }
    return rows.length > 0 ? rows : null;
}

export const CreatePackageModal: React.FC<CreatePackageModalProps> = ({ onClose, onSubmit, prefill }) => {
    // Detect batch mode from trim entry prefill
    const [autoRows, setAutoRows] = useState<PackageRow[] | null>(() => buildAutoRows(prefill));
    const isBatchMode = autoRows !== null && autoRows.length > 0;

    // Single-package state (fallback)
    const [label, setLabel] = useState('');
    const [packageType, setPackageType] = useState<PackageType>('flower');
    const [strainId, setStrainId] = useState('');
    const [licenseId, setLicenseId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [wasteWeight, setWasteWeight] = useState('');
    const [location, setLocation] = useState('');
    const [notes, setNotes] = useState('');

    const [strains, setStrains] = useState<Strain[]>([]);
    const [licenses, setLicenses] = useState<License[]>([]);
    const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            apiService.getStrains().then(setStrains),
            apiService.getMyLicenses().then(setLicenses),
            apiService.getRooms().then(setRooms),
        ]).finally(() => setLoading(false));
    }, []);

    // Auto-select strain/license from prefill
    useEffect(() => {
        if (!loading && prefill) {
            if (prefill.strain) {
                const match = strains.find(s => s.name.toLowerCase() === prefill.strain!.toLowerCase());
                if (match) setStrainId(match.id);
            }
            if (prefill.licenseNumber) {
                const match = licenses.find(l => l.licenseNumber === prefill.licenseNumber);
                if (match) setLicenseId(match.id);
            }
            if (!isBatchMode && prefill.flowerWeight && packageType === 'flower') {
                setQuantity(String(prefill.flowerWeight));
            }
        }
    }, [loading, prefill, strains, licenses, packageType, isBatchMode]);

    const selectedStrain = strains.find(s => s.id === strainId);
    const selectedLicense = licenses.find(l => l.id === licenseId);

    const canSubmitBatch = isBatchMode && strainId && licenseId && autoRows!.every(r => r.label && Number(r.quantity) > 0);
    const canSubmitSingle = !isBatchMode && label && strainId && licenseId && quantity && Number(quantity) > 0;
    const canSubmit = canSubmitBatch || canSubmitSingle;

    const updateRow = (key: string, field: keyof PackageRow, value: string) => {
        setAutoRows(prev => prev!.map(r => r.key === key ? { ...r, [field]: value } : r));
    };

    const removeRow = (key: string) => {
        setAutoRows(prev => {
            const next = prev!.filter(r => r.key !== key);
            return next.length > 0 ? next : null;
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStrain || !selectedLicense) return;

        if (isBatchMode && autoRows) {
            const dtos: CreatePackageDTO[] = autoRows.map(row => ({
                label: row.label,
                packageType: row.packageType,
                strain: selectedStrain.name,
                licenseNumber: selectedLicense.licenseNumber,
                quantity: Number(row.quantity),
                location: row.location || undefined,
                harvestId: prefill?.harvestId,
                trimEntryId: prefill?.trimEntryId,
            }));
            onSubmit(dtos);
        } else {
            const dto: CreatePackageDTO = {
                label,
                packageType,
                strain: selectedStrain.name,
                licenseNumber: selectedLicense.licenseNumber,
                quantity: Number(quantity),
                wasteWeight: wasteWeight ? Number(wasteWeight) : undefined,
                location: location || undefined,
                notes: notes || undefined,
                harvestId: prefill?.harvestId,
                trimEntryId: prefill?.trimEntryId,
            };
            onSubmit(dto);
        }
    };

    const typeLabel = (t: PackageType) => PACKAGE_TYPES.find(p => p.value === t)?.label || t;

    return (
        <Modal title={isBatchMode ? 'Create Packages from Trim' : 'New Package'} contentClassName="creation-modal" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="create-package-form" disabled={!canSubmit}>
                    {isBatchMode ? `Create ${autoRows!.length} Package${autoRows!.length > 1 ? 's' : ''}` : 'Create Package'}
                </Button>
            </>
        }>
            {loading ? (
                <CenteredSpinner label="Loading package data…" height="py-12" />
            ) : (
                <form id="create-package-form" onSubmit={handleSubmit}>
                    {/* Strain + License (shared for all packages) */}
                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">
                                Strain <span className="required">*</span>
                            </label>
                            <select
                                className="field-input"
                                value={strainId}
                                onChange={e => setStrainId(e.target.value)}
                                required
                            >
                                <option value="">Select strain</option>
                                {strains.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">
                                License <span className="required">*</span>
                            </label>
                            {licenses.length === 0 ? (
                                <p className="field-hint">No licenses found</p>
                            ) : (
                                <div className="chip-group">
                                    {licenses.map(lic => (
                                        <button
                                            key={lic.id}
                                            type="button"
                                            onClick={() => setLicenseId(lic.id)}
                                            className={`ai-license-pill ${lic.id === licenseId ? 'active' : ''}`}
                                        >
                                            {lic.label || lic.licenseNumber}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {isBatchMode && autoRows ? (
                        /* ── Batch Mode: auto-generated rows ── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            {autoRows.map(row => (
                                <div
                                    key={row.key}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr auto 80px auto',
                                        gap: '8px',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-elephant-50)',
                                        border: '1px solid var(--color-elephant-200)',
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <input
                                            type="text"
                                            value={row.label}
                                            onChange={e => updateRow(row.key, 'label', e.target.value)}
                                            className="field-input"
                                            style={{ fontSize: '13px', padding: '4px 8px' }}
                                            placeholder="Package label"
                                        />
                                    </div>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: 'var(--color-elephant-500)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        padding: '2px 8px',
                                        background: 'var(--color-elephant-100)',
                                        borderRadius: '4px',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {typeLabel(row.packageType)}
                                    </span>
                                    <div className="field-input-wrap" style={{ margin: 0 }}>
                                        <input
                                            type="number"
                                            value={row.quantity}
                                            onChange={e => updateRow(row.key, 'quantity', e.target.value)}
                                            className="field-input"
                                            style={{ fontSize: '13px', padding: '4px 8px', textAlign: 'right' }}
                                            min="0.01"
                                            step="0.01"
                                        />
                                        <span className="field-input-unit">g</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeRow(row.key)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--color-elephant-400)',
                                            padding: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                        }}
                                        title="Remove"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}

                            {/* Location for all */}
                            <div className="field" style={{ marginTop: '4px' }}>
                                <label className="field-label">Location</label>
                                <select
                                    className="field-input"
                                    value={autoRows[0]?.location || ''}
                                    onChange={e => {
                                        const loc = e.target.value;
                                        setAutoRows(prev => prev!.map(r => ({ ...r, location: loc })));
                                    }}
                                >
                                    <option value="">Select room...</option>
                                    {rooms.map(r => (
                                        <option key={r.id} value={r.name}>{r.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ) : (
                        /* ── Single Package Mode ── */
                        <>
                            <div className="field-row">
                                <div className="field">
                                    <label className="field-label">
                                        Label <span className="required">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="field-input"
                                        value={label}
                                        onChange={e => setLabel(e.target.value)}
                                        placeholder="PKG-001"
                                        required
                                    />
                                </div>
                                <div className="field">
                                    <label className="field-label">
                                        Type <span className="required">*</span>
                                    </label>
                                    <div className="chip-group">
                                        {PACKAGE_TYPES.map(pt => (
                                            <button
                                                key={pt.value}
                                                type="button"
                                                onClick={() => setPackageType(pt.value)}
                                                className={`chip ${packageType === pt.value ? 'chip-active' : ''}`}
                                            >
                                                {pt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="field-row">
                                <div className="field">
                                    <label className="field-label">
                                        Quantity <span className="required">*</span>
                                    </label>
                                    <div className="field-input-wrap">
                                        <input
                                            type="number"
                                            className="field-input"
                                            value={quantity}
                                            onChange={e => setQuantity(e.target.value)}
                                            placeholder="0"
                                            min="0.01"
                                            step="0.01"
                                            required
                                        />
                                        <span className="field-input-unit">g</span>
                                    </div>
                                </div>
                                <div className="field">
                                    <label className="field-label">Waste</label>
                                    <div className="field-input-wrap">
                                        <input
                                            type="number"
                                            className="field-input"
                                            value={wasteWeight}
                                            onChange={e => setWasteWeight(e.target.value)}
                                            placeholder="0"
                                            min="0"
                                            step="0.01"
                                        />
                                        <span className="field-input-unit">g</span>
                                    </div>
                                </div>
                            </div>

                            <div className="field-row">
                                <div className="field">
                                    <label className="field-label">Location</label>
                                    <select
                                        className="field-input"
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                    >
                                        <option value="">Select room...</option>
                                        {rooms.map(r => (
                                            <option key={r.id} value={r.name}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="field">
                                <label className="field-label">Notes</label>
                                <textarea
                                    className="field-input"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Optional notes..."
                                    rows={2}
                                />
                            </div>
                        </>
                    )}
                </form>
            )}
        </Modal>
    );
};

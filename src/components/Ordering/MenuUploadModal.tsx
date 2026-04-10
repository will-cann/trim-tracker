import { useState, useRef, useCallback } from 'react';
import { Upload, Check, X, Loader2, AlertCircle, FileText, CheckCircle2, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

// ── Shared types (used by dashboard too) ──────────────────────────────────

export interface ParsedProduct {
    name: string;
    brand?: string;
    category?: string;
    sku?: string;
    unitSize?: string;
    caseSize?: number;
    unitPrice?: number;
    casePrice?: number;
    _selected: boolean;
    _sourceFile?: string;
    /** Group key — derived from the source file's detected vendor name. Mutable in the review UI. */
    _vendorGroup: string;
}

export interface FileStatus {
    name: string;
    status: 'pending' | 'parsing' | 'done' | 'error';
    productCount?: number;
    error?: string;
    detectedVendor?: string;
}

export interface ParseState {
    active: boolean;
    step: 'parsing' | 'review' | 'saving' | 'done';
    fileStatuses: FileStatus[];
    products: ParsedProduct[];
    vendorName: string;
    notes: string;
    error: string;
    fileName: string;
}

export const EMPTY_PARSE_STATE: ParseState = {
    active: false,
    step: 'parsing',
    fileStatuses: [],
    products: [],
    vendorName: '',
    notes: '',
    error: '',
    fileName: '',
};

// ── File parser (called from dashboard, survives modal close) ─────────────

async function parseOneFile(file: File): Promise<{ products: any[]; vendorName?: string; notes?: string }> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let fileContent: string;
    let fileType: 'text' | 'pdf' | 'image';

    if (ext === 'pdf') {
        fileType = 'pdf';
        const buf = await file.arrayBuffer();
        fileContent = btoa(String.fromCharCode(...new Uint8Array(buf)));
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        fileType = 'image';
        const buf = await file.arrayBuffer();
        fileContent = btoa(String.fromCharCode(...new Uint8Array(buf)));
    } else if (['xlsx', 'xls'].includes(ext)) {
        fileType = 'text';
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: 'array' });
        const sheets = workbook.SheetNames.map(name => {
            const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
            return workbook.SheetNames.length > 1 ? `--- Sheet: ${name} ---\n${csv}` : csv;
        });
        fileContent = sheets.join('\n\n');
    } else {
        fileType = 'text';
        fileContent = await file.text();
    }

    return apiService.parseVendorMenu({ fileName: file.name, fileContent, fileType });
}

export async function processFiles(
    files: File[],
    onUpdate: (updater: (prev: ParseState) => ParseState) => void,
) {
    const statuses: FileStatus[] = files.map(f => ({ name: f.name, status: 'pending' as const }));
    const fileName = files.length === 1 ? files[0].name : `${files.length} files`;

    onUpdate(() => ({
        active: true,
        step: 'parsing',
        fileStatuses: statuses,
        products: [],
        vendorName: '',
        notes: '',
        error: '',
        fileName,
    }));

    const allProducts: ParsedProduct[] = [];
    const allNotes: string[] = [];
    let firstDetectedVendor = '';

    for (let i = 0; i < files.length; i++) {
        onUpdate(prev => ({
            ...prev,
            fileStatuses: prev.fileStatuses.map((s, idx) => idx === i ? { ...s, status: 'parsing' } : s),
        }));

        try {
            const result = await parseOneFile(files[i]);

            // Each file gets its OWN detected vendor — don't collapse into one
            const fileVendor = result.vendorName?.trim()
                || files[i].name.replace(/\.[^.]+$/, '');

            if (!firstDetectedVendor) firstDetectedVendor = fileVendor;

            if (result.notes) {
                allNotes.push(files.length > 1 ? `**${files[i].name}:** ${result.notes}` : result.notes);
            }

            const fileProducts = (result.products || []).map((p: any) => ({
                ...p,
                _selected: true,
                _sourceFile: files[i].name,
                _vendorGroup: fileVendor,
            }));
            allProducts.push(...fileProducts);

            onUpdate(prev => ({
                ...prev,
                fileStatuses: prev.fileStatuses.map((s, idx) =>
                    idx === i ? { ...s, status: 'done', productCount: fileProducts.length, detectedVendor: fileVendor } : s
                ),
            }));
        } catch (err: any) {
            onUpdate(prev => ({
                ...prev,
                fileStatuses: prev.fileStatuses.map((s, idx) =>
                    idx === i ? { ...s, status: 'error', error: err.message } : s
                ),
            }));
        }
    }

    if (!allProducts.length) {
        onUpdate(prev => ({ ...prev, active: false, error: 'No products found across any uploaded files.' }));
        return;
    }

    onUpdate(prev => ({
        ...prev,
        step: 'review',
        products: allProducts,
        vendorName: firstDetectedVendor || prev.vendorName,
        notes: allNotes.join('\n\n'),
    }));
}

// ── Modal props ───────────────────────────────────────────────────────────

interface Props {
    parseState: ParseState;
    onUpdateParseState: (updater: (prev: ParseState) => ParseState) => void;
    onStartParse: (files: File[]) => void;
    onClose: () => void;
    onSaved: () => void;
}

export const MenuUploadModal: React.FC<Props> = ({
    parseState,
    onUpdateParseState,
    onStartParse,
    onClose,
    onSaved,
}) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notesExpanded, setNotesExpanded] = useState(false);

    const { step, fileStatuses, products, notes, error, fileName } = parseState;
    const isUpload = !parseState.active;
    const isParsing = step === 'parsing' && parseState.active;
    const isReview = step === 'review' && parseState.active;

    const setError = (err: string) => onUpdateParseState(prev => ({ ...prev, error: err }));

    // Group products by vendor for the review UI
    const vendorGroups = products.reduce<Record<string, ParsedProduct[]>>((acc, p) => {
        const key = p._vendorGroup || 'Unknown Vendor';
        if (!acc[key]) acc[key] = [];
        acc[key].push(p);
        return acc;
    }, {});
    const vendorGroupKeys = Object.keys(vendorGroups);

    const renameVendorGroup = (oldName: string, newName: string) => {
        if (!newName.trim() || newName === oldName) return;
        onUpdateParseState(prev => ({
            ...prev,
            products: prev.products.map(p =>
                p._vendorGroup === oldName ? { ...p, _vendorGroup: newName } : p
            ),
        }));
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onStartParse(files);
    }, [onStartParse]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length) onStartParse(files);
    };

    const toggleProduct = (idx: number) => {
        onUpdateParseState(prev => ({
            ...prev,
            products: prev.products.map((p, i) => i === idx ? { ...p, _selected: !p._selected } : p),
        }));
    };

    const toggleAllInGroup = (groupKey: string) => {
        const group = products.filter(p => p._vendorGroup === groupKey);
        const allSelected = group.every(p => p._selected);
        onUpdateParseState(prev => ({
            ...prev,
            products: prev.products.map(p =>
                p._vendorGroup === groupKey ? { ...p, _selected: !allSelected } : p
            ),
        }));
    };

    const handleSave = async () => {
        const selected = products.filter(p => p._selected);
        if (!selected.length) return;

        // Group selected products by vendor and save each group separately
        const groups = selected.reduce<Record<string, ParsedProduct[]>>((acc, p) => {
            const key = (p._vendorGroup || '').trim();
            if (!key) return acc;
            if (!acc[key]) acc[key] = [];
            acc[key].push(p);
            return acc;
        }, {});

        const groupKeys = Object.keys(groups);
        if (!groupKeys.length) {
            setError('All selected products are missing a vendor name.');
            return;
        }

        setSaving(true);
        onUpdateParseState(prev => ({ ...prev, step: 'saving' }));
        try {
            for (const vName of groupKeys) {
                await apiService.bulkSaveVendorProducts({
                    vendorName: vName,
                    fileName,
                    products: groups[vName].map(({ _selected, _sourceFile, _vendorGroup, ...p }) => p),
                });
            }
            onUpdateParseState(() => EMPTY_PARSE_STATE);
            onSaved();
        } catch (err: unknown) {
            setError((err as Error).message || 'Failed to save products');
            onUpdateParseState(prev => ({ ...prev, step: 'review' }));
        } finally {
            setSaving(false);
        }
    };

    const handleBack = () => {
        onUpdateParseState(() => EMPTY_PARSE_STATE);
    };

    const selectedCount = products.filter(p => p._selected).length;
    const fmt = (n?: number) => n != null ? `$${n.toFixed(2)}` : '';
    const hasMultipleFiles = fileStatuses.length > 1;

    return (
        <Modal
            title="Upload Vendor Menu"
            onClose={onClose}
            contentClassName="creation-modal"
            footer={
                isReview ? (
                    <>
                        <Button variant="secondary" onClick={handleBack}>Back</Button>
                        <Button variant="primary" disabled={selectedCount === 0 || saving} onClick={handleSave}>
                            {saving
                                ? 'Saving…'
                                : `Save ${selectedCount} Product${selectedCount !== 1 ? 's' : ''} (${vendorGroupKeys.length} vendor${vendorGroupKeys.length !== 1 ? 's' : ''})`}
                        </Button>
                    </>
                ) : isUpload ? (
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                ) : undefined
            }
        >
            {/* Step: Upload */}
            {isUpload && (
                <>
                    <div
                        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={28} style={{ margin: '0 auto 12px', color: dragging ? 'var(--primary-color)' : 'var(--text-secondary)' }} />
                        <div className="dropzone-title">Drop vendor menus here or click to browse</div>
                        <div className="dropzone-hint">
                            Excel (.xlsx), CSV, PDF, or image — select multiple files to bulk upload
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
                            multiple
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />
                    </div>

                    {error && (
                        <div className="info-panel info-panel--danger" style={{ marginTop: 12 }}>
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </>
            )}

            {/* Step: Parsing */}
            {isParsing && (
                <div className="menu-upload-status">
                    {fileStatuses.length === 1 ? (
                        <div className="menu-upload-status-center">
                            <Loader2 size={28} className="menu-upload-spinner" />
                            <div className="menu-upload-status-title">Parsing {fileStatuses[0].name}…</div>
                            <div className="menu-upload-status-hint">
                                AI is extracting products. You can close this and keep working — we'll notify you when it's done.
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="menu-upload-status-title">Parsing {fileStatuses.length} files…</div>
                            <div className="menu-upload-status-hint" style={{ marginBottom: 16 }}>
                                You can close this and keep working — we'll notify you when it's done.
                            </div>
                            <div className="menu-upload-file-list">
                                {fileStatuses.map((fs, idx) => (
                                    <div key={idx} className={`menu-upload-file menu-upload-file--${fs.status}`}>
                                        {fs.status === 'pending' && <FileText size={14} />}
                                        {fs.status === 'parsing' && <Loader2 size={14} className="menu-upload-spinner" />}
                                        {fs.status === 'done' && <CheckCircle2 size={14} />}
                                        {fs.status === 'error' && <AlertCircle size={14} />}
                                        <span className="menu-upload-file-name">{fs.name}</span>
                                        {fs.status === 'done' && (
                                            <span className="menu-upload-file-meta">
                                                {fs.productCount} product{fs.productCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {fs.status === 'error' && (
                                            <span className="menu-upload-file-meta menu-upload-file-meta--error">failed</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Step: Saving */}
            {saving && (
                <div className="menu-upload-status menu-upload-status-center">
                    <Loader2 size={28} className="menu-upload-spinner" />
                    <div className="menu-upload-status-title">
                        Creating vendor and saving {selectedCount} products…
                    </div>
                </div>
            )}

            {/* Step: Review */}
            {isReview && !saving && (
                <>
                    {/* AI Notes summary */}
                    {notes && (
                        <div className="info-panel info-panel--warning" style={{ padding: 0 }}>
                            <button
                                onClick={() => setNotesExpanded(!notesExpanded)}
                                className="menu-upload-notes-toggle"
                            >
                                <AlertCircle size={13} />
                                <span>AI parsing notes</span>
                                <ChevronDown size={14} style={{ transform: notesExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease', marginLeft: 'auto' }} />
                            </button>
                            {notesExpanded && (
                                <div className="menu-upload-notes-body">{notes}</div>
                            )}
                        </div>
                    )}

                    {/* File breakdown for bulk uploads */}
                    {hasMultipleFiles && (
                        <div className="info-panel info-panel--success" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
                            {fileStatuses.filter(f => f.status === 'done').map((fs, idx) => (
                                <span key={idx}>
                                    {fs.name}: {fs.productCount}
                                    {fs.detectedVendor && <em style={{ color: '#959595' }}> → {fs.detectedVendor}</em>}
                                </span>
                            ))}
                            {fileStatuses.some(f => f.status === 'error') && (
                                <span style={{ color: 'var(--danger-color)' }}>
                                    {fileStatuses.filter(f => f.status === 'error').length} file(s) failed
                                </span>
                            )}
                        </div>
                    )}

                    <div className="menu-upload-review-header">
                        <span className="menu-upload-review-count">
                            {products.length} products across {vendorGroupKeys.length} vendor{vendorGroupKeys.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {error && (
                        <div className="info-panel info-panel--danger">
                            <AlertCircle size={13} /> {error}
                        </div>
                    )}

                    {/* One section per vendor group */}
                    {vendorGroupKeys.map(groupKey => {
                        const groupProducts = vendorGroups[groupKey];
                        const groupSelectedCount = groupProducts.filter(p => p._selected).length;
                        return (
                            <div key={groupKey} style={{ marginTop: 16, border: '1px solid #E8E8E8', borderRadius: 8, padding: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <input
                                        className="field-input"
                                        defaultValue={groupKey}
                                        onBlur={e => renameVendorGroup(groupKey, e.target.value.trim())}
                                        placeholder="Vendor name"
                                        style={{ flex: 1, fontWeight: 600 }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#959595', whiteSpace: 'nowrap' }}>
                                        {groupSelectedCount}/{groupProducts.length} selected
                                    </span>
                                    <button
                                        onClick={() => toggleAllInGroup(groupKey)}
                                        className="menu-upload-toggle-all"
                                    >
                                        {groupProducts.every(p => p._selected) ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                                <div className="menu-upload-table-wrap">
                                    <table className="menu-upload-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: 30 }}></th>
                                                <th>Product</th>
                                                <th>Category</th>
                                                <th style={{ textAlign: 'right' }}>Unit $</th>
                                                <th style={{ textAlign: 'right' }}>Case $</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groupProducts.map(p => {
                                                const idx = products.indexOf(p);
                                                return (
                                                    <tr
                                                        key={idx}
                                                        onClick={() => toggleProduct(idx)}
                                                        className={p._selected ? '' : 'menu-upload-row--deselected'}
                                                    >
                                                        <td style={{ textAlign: 'center' }}>
                                                            {p._selected
                                                                ? <Check size={14} className="text-primary" />
                                                                : <X size={14} className="text-muted" />}
                                                        </td>
                                                        <td>
                                                            <div className="menu-upload-product-name">{p.name}</div>
                                                            {(p.brand || p.unitSize || p.sku) && (
                                                                <div className="menu-upload-product-meta">
                                                                    {[p.brand, p.unitSize, p.sku].filter(Boolean).join(' · ')}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="text-muted">{p.category || '—'}</td>
                                                        <td style={{ textAlign: 'right' }}>{fmt(p.unitPrice)}</td>
                                                        <td style={{ textAlign: 'right' }}>{fmt(p.casePrice)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}
        </Modal>
    );
};

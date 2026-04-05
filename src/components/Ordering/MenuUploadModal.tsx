import { useState, useRef, useCallback } from 'react';
import { Upload, Check, X, Loader2, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiService } from '../../services/apiService';
import { Modal } from '../ui';

interface Props {
    onClose: () => void;
    onSaved: () => void;
}

interface ParsedProduct {
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
}

interface FileStatus {
    name: string;
    status: 'pending' | 'parsing' | 'done' | 'error';
    productCount?: number;
    error?: string;
}

type Step = 'upload' | 'parsing' | 'review' | 'saving';

export const MenuUploadModal: React.FC<Props> = ({ onClose, onSaved }) => {
    const [step, setStep] = useState<Step>('upload');
    const [vendorName, setVendorName] = useState('');
    const [fileName, setFileName] = useState('');
    const [error, setError] = useState('');
    const [notes, setNotes] = useState('');
    const [products, setProducts] = useState<ParsedProduct[]>([]);
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const parseOneFile = async (file: File): Promise<{ products: any[]; vendorName?: string; notes?: string }> => {
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
    };

    const processFiles = useCallback(async (files: File[]) => {
        setError('');
        setNotes('');
        setStep('parsing');

        const statuses: FileStatus[] = files.map(f => ({ name: f.name, status: 'pending' as const }));
        setFileStatuses(statuses);
        setFileName(files.length === 1 ? files[0].name : `${files.length} files`);

        const allProducts: ParsedProduct[] = [];
        const allNotes: string[] = [];
        let detectedVendor = '';

        for (let i = 0; i < files.length; i++) {
            setFileStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'parsing' } : s));

            try {
                const result = await parseOneFile(files[i]);

                if (result.vendorName && !detectedVendor) {
                    detectedVendor = result.vendorName;
                }

                if (result.notes) {
                    allNotes.push(files.length > 1 ? `**${files[i].name}:** ${result.notes}` : result.notes);
                }

                const fileProducts = (result.products || []).map((p: any) => ({
                    ...p,
                    _selected: true,
                    _sourceFile: files[i].name,
                }));
                allProducts.push(...fileProducts);

                setFileStatuses(prev => prev.map((s, idx) =>
                    idx === i ? { ...s, status: 'done', productCount: fileProducts.length } : s
                ));
            } catch (err: any) {
                setFileStatuses(prev => prev.map((s, idx) =>
                    idx === i ? { ...s, status: 'error', error: err.message } : s
                ));
            }
        }

        if (!allProducts.length) {
            setError('No products found across any uploaded files.');
            setStep('upload');
            return;
        }

        if (detectedVendor) setVendorName(detectedVendor);
        if (allNotes.length) setNotes(allNotes.join('\n\n'));
        setProducts(allProducts);
        setStep('review');
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) processFiles(files);
    }, [processFiles]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length) processFiles(files);
    };

    const toggleProduct = (idx: number) => {
        setProducts(prev => prev.map((p, i) => i === idx ? { ...p, _selected: !p._selected } : p));
    };

    const toggleAll = () => {
        const allSelected = products.every(p => p._selected);
        setProducts(prev => prev.map(p => ({ ...p, _selected: !allSelected })));
    };

    const handleSave = async () => {
        const selected = products.filter(p => p._selected);
        if (!selected.length || !vendorName.trim()) return;

        setStep('saving');
        try {
            await apiService.bulkSaveVendorProducts({
                vendorName: vendorName.trim(),
                fileName: fileName,
                products: selected.map(({ _selected, _sourceFile, ...p }) => p),
            });
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Failed to save products');
            setStep('review');
        }
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
                step === 'review' ? (
                    <>
                        <button className="btn-cancel" onClick={() => { setStep('upload'); setProducts([]); setNotes(''); setFileStatuses([]); }}>Back</button>
                        <button className="btn-primary" disabled={selectedCount === 0 || !vendorName.trim()} onClick={handleSave}>
                            Save {selectedCount} Product{selectedCount !== 1 ? 's' : ''}
                        </button>
                    </>
                ) : step === 'upload' ? (
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                ) : undefined
            }
        >
            {/* Step: Upload */}
            {step === 'upload' && (
                <>
                    <div
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                        style={{
                            border: `2px dashed ${dragging ? '#3BB570' : '#E8E8E8'}`,
                            borderRadius: 12,
                            padding: '40px 20px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: dragging ? '#F0FDF4' : '#FAFAFA',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        <Upload size={32} color={dragging ? '#3BB570' : '#959595'} style={{ margin: '0 auto 12px' }} />
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1A1A1A' }}>
                            Drop vendor menus here or click to browse
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#959595', marginTop: 6 }}>
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
                        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', borderRadius: 8, color: '#DF5B59', fontSize: '0.8125rem' }}>
                            {error}
                        </div>
                    )}
                </>
            )}

            {/* Step: Parsing */}
            {step === 'parsing' && (
                <div style={{ padding: '32px 20px' }}>
                    {fileStatuses.length === 1 ? (
                        <div style={{ textAlign: 'center' }}>
                            <Loader2 size={32} color="#3BB570" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1A1A1A' }}>
                                Parsing {fileStatuses[0].name}...
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#959595', marginTop: 6 }}>
                                AI is extracting products and identifying the vendor. This may take 10-30 seconds.
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1A1A1A', marginBottom: 16 }}>
                                Parsing {fileStatuses.length} files...
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {fileStatuses.map((fs, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 12px',
                                            background: '#FAFAFA',
                                            borderRadius: 8,
                                            fontSize: '0.8125rem',
                                        }}
                                    >
                                        {fs.status === 'pending' && <FileText size={14} color="#959595" />}
                                        {fs.status === 'parsing' && <Loader2 size={14} color="#3BB570" style={{ animation: 'spin 1s linear infinite' }} />}
                                        {fs.status === 'done' && <CheckCircle2 size={14} color="#3BB570" />}
                                        {fs.status === 'error' && <AlertCircle size={14} color="#DF5B59" />}
                                        <span style={{ flex: 1, color: fs.status === 'error' ? '#DF5B59' : '#1A1A1A' }}>
                                            {fs.name}
                                        </span>
                                        {fs.status === 'done' && (
                                            <span style={{ color: '#959595', fontSize: '0.75rem' }}>
                                                {fs.productCount} product{fs.productCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {fs.status === 'error' && (
                                            <span style={{ color: '#DF5B59', fontSize: '0.75rem' }}>failed</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Step: Saving */}
            {step === 'saving' && (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <Loader2 size={32} color="#3BB570" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1A1A1A' }}>
                        Creating vendor and saving {selectedCount} products...
                    </div>
                </div>
            )}

            {/* Step: Review */}
            {step === 'review' && (
                <>
                    {/* Editable vendor name */}
                    <div className="field" style={{ marginBottom: 16 }}>
                        <label className="field-label">Vendor Name</label>
                        <input
                            className="field-input"
                            value={vendorName}
                            onChange={e => setVendorName(e.target.value)}
                            placeholder="Enter vendor name..."
                            style={{ fontWeight: 500 }}
                        />
                        <div style={{ fontSize: '0.6875rem', color: '#959595', marginTop: 4 }}>
                            {vendorName ? 'Detected from file — edit if needed' : 'Could not detect vendor name — please enter it'}
                        </div>
                    </div>

                    {/* AI Notes summary */}
                    {notes && (
                        <div style={{
                            marginBottom: 16,
                            padding: '10px 14px',
                            background: '#FFFBEB',
                            border: '1px solid #F5D98B',
                            borderRadius: 8,
                            fontSize: '0.8125rem',
                            color: '#78600F',
                            lineHeight: 1.5,
                        }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                                <div style={{ whiteSpace: 'pre-wrap' }}>{notes}</div>
                            </div>
                        </div>
                    )}

                    {/* File breakdown for bulk uploads */}
                    {hasMultipleFiles && (
                        <div style={{
                            marginBottom: 12,
                            padding: '8px 12px',
                            background: '#F0FDF4',
                            border: '1px solid #BBF0D0',
                            borderRadius: 8,
                            fontSize: '0.75rem',
                            color: '#1A6B3C',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px 12px',
                        }}>
                            {fileStatuses.filter(f => f.status === 'done').map((fs, idx) => (
                                <span key={idx}>{fs.name}: {fs.productCount}</span>
                            ))}
                            {fileStatuses.some(f => f.status === 'error') && (
                                <span style={{ color: '#DF5B59' }}>
                                    {fileStatuses.filter(f => f.status === 'error').length} file(s) failed
                                </span>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            {products.length} products found
                        </span>
                        <button
                            onClick={toggleAll}
                            style={{ fontSize: '0.75rem', color: '#3BB570', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            {products.every(p => p._selected) ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', borderRadius: 8, color: '#DF5B59', fontSize: '0.8125rem' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ maxHeight: '50vh', overflowY: 'auto', border: '1px solid #E8E8E8', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ background: '#FAFAFA', position: 'sticky', top: 0 }}>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', width: 30 }}></th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Product</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Category</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unit $</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Case $</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((p, idx) => (
                                    <tr
                                        key={idx}
                                        onClick={() => toggleProduct(idx)}
                                        style={{
                                            cursor: 'pointer',
                                            borderTop: '1px solid #F1F1F1',
                                            opacity: p._selected ? 1 : 0.45,
                                            background: p._selected ? '#fff' : '#FAFAFA',
                                        }}
                                    >
                                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                            {p._selected
                                                ? <Check size={14} color="#3BB570" />
                                                : <X size={14} color="#959595" />}
                                        </td>
                                        <td style={{ padding: '6px 10px' }}>
                                            <div style={{ fontWeight: 500 }}>{p.name}</div>
                                            {(p.brand || p.unitSize || p.sku) && (
                                                <div style={{ fontSize: '0.6875rem', color: '#959595' }}>
                                                    {[p.brand, p.unitSize, p.sku].filter(Boolean).join(' · ')}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '6px 10px', color: '#959595' }}>
                                            {p.category || '--'}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(p.unitPrice)}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(p.casePrice)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </Modal>
    );
};

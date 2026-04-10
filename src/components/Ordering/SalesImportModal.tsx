import { useState, useMemo } from 'react';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Store } from '../../types/definitions';
import { apiService, type SalesImportRow } from '../../services/apiService';
import { Modal } from '../ui/Modal';

interface Props {
    stores: Store[];
    onClose: () => void;
    onImported: () => void;
}

type Mapping = {
    sku: string;
    name: string;
    date: string;
    units: string;
    revenue: string;
    onHand: string;
};

const EMPTY_MAPPING: Mapping = { sku: '', name: '', date: '', units: '', revenue: '', onHand: '' };

// Auto-detect column names — case insensitive substring match
function autoDetect(headers: string[]): Mapping {
    const find = (...needles: string[]): string => {
        for (const h of headers) {
            const lower = h.toLowerCase();
            if (needles.some(n => lower.includes(n))) return h;
        }
        return '';
    };
    return {
        sku: find('sku', 'product id', 'item id', 'upc'),
        name: find('product name', 'item name', 'product', 'item'),
        date: find('date', 'sold on', 'transaction'),
        units: find('units sold', 'quantity', 'qty', 'units'),
        revenue: find('revenue', 'sales', 'total', 'amount'),
        onHand: find('on hand', 'on-hand', 'inventory', 'stock'),
    };
}

// Parse CSV line respecting quoted fields
function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (c === ',' && !inQ) {
            out.push(cur); cur = '';
        } else {
            cur += c;
        }
    }
    out.push(cur);
    return out.map(s => s.trim());
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(parseCsvLine);
    return { headers, rows };
}

// Normalize a date string to YYYY-MM-DD
function normalizeDate(s: string): string | null {
    if (!s) return null;
    const t = s.trim();
    // ISO already
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    // MM/DD/YYYY or M/D/YY
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
        const [, mo, d] = m;
        let y = m[3];
        if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const parsed = new Date(t);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
}

export const SalesImportModal: React.FC<Props> = ({ stores, onClose, onImported }) => {
    const [storeId, setStoreId] = useState<string>(stores[0]?.id || '');
    const [fileName, setFileName] = useState<string>('');
    const [headers, setHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ rows: number; inv: number; min: string | null; max: string | null } | null>(null);

    const activeStores = useMemo(() => stores.filter(s => s.isActive), [stores]);

    const handleFile = async (file: File) => {
        setError(null);
        setSuccess(null);
        setFileName(file.name);
        const text = await file.text();
        const { headers: h, rows } = parseCsv(text);
        if (h.length === 0) {
            setError('CSV appears to be empty');
            return;
        }
        setHeaders(h);
        setRawRows(rows);
        setMapping(autoDetect(h));
    };

    // Build normalized rows preview based on current mapping
    const normalizedRows = useMemo<SalesImportRow[]>(() => {
        if (!mapping.sku || !mapping.date || !mapping.units) return [];
        const idx = (col: string) => headers.indexOf(col);
        const skuI = idx(mapping.sku);
        const nameI = idx(mapping.name);
        const dateI = idx(mapping.date);
        const unitsI = idx(mapping.units);
        const revI = idx(mapping.revenue);
        const ohI = idx(mapping.onHand);
        const out: SalesImportRow[] = [];
        for (const r of rawRows) {
            const sku = r[skuI];
            const date = normalizeDate(r[dateI] || '');
            const units = Number(r[unitsI]);
            if (!sku || !date || isNaN(units)) continue;
            const row: SalesImportRow = { productSku: sku, saleDate: date, unitsSold: units };
            if (nameI >= 0) row.productName = r[nameI];
            if (revI >= 0) {
                const v = Number(String(r[revI]).replace(/[$,]/g, ''));
                if (!isNaN(v)) row.revenue = v;
            }
            if (ohI >= 0) {
                const v = Number(r[ohI]);
                if (!isNaN(v)) row.onHand = v;
            }
            out.push(row);
        }
        return out;
    }, [rawRows, headers, mapping]);

    const canImport = storeId && normalizedRows.length > 0 && !importing;

    const handleImport = async () => {
        if (!canImport) return;
        setImporting(true);
        setError(null);
        try {
            const result = await apiService.importSalesCsv({
                storeId,
                fileName,
                rows: normalizedRows,
            });
            setSuccess({
                rows: result.rowsImported,
                inv: result.inventoryUpdated,
                min: result.dateMin,
                max: result.dateMax,
            });
            onImported();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
    const labelStyle: React.CSSProperties = { fontSize: '0.6875rem', color: '#959595', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' };

    return (
        <Modal
            title="Import Sales Data"
            size="lg"
            onClose={onClose}
            footer={
                <>
                    <button className="btn-cancel" onClick={onClose}>Close</button>
                    <button className="btn-primary" onClick={handleImport} disabled={!canImport}>
                        {importing ? 'Importing...' : `Import ${normalizedRows.length} rows`}
                    </button>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Store picker */}
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Store</label>
                        <select className="field-input" value={storeId} onChange={e => setStoreId(e.target.value)}>
                            <option value="">Select store...</option>
                            {activeStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    {/* File upload */}
                    <div style={fieldStyle}>
                        <label style={labelStyle}>CSV File</label>
                        <label style={{
                            border: '1.5px dashed #E8E8E8', borderRadius: 8, padding: 16, textAlign: 'center',
                            cursor: 'pointer', background: '#FAFAFA', fontSize: '0.8125rem', color: '#666',
                        }}>
                            <Upload size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            {fileName || 'Click to choose a CSV file'}
                            <input type="file" accept=".csv,text/csv" hidden onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                            }} />
                        </label>
                    </div>

                    {/* Column mapping */}
                    {headers.length > 0 && (
                        <div>
                            <div style={{ ...labelStyle, marginBottom: 8 }}>Column Mapping</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                {([
                                    ['sku', 'SKU / Product ID *'],
                                    ['date', 'Sale Date *'],
                                    ['units', 'Units Sold *'],
                                    ['name', 'Product Name'],
                                    ['revenue', 'Revenue'],
                                    ['onHand', 'On Hand'],
                                ] as const).map(([key, label]) => (
                                    <div key={key} style={fieldStyle}>
                                        <label style={{ fontSize: '0.75rem', color: '#666' }}>{label}</label>
                                        <select
                                            className="field-input"
                                            value={mapping[key]}
                                            onChange={e => setMapping(m => ({ ...m, [key]: e.target.value }))}
                                        >
                                            <option value="">— none —</option>
                                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#666' }}>
                                {normalizedRows.length} of {rawRows.length} rows ready to import
                                {normalizedRows.length < rawRows.length && (
                                    <span style={{ color: '#DC8B47', marginLeft: 6 }}>
                                        ({rawRows.length - normalizedRows.length} skipped — missing required fields)
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div style={{ display: 'flex', gap: 8, color: '#C84545', fontSize: '0.8125rem', alignItems: 'center' }}>
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                    {success && (
                        <div style={{ display: 'flex', gap: 8, color: '#3BB570', fontSize: '0.8125rem', alignItems: 'center' }}>
                            <CheckCircle2 size={14} />
                            Imported {success.rows} sales rows
                            {success.min && success.max && ` (${success.min} → ${success.max})`}
                            {success.inv > 0 && `, updated ${success.inv} inventory snapshots`}
                        </div>
                    )}
            </div>
        </Modal>
    );
};

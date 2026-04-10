import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Sparkles, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { VendorProduct, Vendor } from '../../types/definitions';
import { apiService, type UnmatchedSku } from '../../services/apiService';
import { Modal } from '../ui/Modal';

interface Props {
    products: VendorProduct[];
    vendors: Vendor[];
    onClose: () => void;
    onSaved: () => void;
}

type Decision = {
    sku: string;
    vendorProductId: string | null; // null = rejected / no match
    confidence: number;
    reasoning: string;
    decided: boolean; // user has explicitly accepted/rejected/picked
};

const HIGH_CONFIDENCE = 0.85;

export const SkuMatcherModal: React.FC<Props> = ({ products, vendors, onClose, onSaved }) => {
    const [unmatched, setUnmatched] = useState<UnmatchedSku[]>([]);
    const [loading, setLoading] = useState(true);
    const [matching, setMatching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [decisions, setDecisions] = useState<Record<string, Decision>>({});
    const [error, setError] = useState<string | null>(null);

    const productById = useMemo(() => {
        const m = new Map<string, VendorProduct>();
        for (const p of products) m.set(p.id, p);
        return m;
    }, [products]);

    const vendorById = useMemo(() => {
        const m = new Map<string, Vendor>();
        for (const v of vendors) m.set(v.id, v);
        return m;
    }, [vendors]);

    const loadUnmatched = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await apiService.getUnmatchedSkus(200);
            setUnmatched(result.unmatched);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load unmatched SKUs');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadUnmatched(); }, [loadUnmatched]);

    const runAiMatching = async () => {
        if (unmatched.length === 0) return;
        setMatching(true);
        setError(null);
        try {
            const result = await apiService.matchProductsAi({
                unmatched: unmatched.map(u => ({
                    sku: u.sku,
                    productName: u.productName || undefined,
                    units60d: u.units60d,
                })),
            });
            const next: Record<string, Decision> = {};
            for (const m of result.matches) {
                next[m.sku] = {
                    sku: m.sku,
                    vendorProductId: m.vendorProductId,
                    confidence: m.confidence,
                    reasoning: m.reasoning,
                    decided: false,
                };
            }
            setDecisions(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'AI matching failed');
        } finally {
            setMatching(false);
        }
    };

    const acceptAllHighConfidence = () => {
        const next = { ...decisions };
        for (const sku of Object.keys(next)) {
            const d = next[sku];
            if (d.vendorProductId && d.confidence >= HIGH_CONFIDENCE) {
                next[sku] = { ...d, decided: true };
            }
        }
        setDecisions(next);
    };

    const setMatch = (sku: string, vendorProductId: string | null) => {
        setDecisions(prev => ({
            ...prev,
            [sku]: {
                sku,
                vendorProductId,
                confidence: prev[sku]?.confidence ?? 1,
                reasoning: prev[sku]?.reasoning || (vendorProductId ? 'Manually selected' : 'Manually rejected'),
                decided: true,
            },
        }));
    };

    const acceptedAliases = useMemo(() => {
        return Object.values(decisions).filter(d => d.decided && d.vendorProductId);
    }, [decisions]);

    const handleSave = async () => {
        if (acceptedAliases.length === 0) return;
        setSaving(true);
        setError(null);
        try {
            await apiService.saveProductAliases(
                acceptedAliases.map(d => ({
                    sku: d.sku,
                    vendorProductId: d.vendorProductId!,
                    source: 'ai',
                    confidence: d.confidence,
                }))
            );
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const confidenceColor = (c: number): string => {
        if (c >= 0.85) return '#3BB570';
        if (c >= 0.6) return '#DC8B47';
        return '#C84545';
    };

    const cellStyle: React.CSSProperties = { padding: '8px 10px', fontSize: '0.8125rem', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle' };

    const aiResultCount = Object.keys(decisions).length;

    return (
        <Modal
            title={
                <span>
                    Match POS SKUs to Vendor Products
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#959595', fontWeight: 400 }}>
                        {unmatched.length} unmatched · {acceptedAliases.length} ready to save
                    </span>
                </span>
            }
            contentClassName="sku-matcher-modal"
            onClose={onClose}
            footer={
                <>
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                    <button className="btn-primary" onClick={handleSave} disabled={saving || acceptedAliases.length === 0}>
                        {saving ? 'Saving...' : `Save ${acceptedAliases.length} matches`}
                    </button>
                </>
            }
        >
            <div style={{ padding: '0 0 12px', borderBottom: '1px solid #F0F0F0', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        className="btn-primary"
                        onClick={runAiMatching}
                        disabled={matching || unmatched.length === 0}
                    >
                        {matching ? <Loader2 size={14} style={{ marginRight: 4, animation: 'spin 1s linear infinite' }} />
                                  : <Sparkles size={14} style={{ marginRight: 4 }} />}
                        {matching ? 'Matching...' : 'Run AI Matching'}
                    </button>
                    {aiResultCount > 0 && (
                        <button className="btn-cancel" onClick={acceptAllHighConfidence}>
                            <Check size={14} style={{ marginRight: 4 }} />
                            Accept All ≥ 85% Confident
                        </button>
                    )}
                    {error && (
                        <span style={{ color: '#C84545', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertCircle size={14} /> {error}
                        </span>
                    )}
                </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#959595' }}>Loading unmatched SKUs...</div>
                    ) : unmatched.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#959595' }}>
                            All POS SKUs are matched. Import sales data to find new ones.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#FAFAFA', borderBottom: '2px solid #E8E8E8' }}>
                                    <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>POS SKU / Product</th>
                                    <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'right', width: 80 }}>60d Units</th>
                                    <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left', width: 360 }}>Match to Vendor Product</th>
                                    <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'center', width: 90 }}>Confidence</th>
                                    <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'center', width: 110 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unmatched.map(u => {
                                    const decision = decisions[u.sku];
                                    const matched = decision?.vendorProductId ? productById.get(decision.vendorProductId) : null;
                                    const isAccepted = decision?.decided && !!decision.vendorProductId;
                                    const isRejected = decision?.decided && !decision.vendorProductId;
                                    return (
                                        <tr key={u.sku} style={{
                                            background: isAccepted ? '#F0FDF4' : isRejected ? '#FAFAFA' : '#fff',
                                            opacity: isRejected ? 0.5 : 1,
                                        }}>
                                            <td style={cellStyle}>
                                                <div style={{ fontWeight: 500 }}>{u.productName || <span style={{ color: '#959595' }}>(no name)</span>}</div>
                                                <div style={{ fontSize: '0.6875rem', color: '#959595', fontFamily: 'monospace' }}>{u.sku}</div>
                                            </td>
                                            <td style={{ ...cellStyle, textAlign: 'right' }}>{u.units60d}</td>
                                            <td style={cellStyle}>
                                                <select
                                                    className="field-input"
                                                    value={decision?.vendorProductId || ''}
                                                    onChange={e => setMatch(u.sku, e.target.value || null)}
                                                    style={{ width: '100%', fontSize: '0.75rem' }}
                                                >
                                                    <option value="">— no match —</option>
                                                    {products.map(p => {
                                                        const v = vendorById.get(p.vendorId);
                                                        return (
                                                            <option key={p.id} value={p.id}>
                                                                {v ? `[${v.name}] ` : ''}{p.brand ? `${p.brand} · ` : ''}{p.name}
                                                                {p.unitSize ? ` (${p.unitSize})` : ''}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                                {decision?.reasoning && (
                                                    <div style={{ fontSize: '0.6875rem', color: '#959595', marginTop: 2 }}>
                                                        {decision.reasoning}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ ...cellStyle, textAlign: 'center' }}>
                                                {decision && matched && (
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: confidenceColor(decision.confidence),
                                                    }}>
                                                        {Math.round(decision.confidence * 100)}%
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ ...cellStyle, textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => setMatch(u.sku, decision?.vendorProductId || null)}
                                                        disabled={!decision?.vendorProductId || isAccepted}
                                                        title="Accept"
                                                        style={{ color: isAccepted ? '#3BB570' : '#959595' }}
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => setMatch(u.sku, null)}
                                                        title="Reject"
                                                        style={{ color: isRejected ? '#C84545' : '#959595' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
            </div>
        </Modal>
    );
};

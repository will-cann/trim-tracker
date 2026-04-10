import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Send, Save, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Vendor, VendorProduct, Store, PurchaseOrder, PurchaseOrderLine } from '../../types/definitions';
import { apiService, type OrderSuggestion } from '../../services/apiService';
import { CenteredSpinner } from '../Spinner';

interface Props {
    vendorId: string | null;
    orderId: string | null;
    vendors: Vendor[];
    stores: Store[];
    onClose: () => void;
}

export const OrderBuilder: React.FC<Props> = ({ vendorId: initVendorId, orderId, vendors, stores, onClose }) => {
    const [selectedVendorId, setSelectedVendorId] = useState(initVendorId || '');
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [order, setOrder] = useState<PurchaseOrder | null>(null);
    const [matrix, setMatrix] = useState<Record<string, number>>({});
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [suggestions, setSuggestions] = useState<Record<string, OrderSuggestion>>({});
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    const cellKey = (productId: string, storeId: string) => `${productId}::${storeId}`;

    const loadSuggestions = useCallback(async (vid: string) => {
        if (!vid) return;
        setLoadingSuggestions(true);
        try {
            const result = await apiService.getOrderSuggestions(vid);
            const idx: Record<string, OrderSuggestion> = {};
            for (const s of result.suggestions) {
                idx[`${s.vendorProductId}::${s.storeId}`] = s;
            }
            setSuggestions(idx);
        } catch (e) {
            console.error('Failed to load suggestions', e);
            setSuggestions({});
        } finally {
            setLoadingSuggestions(false);
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);

        if (orderId) {
            const detail = await apiService.getOrderDetail(orderId);
            setOrder(detail);
            setSelectedVendorId(detail.vendorId);
            setNotes(detail.notes || '');

            // Populate matrix from existing lines
            const m: Record<string, number> = {};
            for (const line of (detail.lines || []) as PurchaseOrderLine[]) {
                m[cellKey(line.vendorProductId, line.storeId)] = line.finalQty;
            }
            setMatrix(m);

            const prods = await apiService.getVendorProducts(detail.vendorId);
            setProducts(prods.filter(p => p.isActive));
            loadSuggestions(detail.vendorId);
        } else if (initVendorId) {
            const prods = await apiService.getVendorProducts(initVendorId);
            setProducts(prods.filter(p => p.isActive));
            loadSuggestions(initVendorId);
        }

        setLoading(false);
    }, [orderId, initVendorId, loadSuggestions]);

    useEffect(() => { loadData(); }, [loadData]);

    // When vendor changes on new order, reload products + suggestions
    useEffect(() => {
        if (!orderId && selectedVendorId) {
            apiService.getVendorProducts(selectedVendorId).then(prods => {
                setProducts(prods.filter(p => p.isActive));
                setMatrix({});
            });
            loadSuggestions(selectedVendorId);
        }
    }, [selectedVendorId, orderId, loadSuggestions]);

    const activeStores = useMemo(() => stores.filter(s => s.isActive), [stores]);

    const setQty = (productId: string, storeId: string, qty: number) => {
        setMatrix(prev => ({ ...prev, [cellKey(productId, storeId)]: Math.max(0, qty) }));
    };

    const getQty = (productId: string, storeId: string) => matrix[cellKey(productId, storeId)] || 0;

    // Totals
    const productTotal = (productId: string) =>
        activeStores.reduce((sum, s) => sum + getQty(productId, s.id), 0);

    const storeTotal = (storeId: string) =>
        products.reduce((sum, p) => sum + getQty(p.id, storeId), 0);

    const grandTotal = products.reduce((sum, p) => sum + productTotal(p.id), 0);

    const storeCostTotal = (storeId: string) =>
        products.reduce((sum, p) => {
            const qty = getQty(p.id, storeId);
            return sum + qty * (p.unitPrice || 0);
        }, 0);

    const grandCostTotal = activeStores.reduce((sum, s) => sum + storeCostTotal(s.id), 0);

    const getSuggestion = (productId: string, storeId: string) => suggestions[`${productId}::${storeId}`];

    const applySuggestions = () => {
        const m: Record<string, number> = { ...matrix };
        let applied = 0;
        for (const p of products) {
            for (const s of activeStores) {
                const sug = getSuggestion(p.id, s.id);
                if (sug && sug.suggestedQty > 0) {
                    m[cellKey(p.id, s.id)] = sug.suggestedQty;
                    applied++;
                }
            }
        }
        setMatrix(m);
        return applied;
    };

    const totalSuggestedQty = useMemo(
        () => Object.values(suggestions).reduce((sum, s) => sum + s.suggestedQty, 0),
        [suggestions]
    );

    // Background color for status
    const statusBg = (status: OrderSuggestion['status'], hasQty: boolean) => {
        if (hasQty) return '#F0FDF4';
        switch (status) {
            case 'red': return '#FEF2F2';
            case 'yellow': return '#FFFBEB';
            case 'green': return '#F0FDF4';
            case 'gray': default: return '#fff';
        }
    };
    const statusBorder = (status: OrderSuggestion['status']) => {
        switch (status) {
            case 'red': return '#FCA5A5';
            case 'yellow': return '#FCD34D';
            case 'green': return '#86EFAC';
            case 'gray': default: return '#E8E8E8';
        }
    };

    const buildLines = (): Array<{ storeId: string; vendorProductId: string; finalQty: number; autoSuggestedQty?: number; unitPrice?: number }> => {
        const lines: Array<{ storeId: string; vendorProductId: string; finalQty: number; autoSuggestedQty?: number; unitPrice?: number }> = [];
        for (const p of products) {
            for (const s of activeStores) {
                const qty = getQty(p.id, s.id);
                if (qty > 0) {
                    const sug = getSuggestion(p.id, s.id);
                    lines.push({
                        storeId: s.id,
                        vendorProductId: p.id,
                        finalQty: qty,
                        autoSuggestedQty: sug?.suggestedQty,
                        unitPrice: p.unitPrice || undefined,
                    });
                }
            }
        }
        return lines;
    };

    const handleSave = async (status?: string) => {
        if (!selectedVendorId) return;
        setSaving(true);
        try {
            await apiService.saveOrder({
                orderId: order?.id,
                vendorId: selectedVendorId,
                status: status || order?.status || 'draft',
                notes: notes || undefined,
                lines: buildLines(),
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const vendor = vendors.find(v => v.id === selectedVendorId);

    if (loading) return <CenteredSpinner label="Loading order..." height="py-16" />;

    return (
        <div className="dashboard">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 'var(--space-md)' }}>
                <button className="icon-btn" onClick={onClose} title="Back">
                    <ArrowLeft size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1A1A1A', margin: 0 }}>
                        {order ? `Order #${order.id.slice(0, 8)}` : 'New Order'}
                    </h4>
                    {!orderId && (
                        <select
                            className="field-input"
                            style={{ marginTop: 4, maxWidth: 280 }}
                            value={selectedVendorId}
                            onChange={e => setSelectedVendorId(e.target.value)}
                        >
                            <option value="">Select vendor...</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                    )}
                    {vendor && orderId && (
                        <span style={{ fontSize: '0.8125rem', color: '#959595' }}>{vendor.name}</span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {totalSuggestedQty > 0 && (
                        <button
                            className="btn-cancel"
                            onClick={applySuggestions}
                            disabled={saving || loadingSuggestions}
                            title="Auto-fill quantities from sales velocity"
                        >
                            <Sparkles size={14} style={{ marginRight: 4 }} />
                            Apply Suggestions ({totalSuggestedQty})
                        </button>
                    )}
                    <button className="btn-cancel" onClick={() => handleSave()} disabled={saving}>
                        <Save size={14} style={{ marginRight: 4 }} /> {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button className="btn-primary" onClick={() => handleSave('submitted')} disabled={saving || grandTotal === 0}>
                        <Send size={14} style={{ marginRight: 4 }} /> Submit Order
                    </button>
                </div>
            </div>

            {/* Notes */}
            <div style={{ paddingBottom: 'var(--space-md)' }}>
                <input
                    className="field-input"
                    placeholder="Order notes..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    style={{ maxWidth: 500 }}
                />
            </div>

            {/* Matrix */}
            {products.length === 0 ? (
                <div className="data-table-empty">
                    {selectedVendorId
                        ? 'No active products for this vendor. Add products in the Products tab first.'
                        : 'Select a vendor to load their product catalog.'}
                </div>
            ) : activeStores.length === 0 ? (
                <div className="data-table-empty">
                    No stores configured. Add stores in the Stores tab first.
                </div>
            ) : (
                <div className="data-table-wrap" style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ minWidth: activeStores.length * 100 + 300 }}>
                        <thead>
                            <tr>
                                <th className="data-table-th" style={{ position: 'sticky', left: 0, background: '#FAFAFA', zIndex: 2, minWidth: 200 }}>
                                    Product
                                </th>
                                {activeStores.map(s => (
                                    <th key={s.id} className="data-table-th" style={{ textAlign: 'center', minWidth: 100 }}>
                                        {s.name}
                                    </th>
                                ))}
                                <th className="data-table-th" style={{ textAlign: 'center', minWidth: 70, fontWeight: 600 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(p => (
                                <tr key={p.id} className="data-table-row">
                                    <td className="data-table-td" style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                                        <div>
                                            <span style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{p.name}</span>
                                            {p.brand && <span style={{ color: '#959595', marginLeft: 6, fontSize: '0.6875rem' }}>{p.brand}</span>}
                                        </div>
                                        {p.unitPrice != null && (
                                            <span style={{ fontSize: '0.6875rem', color: '#959595' }}>${p.unitPrice.toFixed(2)}/ea</span>
                                        )}
                                    </td>
                                    {activeStores.map(s => {
                                        const qty = getQty(p.id, s.id);
                                        const sug = getSuggestion(p.id, s.id);
                                        const status = sug?.status || 'gray';
                                        const TrendIcon = sug?.trend === 'accelerating' ? TrendingUp
                                            : sug?.trend === 'declining' ? TrendingDown
                                            : sug?.trend === 'stable' ? Minus : null;
                                        return (
                                            <td key={s.id} className="data-table-td" style={{ textAlign: 'center', padding: '4px 6px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={qty || ''}
                                                        onChange={e => setQty(p.id, s.id, e.target.value ? +e.target.value : 0)}
                                                        placeholder={sug && sug.suggestedQty > 0 ? String(sug.suggestedQty) : '0'}
                                                        title={sug?.reasoning || undefined}
                                                        style={{
                                                            width: 60, textAlign: 'center', padding: '4px 6px',
                                                            border: `1.5px solid ${statusBorder(status)}`,
                                                            borderRadius: 6, fontSize: '0.8125rem',
                                                            background: statusBg(status, qty > 0),
                                                        }}
                                                    />
                                                    {sug && sug.suggestedQty > 0 && qty !== sug.suggestedQty && (
                                                        <span
                                                            title={sug.reasoning}
                                                            style={{ fontSize: '0.625rem', color: '#959595', display: 'flex', alignItems: 'center', gap: 2 }}
                                                        >
                                                            sug {sug.suggestedQty}
                                                            {TrendIcon && <TrendIcon size={9} />}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="data-table-td" style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.8125rem' }}>
                                        {productTotal(p.id) || <span style={{ color: '#ccc' }}>0</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #E8E8E8' }}>
                                <td className="data-table-td" style={{ position: 'sticky', left: 0, background: '#FAFAFA', fontWeight: 600, fontSize: '0.8125rem' }}>
                                    Store Total
                                </td>
                                {activeStores.map(s => (
                                    <td key={s.id} className="data-table-td" style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.8125rem', background: '#FAFAFA' }}>
                                        <div>{storeTotal(s.id)}</div>
                                        {storeCostTotal(s.id) > 0 && (
                                            <div style={{ fontSize: '0.6875rem', color: '#959595', fontWeight: 400 }}>
                                                ${storeCostTotal(s.id).toFixed(2)}
                                            </div>
                                        )}
                                    </td>
                                ))}
                                <td className="data-table-td" style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', background: '#FAFAFA' }}>
                                    <div>{grandTotal}</div>
                                    {grandCostTotal > 0 && (
                                        <div style={{ fontSize: '0.6875rem', color: '#3BB570', fontWeight: 600 }}>
                                            ${grandCostTotal.toFixed(2)}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
};

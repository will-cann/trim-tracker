import { useEffect } from 'react';
import { X, ArrowUpCircle, ArrowDownCircle, RefreshCw, Trash2 } from 'lucide-react';
import type { SupplyLedgerEntry, SupplyItem } from '../../types/definitions';

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowUpCircle }> = {
    receive: { label: 'Received', color: '#3BB570', icon: ArrowUpCircle },
    consume: { label: 'Used', color: '#DF5B59', icon: ArrowDownCircle },
    adjust: { label: 'Adjusted', color: '#1C9EFF', icon: RefreshCw },
    waste: { label: 'Waste', color: '#FA9E52', icon: Trash2 },
};

interface SupplyLedgerPanelProps {
    item: SupplyItem;
    entries: SupplyLedgerEntry[];
    loading: boolean;
    onClose: () => void;
}

export const SupplyLedgerPanel = ({ item, entries, loading, onClose }: SupplyLedgerPanelProps) => {
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h3>History: {item.name}</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#959595', marginBottom: '1rem' }}>
                    Current: <strong style={{ color: '#1A1A1A' }}>{item.quantityOnHand} {item.unit}</strong>
                    {item.parLevel != null && (
                        <span style={{ marginLeft: 12 }}>Par: {item.parLevel} {item.unit}</span>
                    )}
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#959595' }}>Loading...</div>
                ) : entries.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#959595' }}>No transactions recorded for this item yet</div>
                ) : (
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #E8E8E8' }}>
                                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#959595', fontWeight: 600 }}>Date</th>
                                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#959595', fontWeight: 600 }}>Type</th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#959595', fontWeight: 600 }}>Change</th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#959595', fontWeight: 600 }}>After</th>
                                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#959595', fontWeight: 600 }}>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(entry => {
                                    const cfg = TYPE_CONFIG[entry.changeType] || TYPE_CONFIG.adjust;
                                    const Icon = cfg.icon;
                                    const isPositive = entry.quantityDelta > 0;
                                    return (
                                        <tr key={entry.id} style={{ borderBottom: '1px solid #F1F1F1' }}>
                                            <td style={{ padding: '6px 8px', color: '#959595', whiteSpace: 'nowrap' }}>
                                                {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                <span style={{ marginLeft: 4, opacity: 0.6 }}>
                                                    {new Date(entry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                                </span>
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: cfg.color, fontWeight: 600 }}>
                                                    <Icon size={13} />
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td style={{
                                                padding: '6px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                                                color: isPositive ? '#3BB570' : '#DF5B59',
                                            }}>
                                                {isPositive ? '+' : ''}{entry.quantityDelta}
                                            </td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1A1A1A' }}>
                                                {entry.quantityAfter}
                                            </td>
                                            <td style={{ padding: '6px 8px', color: '#959595', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {entry.notes || '\u2014'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="modal-actions" style={{ marginTop: '1rem' }}>
                    <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

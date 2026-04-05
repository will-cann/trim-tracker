import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { SupplyItem, SupplyChangeType } from '../../types/definitions';

interface ReceiveModalProps {
    item: SupplyItem;
    mode?: SupplyChangeType;
    onSubmit: (itemId: string, quantity: number, notes?: string) => Promise<void>;
    onClose: () => void;
}

const MODE_CONFIG: Record<string, { title: string; label: string; btnLabel: string; btnClass: string }> = {
    receive: { title: 'Receive Stock', label: 'Quantity to add', btnLabel: 'Receive', btnClass: 'btn-primary' },
    consume: { title: 'Record Usage', label: 'Quantity used', btnLabel: 'Deduct', btnClass: 'btn-danger' },
    waste: { title: 'Record Waste', label: 'Quantity wasted', btnLabel: 'Record Waste', btnClass: 'btn-danger' },
    adjust: { title: 'Adjust Count', label: 'New quantity on hand', btnLabel: 'Adjust', btnClass: 'btn-primary' },
};

export const ReceiveModal = ({ item, mode = 'receive', onSubmit, onClose }: ReceiveModalProps) => {
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const config = MODE_CONFIG[mode] || MODE_CONFIG.receive;

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const qty = Number(quantity);
        if (!qty && mode !== 'adjust') return;
        if (mode === 'adjust' && quantity === '') return;
        setSaving(true);
        try {
            await onSubmit(item.id, qty, notes.trim() || undefined);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content creation-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                    <h3>{config.title}</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: 'var(--space-md)' }}>
                            <strong style={{ color: '#1A1A1A' }}>{item.name}</strong>
                            <span style={{ marginLeft: 8 }}>Current: {item.quantityOnHand} {item.unit}</span>
                        </div>
                        <div className="field">
                            <label className="field-label">{config.label}</label>
                            <input
                                className="field-input"
                                type="number"
                                min={mode === 'adjust' ? '0' : '0.01'}
                                step="any"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                autoFocus
                                placeholder={mode === 'adjust' ? String(item.quantityOnHand) : '0'}
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">Notes (optional)</label>
                            <input className="field-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. PO #1234, physical count" />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className={config.btnClass} disabled={saving || (!Number(quantity) && mode !== 'adjust')}>
                            {saving ? 'Saving...' : config.btnLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

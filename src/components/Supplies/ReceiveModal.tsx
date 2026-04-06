import { useState } from 'react';
import type { SupplyItem, SupplyChangeType } from '../../types/definitions';
import { Modal, Button } from '../ui';

interface ReceiveModalProps {
    item: SupplyItem;
    mode?: SupplyChangeType;
    onSubmit: (itemId: string, quantity: number, notes?: string) => Promise<void>;
    onClose: () => void;
}

type Variant = 'primary' | 'danger';

const MODE_CONFIG: Record<string, { title: string; label: string; btnLabel: string; variant: Variant }> = {
    receive: { title: 'Receive Stock', label: 'Quantity to add', btnLabel: 'Receive', variant: 'primary' },
    consume: { title: 'Record Usage', label: 'Quantity used', btnLabel: 'Deduct', variant: 'danger' },
    waste: { title: 'Record Waste', label: 'Quantity wasted', btnLabel: 'Record Waste', variant: 'danger' },
    adjust: { title: 'Adjust Count', label: 'New quantity on hand', btnLabel: 'Adjust', variant: 'primary' },
};

export const ReceiveModal = ({ item, mode = 'receive', onSubmit, onClose }: ReceiveModalProps) => {
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const config = MODE_CONFIG[mode] || MODE_CONFIG.receive;

    const canSubmit = mode === 'adjust' ? quantity !== '' : !!Number(quantity);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        try {
            await onSubmit(item.id, Number(quantity), notes.trim() || undefined);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title={config.title}
            size="sm"
            contentClassName="creation-modal"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button
                        variant={config.variant}
                        type="submit"
                        form="receive-form"
                        disabled={saving || !canSubmit}
                    >
                        {saving ? 'Saving…' : config.btnLabel}
                    </Button>
                </>
            }
        >
            <div className="modal-meta">
                <span><strong>{item.name}</strong></span>
                <span>Current: <strong>{item.quantityOnHand} {item.unit}</strong></span>
            </div>
            <form id="receive-form" onSubmit={handleSubmit}>
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
                    <label className="field-label">Notes <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                        className="field-input"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="e.g. PO #1234, physical count"
                    />
                </div>
            </form>
        </Modal>
    );
};

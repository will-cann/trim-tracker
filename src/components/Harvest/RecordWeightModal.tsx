import React, { useState } from 'react';
import { Modal, Button } from '../ui';

interface RecordWeightModalProps {
    onClose: () => void;
    onSubmit: (weight: number) => void;
    title?: string;
    currentWeight?: number;
}

export const RecordWeightModal: React.FC<RecordWeightModalProps> = ({
    onClose,
    onSubmit,
    title = 'Record Wet Weight',
    currentWeight,
}) => {
    const [weight, setWeight] = useState(currentWeight ? String(currentWeight) : '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const val = Number(weight);
        if (!val || val <= 0) return;
        onSubmit(val);
    };

    return (
        <Modal title={title} contentClassName="max-w-sm" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="record-weight-form">Save</Button>
            </>
        }>
            <form id="record-weight-form" onSubmit={handleSubmit}>
                <div className="field">
                    <label className="field-label">Weight (grams)</label>
                    <input
                        type="number"
                        className="field-input"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        placeholder="0"
                        min="1"
                        step="0.01"
                        required
                        autoFocus
                        style={{ fontSize: '1.25rem', padding: '0.75rem 0.75rem' }}
                    />
                </div>
            </form>
        </Modal>
    );
};

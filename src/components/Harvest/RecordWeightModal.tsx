import React, { useState } from 'react';
import { X } from 'lucide-react';

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
        <div className="modal-overlay">
            <div className="modal-content max-w-sm">
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="add-batch-form">
                    <div className="form-group">
                        <label>Weight (grams)</label>
                        <input
                            type="number"
                            value={weight}
                            onChange={e => setWeight(e.target.value)}
                            placeholder="0"
                            min="1"
                            step="0.01"
                            required
                            autoFocus
                            className="text-xl py-3"
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

import React, { useState, useEffect } from 'react';
import { X, Mic } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface AddTrimmerProfileModalProps {
    onClose: () => void;
    onSubmit: (name: string) => void;
}

export const AddTrimmerProfileModal: React.FC<AddTrimmerProfileModalProps> = ({ onClose, onSubmit }) => {
    const [name, setName] = useState('');
    const { isListening, finalTranscript, startListening, stopListening, hasSupport } = useSpeechRecognition();

    useEffect(() => {
        if (finalTranscript) {
            setName(finalTranscript);
        }
    }, [finalTranscript]);

    const handleMicClick = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit(name.trim());
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Add New Trimmer</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="add-batch-form">
                    <div className="form-group">
                        <label>Trimmer Name</label>
                        <div className="input-with-icon">
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. John Doe"
                                required
                                autoFocus
                            />
                            {hasSupport && (
                                <button
                                    type="button"
                                    className={`mic-btn ${isListening ? 'listening' : ''}`}
                                    onClick={handleMicClick}
                                    title="Dictate"
                                >
                                    <Mic size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Add to Roster</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

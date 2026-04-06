import React, { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { Modal, Button } from './ui';

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
        <Modal
            title="Add New Trimmer"
            size="sm"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" type="submit" form="add-trimmer-form" disabled={!name.trim()}>
                        Add to Roster
                    </Button>
                </>
            }
        >
            <form id="add-trimmer-form" onSubmit={handleSubmit}>
                <div className="field">
                    <label className="field-label">Trimmer Name</label>
                    <div className="field-input-wrap">
                        <input
                            type="text"
                            className="field-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. John Doe"
                            required
                            autoFocus
                        />
                        {hasSupport && (
                            <button
                                type="button"
                                className={`field-input-addon ${isListening ? 'active' : ''}`}
                                onClick={handleMicClick}
                                title="Dictate"
                            >
                                <Mic size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </form>
        </Modal>
    );
};

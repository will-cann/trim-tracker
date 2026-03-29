import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from './ui';

interface DeleteConfirmationModalProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
    title,
    message,
    onConfirm,
    onCancel
}) => {
    return (
        <Modal
            title={title}
            contentClassName="delete-modal"
            titleIcon={
                <div className="warning-icon-wrapper">
                    <AlertTriangle size={24} style={{ color: 'var(--danger-color)' }} />
                </div>
            }
            onClose={onCancel}
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button variant="danger" onClick={onConfirm}>Delete</Button>
                </>
            }
        >
            <p>{message}</p>
        </Modal>
    );
};

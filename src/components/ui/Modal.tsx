import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    title: React.ReactNode;
    /** Extra className on .modal-content (e.g. 'max-w-lg', 'delete-modal') */
    contentClassName?: string;
    /** Optional icon rendered before the title */
    titleIcon?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
    title,
    contentClassName = '',
    titleIcon,
    onClose,
    children,
    footer,
}) => {
    return (
        <div className="modal-overlay">
            <div className={`modal-content ${contentClassName}`.trim()}>
                <div className="modal-header">
                    {titleIcon ? (
                        <div className="modal-title-container">
                            {titleIcon}
                            <h3>{title}</h3>
                        </div>
                    ) : (
                        <h3>{title}</h3>
                    )}
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

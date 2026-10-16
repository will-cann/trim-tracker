import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
    title: React.ReactNode;
    /** Extra className on .modal-content (e.g. 'creation-modal', 'delete-modal') */
    contentClassName?: string;
    /** Optional icon rendered before the title */
    titleIcon?: React.ReactNode;
    /** Preset width; ignored if contentClassName sets its own max-width. */
    size?: ModalSize;
    /**
     * Disable backdrop click-to-close. Defaults to disabled for data-entry forms
     * (contentClassName 'creation-modal') so a stray click doesn't throw away
     * what was typed, enabled otherwise.
     */
    disableBackdropClose?: boolean;
    /** Disable Escape-to-close (default: enabled) */
    disableEscapeClose?: boolean;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

const SIZE_CLASS: Record<ModalSize, string> = {
    sm: 'modal-size-sm',
    md: '',
    lg: 'modal-size-lg',
};

export const Modal: React.FC<ModalProps> = ({
    title,
    contentClassName = '',
    titleIcon,
    size = 'md',
    disableBackdropClose,
    disableEscapeClose,
    onClose,
    children,
    footer,
}) => {
    // Escape key to close
    useEffect(() => {
        if (disableEscapeClose) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, disableEscapeClose]);

    const backdropCloses = !(disableBackdropClose ?? contentClassName.split(' ').includes('creation-modal'));
    // A drag that starts inside the dialog (e.g. selecting input text) and ends
    // on the backdrop fires a click on the backdrop; only a press that started
    // there counts.
    const pressedOnBackdrop = useRef(false);

    const handleBackdropClick = (e: React.MouseEvent) => {
        const started = pressedOnBackdrop.current;
        pressedOnBackdrop.current = false;
        if (!backdropCloses) return;
        if (started && e.target === e.currentTarget) onClose();
    };

    const classes = ['modal-content', SIZE_CLASS[size], contentClassName]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className="modal-overlay"
            onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
            onClick={handleBackdropClick}
        >
            <div className={classes}>
                <div className="modal-header">
                    {titleIcon ? (
                        <div className="modal-title-container">
                            {titleIcon}
                            <h3>{title}</h3>
                        </div>
                    ) : (
                        <h3>{title}</h3>
                    )}
                    <button className="close-btn" onClick={onClose} aria-label="Close">
                        <X size={18} />
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

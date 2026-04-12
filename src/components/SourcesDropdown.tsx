import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import type { License } from '../types/definitions';

interface SourcesDropdownProps {
    licenses: License[];
    activeLicenseId: string | null;
    onLicenseChange?: (id: string) => void;
}

export const SourcesDropdown: React.FC<SourcesDropdownProps> = ({
    licenses,
    activeLicenseId,
    onLicenseChange,
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const sourceCount = activeLicenseId ? 1 : 0;

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    if (licenses.length === 0) return null;

    return (
        <div className="ai-sources-wrap" ref={ref}>
            <button
                type="button"
                className={`ai-sources-btn${open ? ' open' : ''}`}
                onClick={() => setOpen(v => !v)}
            >
                <span className="ai-sources-label">Sources</span>
                {sourceCount > 0 && (
                    <span className="ai-sources-count">{sourceCount}</span>
                )}
                <ChevronDown size={11} />
            </button>
            {open && (
                <div className="ai-sources-menu">
                    <div className="ai-sources-group">
                        <span className="ai-sources-group-label">
                            <Building2 size={12} />
                            Facility
                        </span>
                        <div className="ai-sources-options">
                            {licenses.map(lic => (
                                <button
                                    key={lic.id}
                                    type="button"
                                    className={`ai-sources-option${lic.id === activeLicenseId ? ' active' : ''}`}
                                    onClick={() => onLicenseChange?.(lic.id)}
                                >
                                    <span className="ai-sources-option-radio">
                                        {lic.id === activeLicenseId && <span className="ai-sources-option-dot" />}
                                    </span>
                                    <span>{lic.label || lic.licenseNumber}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

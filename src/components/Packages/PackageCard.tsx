import React from 'react';
import type { Package } from '../../types/definitions';
import { TypeChip } from '../ui';
import { LAB_LABEL, LAB_CLASS, LAB_ICON } from './packageConstants';

interface PackageCardProps {
    pkg: Package;
    onClick: () => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({ pkg, onClick }) => {
    const statusBorderClass =
        pkg.status === 'on_hold' ? 'status-border-hold' :
        pkg.status === 'finished' ? 'status-border-finished' :
        '';

    return (
        <div
            className={`trim-card ${statusBorderClass}`}
            onClick={onClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="trim-card-header">
                <div className="trim-card-top">
                    <div className="trim-card-title">
                        <div className="title-with-badge">
                            <h3>{pkg.label}</h3>
                            <TypeChip palette="packageStatus" value={pkg.status} />
                        </div>
                        <div className="trim-card-subtitle">
                            <span className="strain-name">{pkg.strain}</span>
                            <span className="separator">&bull;</span>
                            <span>{pkg.quantity.toFixed(0)}g</span>
                            <span className="separator">&bull;</span>
                            <TypeChip palette="packageType" value={pkg.packageType} />
                            {pkg.licenseNumber && (
                                <>
                                    <span className="separator">&bull;</span>
                                    <span className="license-number">{pkg.licenseNumber}</span>
                                </>
                            )}
                            {pkg.location && (
                                <>
                                    <span className="separator">&bull;</span>
                                    <span>{pkg.location}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="trim-card-summary">
                    {pkg.wasteWeight > 0 && (
                        <div className="summary-item">
                            <span className="label">Waste</span>
                            <span className="value text-[var(--color-waste)]">{pkg.wasteWeight.toFixed(0)}g</span>
                        </div>
                    )}
                    <div className="summary-item">
                        <span className="label">Lab Testing</span>
                        <span
                            className={`value ${LAB_CLASS[pkg.labTestingState]}`}
                            style={{ display: 'inline-flex', alignItems: 'center' }}
                            title={LAB_LABEL[pkg.labTestingState]}
                        >
                            {React.createElement(LAB_ICON[pkg.labTestingState], { size: 18 })}
                        </span>
                    </div>
                    {pkg.tagNumber && (
                        <div className="summary-item">
                            <span className="label">Tag</span>
                            <span className="value">{pkg.tagNumber}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

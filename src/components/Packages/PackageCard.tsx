import React from 'react';
import { Cloud, Tag } from 'lucide-react';
import type { Package } from '../../types/definitions';
import { TypeChip } from '../ui';
import { LAB_LABEL, LAB_CLASS, LAB_ICON, formatPackageQuantity, packageTitle, itemDisplayName } from './packageConstants';

interface PackageCardProps {
    pkg: Package;
    onClick: () => void;
}

const shortDate = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const PackageCard: React.FC<PackageCardProps> = ({ pkg, onClick }) => {
    const statusClass =
        pkg.status === 'on_hold' ? 'pkg-card--hold' :
        pkg.status === 'finished' ? 'pkg-card--finished' :
        pkg.status === 'in_transit' ? 'pkg-card--transit' :
        '';
    const LabIcon = LAB_ICON[pkg.labTestingState];
    const packaged = shortDate(pkg.packagedDate);
    const net = pkg.wasteWeight > 0 ? pkg.quantity - pkg.wasteWeight : null;

    return (
        <button
            type="button"
            className={`pkg-card ${statusClass}`}
            onClick={onClick}
            title={`Open ${pkg.label}`}
        >
            {/* Label + status */}
            <div className="pkg-card-head">
                <h3 className="pkg-card-label" title={pkg.label}>{pkg.label}</h3>
                {pkg.status !== 'active' && <TypeChip palette="packageStatus" value={pkg.status} />}
            </div>

            {/* What and how much */}
            <div className="pkg-card-line">
                <span
                    className="pkg-card-strain"
                    title={pkg.strain && pkg.itemName ? `${pkg.strain} · ${itemDisplayName(pkg.itemName)}` : packageTitle(pkg)}
                >
                    {packageTitle(pkg)}
                </span>
                <span className="pkg-card-qty tabular-nums">{formatPackageQuantity(pkg.quantity, pkg.unit)}</span>
                <TypeChip palette="packageType" value={pkg.packageType} />
            </div>

            {/* Where and when */}
            <div className="pkg-card-meta">
                {pkg.location
                    ? <span className="pkg-card-meta-item" title={pkg.location}>{pkg.location}</span>
                    : <span className="pkg-card-meta-item pkg-card-muted">No location</span>}
                {pkg.licenseNumber && <span className="pkg-card-meta-item tabular-nums">{pkg.licenseNumber}</span>}
                {packaged && <span className="pkg-card-meta-item pkg-card-muted tabular-nums">{packaged}</span>}
            </div>

            {/* Lab, waste, tag */}
            <div className="pkg-card-foot">
                <span className={`pkg-card-lab ${LAB_CLASS[pkg.labTestingState]}`} title={`Lab testing: ${LAB_LABEL[pkg.labTestingState]}`}>
                    <LabIcon size={13} />
                    {LAB_LABEL[pkg.labTestingState]}
                </span>
                {net != null && (
                    <span className="pkg-card-foot-item" title={`${formatPackageQuantity(pkg.wasteWeight, pkg.unit)} waste recorded`}>
                        <span className="pkg-card-muted">Net </span>
                        <span className="tabular-nums">{formatPackageQuantity(net, pkg.unit)}</span>
                        <span className="pkg-card-waste tabular-nums"> −{formatPackageQuantity(pkg.wasteWeight, pkg.unit)}</span>
                    </span>
                )}
                {pkg.tagNumber && (
                    <span className="pkg-card-foot-item pkg-card-tag tabular-nums" title={`Tag ${pkg.tagNumber}`}>
                        <Tag size={11} />
                        {pkg.tagNumber}
                    </span>
                )}
                {pkg.metrcId != null && (
                    <span className="pkg-card-metrc" title="Mirrored from Metrc. Quantity, status, item, location and lab state come from Metrc.">
                        <Cloud size={11} /> Metrc
                    </span>
                )}
            </div>
        </button>
    );
};

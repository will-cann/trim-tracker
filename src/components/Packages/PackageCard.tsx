import React, { useState } from 'react';
import { ChevronDown, Trash2, Pause, Play, CheckCircle, MapPin, Tag, FlaskConical } from 'lucide-react';
import type { Package } from '../../types/definitions';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';

interface PackageCardProps {
    pkg: Package;
    onUpdate: (packageId: string, updates: Record<string, any>) => void;
    onDelete: (packageId: string) => void;
}

const STATUS_CLASS: Record<string, string> = {
    active: 'status-active',
    on_hold: 'status-upcoming',
    finished: 'status-complete',
    archived: 'status-complete',
};

const STATUS_LABEL: Record<string, string> = {
    active: 'Active',
    on_hold: 'On Hold',
    finished: 'Finished',
    archived: 'Archived',
};

const TYPE_CLASS: Record<string, string> = {
    flower: 'bg-amber-50 text-amber-700',
    trim: 'bg-emerald-50 text-emerald-700',
    shake: 'bg-blue-50 text-blue-700',
    fresh_frozen: 'bg-cyan-50 text-cyan-700',
};

const LAB_LABEL: Record<string, string> = {
    not_submitted: 'Not Submitted',
    submitted: 'Submitted',
    passed: 'Passed',
    failed: 'Failed',
};

const LAB_CLASS: Record<string, string> = {
    not_submitted: 'text-gray-400',
    submitted: 'text-amber-500',
    passed: 'text-emerald-500',
    failed: 'text-red-500',
};

export const PackageCard: React.FC<PackageCardProps> = ({ pkg, onUpdate, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    return (
        <>
            <div className={`trim-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="trim-card-header" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="trim-card-top">
                        <div className="trim-card-title">
                            <div className="title-with-badge">
                                <h3>{pkg.label}</h3>
                                <span className={`status-badge ${STATUS_CLASS[pkg.status] || ''}`}>
                                    {STATUS_LABEL[pkg.status] || pkg.status}
                                </span>
                                <span className={`status-badge ${TYPE_CLASS[pkg.packageType] || ''}`}>
                                    {pkg.packageType === 'fresh_frozen' ? 'Fresh Frozen' : pkg.packageType.charAt(0).toUpperCase() + pkg.packageType.slice(1)}
                                </span>
                            </div>
                            <div className="trim-card-subtitle">
                                <span className="strain-name">{pkg.strain}</span>
                                <span className="separator">&bull;</span>
                                <span>{pkg.quantity.toFixed(0)}g</span>
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
                        <div className="flex items-center gap-2">
                            <div className="expand-icon">
                                <ChevronDown size={24} />
                            </div>
                        </div>
                    </div>

                    {/* Collapsed summary */}
                    {!isExpanded && (
                        <div className="trim-card-summary">
                            <div className="summary-item">
                                <span className="label">Quantity</span>
                                <span className="value">{pkg.quantity.toFixed(0)}g</span>
                            </div>
                            {pkg.wasteWeight > 0 && (
                                <div className="summary-item">
                                    <span className="label">Waste</span>
                                    <span className="value text-red-500">{pkg.wasteWeight.toFixed(0)}g</span>
                                </div>
                            )}
                            <div className="summary-item">
                                <span className="label">Lab Testing</span>
                                <span className={`value ${LAB_CLASS[pkg.labTestingState]}`}>
                                    {LAB_LABEL[pkg.labTestingState]}
                                </span>
                            </div>
                            {pkg.tagNumber && (
                                <div className="summary-item">
                                    <span className="label">Tag</span>
                                    <span className="value">{pkg.tagNumber}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div className="trim-card-body" onClick={e => e.stopPropagation()}>
                        <div className="trim-card-summary border-b border-gray-200 pb-3 mb-3">
                            <div className="summary-item">
                                <span className="label">Quantity</span>
                                <span className="value text-lg">{pkg.quantity.toFixed(1)}g</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Waste</span>
                                <span className="value text-lg text-red-500">{pkg.wasteWeight.toFixed(1)}g</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Net</span>
                                <span className="value text-lg text-emerald-500">
                                    {(pkg.quantity - pkg.wasteWeight).toFixed(1)}g
                                </span>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 mb-4">
                            {pkg.tagNumber && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Tag size={14} className="text-gray-400" />
                                    <span className="font-medium">Tag:</span> {pkg.tagNumber}
                                </div>
                            )}
                            {pkg.location && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <MapPin size={14} className="text-gray-400" />
                                    <span className="font-medium">Location:</span> {pkg.location}
                                </div>
                            )}
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <FlaskConical size={14} className={LAB_CLASS[pkg.labTestingState]} />
                                <span className="font-medium">Lab Testing:</span>
                                <span className={LAB_CLASS[pkg.labTestingState]}>
                                    {LAB_LABEL[pkg.labTestingState]}
                                </span>
                            </div>
                            {pkg.itemName && (
                                <div className="text-sm text-gray-600">
                                    <span className="font-medium">Item:</span> {pkg.itemName}
                                </div>
                            )}
                            {pkg.notes && (
                                <div className="text-sm text-gray-500 mt-2 italic">
                                    {pkg.notes}
                                </div>
                            )}
                            <div className="text-xs text-gray-400 mt-2">
                                Packaged: {new Date(pkg.packagedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {pkg.finishedDate && (
                                    <> &bull; Finished: {new Date(pkg.finishedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        {pkg.status !== 'archived' && (
                            <div className="flex gap-2 flex-wrap pt-3 border-t border-gray-200">
                                {pkg.status === 'active' && (
                                    <>
                                        <button
                                            className="btn-start-batch"
                                            onClick={() => onUpdate(pkg.id, { status: 'on_hold' })}
                                        >
                                            <Pause size={12} className="mr-1" />
                                            Hold
                                        </button>
                                        <button
                                            className="btn-start-batch"
                                            onClick={() => onUpdate(pkg.id, { status: 'finished' })}
                                        >
                                            <CheckCircle size={12} className="mr-1" />
                                            Finish
                                        </button>
                                    </>
                                )}
                                {pkg.status === 'on_hold' && (
                                    <button
                                        className="btn-start-batch"
                                        onClick={() => onUpdate(pkg.id, { status: 'active' })}
                                    >
                                        <Play size={12} className="mr-1" />
                                        Release
                                    </button>
                                )}
                                {pkg.status === 'finished' && (
                                    <button
                                        className="btn-start-batch"
                                        onClick={() => onUpdate(pkg.id, { status: 'active' })}
                                    >
                                        <Play size={12} className="mr-1" />
                                        Reactivate
                                    </button>
                                )}
                                <button
                                    className="icon-btn delete-batch-btn"
                                    onClick={() => setShowDeleteModal(true)}
                                    title="Delete Package"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showDeleteModal && (
                <DeleteConfirmationModal
                    title="Delete Package"
                    message={`Are you sure you want to delete package "${pkg.label}"? This cannot be undone.`}
                    onConfirm={() => {
                        onDelete(pkg.id);
                        setShowDeleteModal(false);
                    }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
        </>
    );
};

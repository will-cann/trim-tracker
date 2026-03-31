import React, { useState } from 'react';
import type { TrimSession, CreateTrimSessionDTO, TrimmerProfile, CreatePackageDTO } from '../types/definitions';
import { Cannabis, Trash2, Scale, Plus, Package, Hourglass, Users } from 'lucide-react';

import { EntryList } from './EntryList';
import { AddBatchModal } from './AddBatchModal';
import { StatCard } from './ui';
import { StackedProgressBar, buildSegments } from './StackedProgressBar';

interface DashboardProps {
    session: TrimSession;
    onUpdateWeight: (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => void;
    onSubmit: (e?: React.MouseEvent) => void;
    onAddBatch: (data: CreateTrimSessionDTO) => void;
    onUpdateStrain: (entryId: string, strain: string) => void;
    onAddTrimmer: (entryId: string) => void;
    onUpdateTrimmer: (entryId: string, trimmerId: string, updates: Partial<Record<string, string | number>>) => void;
    onRemoveTrimmer: (entryId: string, trimmerId: string) => void;
    onDeleteBatch: (entryId: string) => void;
    onSubmitBatch?: (entryId: string) => void;
    onStartBatch?: (entryId: string) => void;
    onRevertBatch?: (entryId: string) => void;
    onCreatePackage?: (data: CreatePackageDTO) => Promise<void>;
    trimmerProfiles: TrimmerProfile[];
}

export const Dashboard: React.FC<DashboardProps> = ({
    session,
    onUpdateWeight,
    onSubmit,
    onAddBatch,
    onUpdateStrain,
    onAddTrimmer,
    onUpdateTrimmer,
    onRemoveTrimmer,
    onDeleteBatch,
    onSubmitBatch,
    onStartBatch,
    onRevertBatch,
    onCreatePackage,
    trimmerProfiles
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'upcoming'>('active');

    const handleAddSubmit = (data: CreateTrimSessionDTO) => {
        onAddBatch(data);
        setIsModalOpen(false);
    };

    // Count unique active trimmers across all entries
    const activeTrimmerCount = new Set(
        session.entries.flatMap(e => e.trimmers.filter(t => t.name).map(t => t.name))
    ).size;

    const totalStartWeight = session.entries.reduce((sum, e) => sum + e.startWeight, 0);
    const totalOutput = session.totalFlower + session.totalShake + session.totalTrim + session.totalWaste;
    const remainingWeight = totalStartWeight - totalOutput;

    const filteredEntries = session.entries.filter(entry => {
        if (activeTab === 'active') return entry.status === 'active';
        if (activeTab === 'upcoming') return entry.status === 'upcoming';
        return entry.status === 'submitted';
    });

    return (
        <div className="dashboard">
            <div className="dashboard-top-section">
                <div className="stats-grid">
                    {/* Row 1 */}
                    <StatCard icon={<Package size={18} />} iconClassName="start-icon" label="Total Start" value={`${totalStartWeight.toFixed(0)}g`} />
                    <StatCard icon={<Scale size={18} />} iconClassName="output-icon" label="Total Output" value={`${totalOutput.toFixed(0)}g`} />
                    <StatCard icon={<Hourglass size={18} />} iconClassName="remaining-icon" label="Remaining" value={`${remainingWeight.toFixed(0)}g`} />
                    <StatCard icon={<Users size={18} />} iconStyle={{ backgroundColor: 'rgba(28, 158, 255, 0.1)', color: '#1C9EFF' }} label="Trimmers" value={activeTrimmerCount} />
                    {/* Row 2 */}
                    <StatCard icon={<Cannabis size={18} />} iconClassName="flower-icon" label="Total Flower" value={`${session.totalFlower.toFixed(0)}g`} />
                    <StatCard icon={<Cannabis size={18} />} iconClassName="shake-icon" label="Total Shake" value={`${session.totalShake.toFixed(0)}g`} />
                    <StatCard icon={<Trash2 size={18} />} iconClassName="waste-icon" label="Total Waste" value={`${session.totalWaste.toFixed(0)}g`} />
                </div>

                <div className="dashboard-bar-wrapper">
                    <StackedProgressBar
                        segments={buildSegments(
                            {
                                flower: session.totalFlower,
                                shake: session.totalShake,
                                trim: session.totalTrim,
                                waste: session.totalWaste,
                            },
                            totalStartWeight
                        )}
                        total={totalStartWeight}
                        height={14}
                        showLegend
                        showPercentage
                    />
                </div>
            </div>

            <div className="actions-row">
                <div className="tabs-container">
                    <button
                        className={`tab-button ${activeTab === 'upcoming' ? 'active' : ''}`}
                        onClick={() => setActiveTab('upcoming')}
                    >
                        Upcoming
                    </button>
                    <button
                        className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
                        onClick={() => setActiveTab('active')}
                    >
                        Active
                    </button>
                    <button
                        className={`tab-button ${activeTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setActiveTab('completed')}
                    >
                        Complete
                    </button>
                </div>
                <div className="flex gap-2">
                    <button type="button" className="btn-new-batch" onClick={() => setIsModalOpen(true)}>
                        <Plus size={20} />
                        New Batch
                    </button>
                    <button type="button" className="btn-submit" onClick={onSubmit}>
                        Submit Session
                    </button>
                </div>
            </div>

            <EntryList
                entries={filteredEntries}
                onUpdateWeight={onUpdateWeight}
                onUpdateStrain={onUpdateStrain}
                onAddTrimmer={onAddTrimmer}
                onUpdateTrimmer={onUpdateTrimmer}
                onRemoveTrimmer={onRemoveTrimmer}
                onDeleteBatch={onDeleteBatch}
                onSubmitBatch={onSubmitBatch}
                onStartBatch={onStartBatch ? async (entryId) => {
                    setActiveTab('active');
                    await onStartBatch(entryId);
                } : undefined}
                onRevertBatch={onRevertBatch ? async (entryId) => {
                    setActiveTab('upcoming');
                    await onRevertBatch(entryId);
                } : undefined}
                onCreatePackage={onCreatePackage}
                trimmerProfiles={trimmerProfiles}
            />

            {isModalOpen && (
                <AddBatchModal
                    onClose={() => setIsModalOpen(false)}
                    onSubmit={handleAddSubmit}
                />
            )}
        </div>
    );
};

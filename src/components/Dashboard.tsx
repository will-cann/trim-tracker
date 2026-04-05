import React, { useState, useEffect } from 'react';
import type { TrimSession, CreateTrimSessionDTO, TrimmerProfile, CreatePackageDTO, HarvestBin } from '../types/definitions';
import { Cannabis, Trash2, Scale, Plus, Package, Hourglass, Users, Scissors } from 'lucide-react';
import { apiService } from '../services/apiService';

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
    const [readyBins, setReadyBins] = useState<HarvestBin[]>([]);
    const [sendingBin, setSendingBin] = useState<string | null>(null);

    useEffect(() => {
        apiService.getBins({ status: 'ready' }).then(setReadyBins);
    }, [session]); // reload when session changes (after bin sent to trim)

    const handleSendBinToTrim = async (binId: string) => {
        setSendingBin(binId);
        try {
            await apiService.binToTrim(binId);
            setReadyBins(prev => prev.filter(b => b.id !== binId));
            // Refresh happens via parent when session updates
        } finally {
            setSendingBin(null);
        }
    };

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
                    <StatCard icon={<Package size={18} />} iconClassName="start-icon" label="Est. Dry Weight" value={`${Math.round(totalStartWeight).toLocaleString()}g`} />
                    <StatCard icon={<Scale size={18} />} iconClassName="output-icon" label="Total Output" value={`${Math.round(totalOutput).toLocaleString()}g`} />
                    <StatCard icon={<Hourglass size={18} />} iconClassName="remaining-icon" label="Remaining" value={`${Math.round(remainingWeight).toLocaleString()}g`} />
                    <StatCard icon={<Users size={18} />} iconStyle={{ backgroundColor: 'rgba(28, 158, 255, 0.1)', color: '#1C9EFF' }} label="Trimmers" value={activeTrimmerCount} />
                    {/* Row 2 */}
                    <StatCard icon={<Cannabis size={18} />} iconClassName="flower-icon" label="Total Flower" value={`${Math.round(session.totalFlower).toLocaleString()}g`} />
                    <StatCard icon={<Cannabis size={18} />} iconClassName="shake-icon" label="Total Shake" value={`${Math.round(session.totalShake).toLocaleString()}g`} />
                    <StatCard icon={<Trash2 size={18} />} iconClassName="waste-icon" label="Total Waste" value={`${Math.round(session.totalWaste).toLocaleString()}g`} />
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

            {/* Ready Bins intake queue */}
            {readyBins.length > 0 && (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: 8,
                    padding: '12px 16px', background: '#F0FDF4', borderRadius: 8,
                    border: '1px solid #BBF7D0', marginBottom: 8,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#15803D', letterSpacing: '0.05em' }}>
                            Ready Bins ({readyBins.length})
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                        {readyBins.map(bin => (
                            <button
                                key={bin.id}
                                onClick={() => handleSendBinToTrim(bin.id)}
                                disabled={sendingBin === bin.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB',
                                    background: 'white', cursor: 'pointer', flexShrink: 0,
                                    opacity: sendingBin === bin.id ? 0.5 : 1,
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                    <span style={{ fontSize: '0.813rem', fontWeight: 600 }}>
                                        BIN-{String(bin.binNumber).padStart(3, '0')}
                                    </span>
                                    <span style={{ fontSize: '0.688rem', color: '#6B7280' }}>
                                        {bin.strain} · {bin.weight ? `${bin.weight}g` : '—'}
                                    </span>
                                </div>
                                <Scissors size={14} style={{ color: '#3BB570' }} />
                            </button>
                        ))}
                    </div>
                </div>
            )}

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

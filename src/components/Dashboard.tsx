import React, { useState } from 'react';
import type { TrimSession, CreateTrimSessionDTO } from '../types/definitions';
import { Cannabis, Trash2, Scale, Plus, X, Package, Hourglass } from 'lucide-react';
import { DashboardDonutChart } from './DashboardDonutChart';
import { EntryList } from './EntryList';
import { AddBatchModal } from './AddBatchModal';

interface DashboardProps {
    session: TrimSession;
    onUpdateWeight: (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => void;
    onSubmit: () => void;
    onAddBatch: (data: CreateTrimSessionDTO) => void;
    onUpdateStrain: (entryId: string, strain: string) => void;
    onAddTrimmer: (entryId: string) => void;
    onUpdateTrimmer: (entryId: string, trimmerId: string, updates: any) => void;
    onRemoveTrimmer: (entryId: string, trimmerId: string) => void;
    onDeleteBatch: (entryId: string) => void;
    onSubmitBatch?: (entryId: string) => void;
    trimmerProfiles: any[]; // TODO: Import type
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
    trimmerProfiles
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleAddSubmit = (data: CreateTrimSessionDTO) => {
        onAddBatch(data);
        setIsModalOpen(false);
    };

    const totalStartWeight = session.entries.reduce((sum, e) => sum + e.startWeight, 0);
    const totalOutput = session.totalFlower + session.totalShake + session.totalTrim + session.totalWaste;
    const remainingWeight = totalStartWeight - totalOutput;

    return (
        <div className="dashboard">
            <div className="dashboard-top-section">
                <div className="stats-grid">
                    {/* Row 1 */}
                    <div className="stat-item">
                        <div className="stat-icon start-icon">
                            <Package size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Total Start</label>
                            <p className="stat-value">{totalStartWeight.toFixed(0)}g</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon output-icon">
                            <Scale size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Total Output</label>
                            <p className="stat-value">{totalOutput.toFixed(0)}g</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon remaining-icon">
                            <Hourglass size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Remaining</label>
                            <p className="stat-value">{remainingWeight.toFixed(0)}g</p>
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="stat-item">
                        <div className="stat-icon flower-icon">
                            <Cannabis size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Total Flower</label>
                            <p className="stat-value">{session.totalFlower.toFixed(0)}g</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon shake-icon">
                            <Cannabis size={20} />
                        </div>
                        <div className="stat-content">
                            <label>Total Shake</label>
                            <p className="stat-value">{session.totalShake.toFixed(0)}g</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon waste-icon">
                            <Trash2 size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Total Waste</label>
                            <p className="stat-value">{session.totalWaste.toFixed(0)}g</p>
                        </div>
                    </div>
                </div>

                <div className="dashboard-chart-wrapper">
                    <DashboardDonutChart session={session} />
                </div>
            </div>

            <div className="actions-row">
                <button className="btn-new-batch" onClick={() => setIsModalOpen(true)}>
                    <Plus size={20} />
                    New Batch
                </button>
                <button className="btn-submit" onClick={onSubmit}>
                    Submit Session
                </button>
            </div>

            <EntryList
                entries={session.entries}
                onUpdateWeight={onUpdateWeight}
                onUpdateStrain={onUpdateStrain}
                onAddTrimmer={onAddTrimmer}
                onUpdateTrimmer={onUpdateTrimmer}
                onRemoveTrimmer={onRemoveTrimmer}
                onDeleteBatch={onDeleteBatch}
                onSubmitBatch={onSubmitBatch}
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

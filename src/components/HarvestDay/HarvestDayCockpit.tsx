import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, CheckCircle, ListChecks, ArrowLeft, Loader2 } from 'lucide-react';
import type { Harvest, HarvestPlantWeight, CreateHarvestDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { HarvestCenterColumn } from './HarvestCenterColumn';
import { HarvestLeftColumn } from './HarvestLeftColumn';
import { HarvestRightColumn } from './HarvestRightColumn';
import { HarvestDaySummary } from './HarvestDaySummary';
import { AddBatchPicker } from './AddBatchPicker';
import { Modal, Button } from '../ui';

interface HarvestDayCockpitProps {
    onExit: () => void;
}

export const HarvestDayCockpit: React.FC<HarvestDayCockpitProps> = ({ onExit }) => {
    const [phase, setPhase] = useState<'cockpit' | 'summary'>('cockpit');
    const [harvests, setHarvests] = useState<Harvest[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [plantWeights, setPlantWeights] = useState<Record<string, HarvestPlantWeight[]>>({});
    const [rooms, setRooms] = useState<Array<{ id: string; name: string; room_type: string }>>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        const [allHarvests, allRooms] = await Promise.all([
            apiService.getHarvests(),
            apiService.getRooms(),
        ]);

        const todayHarvests = allHarvests.filter(h =>
            h.status === 'planning' || h.status === 'active' || h.status === 'submitted'
        );
        setHarvests(todayHarvests);
        setRooms(allRooms);

        const weightMap: Record<string, HarvestPlantWeight[]> = {};
        await Promise.all(todayHarvests.map(async h => {
            weightMap[h.id] = await apiService.getPlantWeights(h.id);
        }));
        setPlantWeights(weightMap);

        if (!activeTabId && todayHarvests.length > 0) {
            setActiveTabId(todayHarvests[0].id);
        }
        setLoading(false);
    }, [activeTabId]);

    useEffect(() => {
        loadData();
    }, []);

    const refreshHarvest = useCallback(async () => {
        await loadData();
    }, [loadData]);

    const activeHarvest = harvests.find(h => h.id === activeTabId);
    const hasFrozen = activeHarvest?.allocations.some(a => a.allocationType === 'frozen');
    const submittedHarvests = harvests.filter(h => h.status === 'submitted');

    const canSubmit = activeHarvest
        && activeHarvest.totalWetWeight > 0
        && activeHarvest.allocations.length > 0
        && activeHarvest.status !== 'submitted';

    const handleCreate = async (data: CreateHarvestDTO) => {
        const newHarvest = await apiService.createHarvest(data);
        setShowCreateModal(false);
        await loadData();
        setActiveTabId(newHarvest.id);
    };

    const handleSubmitBatch = async () => {
        if (!activeHarvest) return;
        setSubmitting(true);
        try {
            await apiService.submitHarvestBatch(activeHarvest.id);
            setShowSubmitConfirm(false);
            await loadData();
            const next = harvests.find(h => h.id !== activeHarvest.id && h.status !== 'submitted');
            if (next) setActiveTabId(next.id);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveTab = async (harvestId: string) => {
        const h = harvests.find(hv => hv.id === harvestId);
        if (!h || h.status !== 'planning') return;
        await apiService.deleteHarvest(harvestId);
        if (activeTabId === harvestId) {
            const remaining = harvests.filter(hv => hv.id !== harvestId);
            setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
        }
        await loadData();
    };

    if (phase === 'summary') {
        return (
            <HarvestDaySummary
                harvests={submittedHarvests}
                plantWeights={plantWeights}
                onApprove={async () => {
                    await apiService.approveHarvestDay(submittedHarvests.map(h => h.id));
                    onExit();
                }}
                onBack={() => setPhase('cockpit')}
            />
        );
    }

    return (
        <div className="hd-cockpit">
            {/* Tab bar */}
            <div className="hd-tab-bar">
                <div className="hd-tabs">
                    <button
                        className="icon-btn"
                        onClick={onExit}
                        title="Back to Harvests"
                        style={{ marginRight: 'var(--space-sm)' }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <button
                        className="hd-tab-add"
                        onClick={() => setShowCreateModal(true)}
                        title="Add harvest batch"
                    >
                        <Plus size={16} />
                    </button>
                    {harvests.map(h => (
                        <button
                            key={h.id}
                            className={`hd-tab ${h.id === activeTabId ? 'hd-tab-active' : ''} ${h.status === 'submitted' ? 'hd-tab-submitted' : ''}`}
                            onClick={() => setActiveTabId(h.id)}
                        >
                            {h.status === 'submitted' && <CheckCircle size={13} />}
                            <span>{h.batchId}</span>
                            {h.status === 'planning' && (
                                <span
                                    className="hd-tab-close"
                                    onClick={e => { e.stopPropagation(); handleRemoveTab(h.id); }}
                                >
                                    <X size={13} />
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="hd-tab-actions">
                    {submittedHarvests.length > 0 && (
                        <button
                            className="btn-start-batch"
                            onClick={() => setPhase('summary')}
                        >
                            <ListChecks size={16} />
                            Review ({submittedHarvests.length})
                        </button>
                    )}
                </div>
            </div>

            {/* Cockpit body */}
            {loading ? (
                <div className="hd-empty">
                    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
                </div>
            ) : activeHarvest ? (
                <div className={`hd-columns ${hasFrozen ? 'hd-columns-3' : 'hd-columns-2'}`}>
                    <HarvestLeftColumn
                        harvest={activeHarvest}
                        onUpdate={refreshHarvest}
                    />
                    <HarvestCenterColumn
                        harvest={activeHarvest}
                        plantWeights={plantWeights[activeHarvest.id] || []}
                        rooms={rooms}
                        onUpdate={refreshHarvest}
                    />
                    {hasFrozen && (
                        <HarvestRightColumn
                            harvest={activeHarvest}
                            rooms={rooms}
                            onUpdate={refreshHarvest}
                        />
                    )}
                </div>
            ) : (
                <div className="hd-empty">
                    <p style={{ color: 'var(--text-secondary)' }}>No harvest batches yet.</p>
                    <button
                        className="btn-new-batch"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus size={16} />
                        Add First Batch
                    </button>
                </div>
            )}

            {/* Submit bar */}
            {activeHarvest && activeHarvest.status !== 'submitted' && (
                <div className="hd-submit-bar">
                    <div className="hd-submit-checks">
                        <span className={activeHarvest.totalWetWeight > 0 ? 'hd-check-pass' : 'hd-check-fail'}>
                            {activeHarvest.totalWetWeight > 0 ? '\u2713' : '\u2717'} Wet weight
                        </span>
                        <span className={activeHarvest.allocations.length > 0 ? 'hd-check-pass' : 'hd-check-fail'}>
                            {activeHarvest.allocations.length > 0 ? '\u2713' : '\u2717'} Allocation
                        </span>
                    </div>
                    <button
                        className="btn-start-batch"
                        onClick={() => setShowSubmitConfirm(true)}
                        disabled={!canSubmit}
                        style={{ padding: '0.625rem 1.5rem' }}
                    >
                        Submit Batch
                    </button>
                </div>
            )}

            {showCreateModal && (
                <AddBatchPicker
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreate}
                />
            )}

            {showSubmitConfirm && activeHarvest && (
                <Modal
                    title="Submit Harvest Batch"
                    contentClassName="max-w-md"
                    onClose={() => setShowSubmitConfirm(false)}
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
                            <Button variant="primary" onClick={handleSubmitBatch} disabled={submitting}>
                                {submitting && <Loader2 size={16} className="animate-spin" style={{ marginRight: 4 }} />}
                                Submit for Review
                            </Button>
                        </>
                    }
                >
                    <p style={{ color: 'var(--text-color)', margin: 0 }}>
                        Submit <strong>{activeHarvest.batchId}</strong> for admin review?
                    </p>
                    <div style={{ marginTop: 'var(--space-md)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        <p style={{ margin: '0 0 4px' }}>{activeHarvest.plantCount} plants, {activeHarvest.totalWetWeight.toFixed(0)}g wet weight</p>
                        {activeHarvest.allocations.map(a => (
                            <p key={a.id} style={{ margin: '0 0 4px' }}>
                                {a.allocationType === 'flower' ? 'Flower' : 'Frozen'}: {a.targetWeight.toFixed(0)}g
                            </p>
                        ))}
                        {activeHarvest.totalWasteWeight > 0 && (
                            <p style={{ margin: 0 }}>Waste: {activeHarvest.totalWasteWeight.toFixed(0)}g</p>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

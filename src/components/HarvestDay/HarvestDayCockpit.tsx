import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, CheckCircle, ListChecks, ArrowLeft, Loader2 } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
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

    // Full load — only on mount and after structural changes (create, delete, submit)
    const loadAll = useCallback(async () => {
        const [allHarvests, allRooms] = await Promise.all([
            apiService.getHarvests(),
            apiService.getRooms(),
        ]);

        const todayHarvests = allHarvests.filter(h =>
            h.status === 'planning' || h.status === 'active' || h.status === 'cutting' || h.status === 'submitted'
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
        loadAll();
    }, []);

    // Lightweight refresh — only reloads the active harvest + its weights
    const refreshHarvest = useCallback(async () => {
        if (!activeTabId) return;
        const [allHarvests, weights] = await Promise.all([
            apiService.getHarvests(),
            apiService.getPlantWeights(activeTabId),
        ]);
        const todayHarvests = allHarvests.filter(h =>
            h.status === 'planning' || h.status === 'active' || h.status === 'cutting' || h.status === 'submitted'
        );
        setHarvests(todayHarvests);
        setPlantWeights(prev => ({ ...prev, [activeTabId]: weights }));
    }, [activeTabId]);

    const cockpitRef = useRef<HTMLDivElement>(null);

    const activeHarvest = harvests.find(h => h.id === activeTabId);
    const hasFrozen = activeHarvest?.allocations.some(a => a.allocationType === 'frozen');
    const submittedHarvests = harvests.filter(h => h.status === 'submitted');
    const nonSubmitted = harvests.filter(h => h.status !== 'submitted');

    const canSubmit = activeHarvest
        && activeHarvest.totalWetWeight > 0
        && activeHarvest.allocations.length > 0
        && activeHarvest.status !== 'submitted';

    // Keyboard nav: Tab/Shift+Tab to cycle batches (when not in an input)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !e.altKey) return;
            const idx = nonSubmitted.findIndex(h => h.id === activeTabId);
            if (idx === -1) return;
            e.preventDefault();
            const next = e.shiftKey
                ? (idx - 1 + nonSubmitted.length) % nonSubmitted.length
                : (idx + 1) % nonSubmitted.length;
            setActiveTabId(nonSubmitted[next].id);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [activeTabId, nonSubmitted]);

    const handleCreate = async (data: CreateHarvestDTO) => {
        const newHarvest = await apiService.createHarvest(data);
        setShowCreateModal(false);
        await loadAll();
        setActiveTabId(newHarvest.id);
    };

    const handleSubmitBatch = async () => {
        if (!activeHarvest) return;
        setSubmitting(true);
        try {
            await apiService.submitHarvestBatch(activeHarvest.id);
            setShowSubmitConfirm(false);
            await loadAll();
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
        await loadAll();
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
        <div className="hd-cockpit" ref={cockpitRef}>
            {/* Tab bar */}
            <div className="hd-tab-bar">
                <div className="hd-tabs">
                    <button
                        className="icon-btn"
                        onClick={onExit}
                        title="Back to Harvests"
                        style={{ marginRight: 'var(--space-xs)' }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <button
                        className="hd-tab-add"
                        onClick={() => setShowCreateModal(true)}
                        title="Add harvest batch"
                    >
                        <Plus size={18} />
                    </button>
                    {harvests.map(h => (
                        <button
                            key={h.id}
                            className={`hd-tab ${h.id === activeTabId ? 'hd-tab-active' : ''} ${h.status === 'submitted' ? 'hd-tab-submitted' : ''}`}
                            onClick={() => setActiveTabId(h.id)}
                        >
                            {h.status === 'submitted' && <CheckCircle size={14} />}
                            <span>{h.batchId}</span>
                            {h.status === 'planning' && (
                                <span
                                    className="hd-tab-close"
                                    onClick={e => {
                                        e.stopPropagation();
                                        if (confirm(`Remove ${h.batchId}? This cannot be undone.`)) {
                                            handleRemoveTab(h.id);
                                        }
                                    }}
                                    title="Remove batch"
                                >
                                    <X size={14} />
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="hd-tab-actions">
                    {submittedHarvests.length > 0 && (
                        <button
                            className="hd-review-btn"
                            onClick={() => setPhase('summary')}
                        >
                            <ListChecks size={16} />
                            Review {submittedHarvests.length} batch{submittedHarvests.length !== 1 ? 'es' : ''}
                        </button>
                    )}
                </div>
            </div>

            {/* Cockpit body */}
            {loading ? (
                <div className="hd-empty">
                    <CenteredSpinner size="lg" label="Loading harvest…" />
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
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
                        Add flowering plants to create batches, then weigh each plant at the scale.
                    </p>
                    <button
                        className="hd-add-btn"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus size={18} />
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
                        {hasFrozen && activeHarvest.dryingLocation && (
                            <span className="hd-check-pass">{'\u2713'} Drying room</span>
                        )}
                    </div>
                    <button
                        className="hd-submit-btn"
                        onClick={() => setShowSubmitConfirm(true)}
                        disabled={!canSubmit}
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
                    size="sm"
                    onClose={() => setShowSubmitConfirm(false)}
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
                            <Button variant="primary" onClick={handleSubmitBatch} disabled={submitting}>
                                {submitting && <Loader2 size={14} className="animate-spin" />}
                                Submit for Review
                            </Button>
                        </>
                    }
                >
                    <p className="submit-modal-prompt">
                        Submit <strong>{activeHarvest.batchId}</strong> for admin review?
                    </p>
                    <dl className="submit-summary">
                        <div className="submit-summary-row">
                            <dt>Plants</dt>
                            <dd>{activeHarvest.plantCount}</dd>
                        </div>
                        <div className="submit-summary-row">
                            <dt>Wet weight</dt>
                            <dd>{activeHarvest.totalWetWeight.toFixed(0)} g</dd>
                        </div>
                        {activeHarvest.allocations.map(a => (
                            <div key={a.id} className="submit-summary-row">
                                <dt>{a.allocationType === 'flower' ? 'Flower' : 'Frozen'}</dt>
                                <dd>{a.targetWeight.toFixed(0)} g</dd>
                            </div>
                        ))}
                        {activeHarvest.totalWasteWeight > 0 && (
                            <div className="submit-summary-row submit-summary-row--waste">
                                <dt>Waste</dt>
                                <dd>{activeHarvest.totalWasteWeight.toFixed(0)} g</dd>
                            </div>
                        )}
                    </dl>
                </Modal>
            )}
        </div>
    );
};

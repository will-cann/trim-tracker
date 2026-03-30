import React, { useState } from 'react';
import { Flower2, Snowflake, ArrowRightLeft } from 'lucide-react';
import type { Harvest, HarvestWasteType, ContaminantFlag, AllocationChoice } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { WasteEntryForm } from '../Harvest/WasteEntryForm';

interface HarvestLeftColumnProps {
    harvest: Harvest;
    onUpdate: () => void;
}

const CONTAMINANTS: { value: ContaminantFlag; label: string }[] = [
    { value: 'powdery_mildew', label: 'Powdery Mildew' },
    { value: 'bud_rot', label: 'Bud Rot' },
    { value: 'insects', label: 'Insects' },
    { value: 'other', label: 'Other' },
];

const ALLOCATIONS: { value: AllocationChoice; label: string; icon: typeof Flower2 }[] = [
    { value: 'Flower', label: 'Flower', icon: Flower2 },
    { value: 'Frozen', label: 'Frozen', icon: Snowflake },
    { value: 'Both', label: 'Both', icon: ArrowRightLeft },
];

export const HarvestLeftColumn: React.FC<HarvestLeftColumnProps> = ({ harvest, onUpdate }) => {
    const flowerAlloc = harvest.allocations.find(a => a.allocationType === 'flower');
    const frozenAlloc = harvest.allocations.find(a => a.allocationType === 'frozen');

    const dbAllocation: AllocationChoice | null = harvest.allocations.length === 0
        ? null
        : harvest.allocations.length === 2
            ? 'Both'
            : flowerAlloc ? 'Flower' : 'Frozen';

    const available = harvest.totalWetWeight - harvest.totalWasteWeight;

    const [optimisticChoice, setOptimisticChoice] = useState<AllocationChoice | null>(dbAllocation);
    const [showBothSplit, setShowBothSplit] = useState(dbAllocation === 'Both');
    const [frozenTarget, setFrozenTarget] = useState(
        frozenAlloc ? String(frozenAlloc.targetWeight) : ''
    );
    const [allocating, setAllocating] = useState(false);

    // Sync optimistic state when harvest data updates from server
    const currentAllocation = dbAllocation || optimisticChoice;

    const handleAllocate = async (choice: AllocationChoice) => {
        if (allocating) return;

        // "Both" just opens the split panel — no API call yet
        if (choice === 'Both') {
            setOptimisticChoice('Both');
            setShowBothSplit(true);
            return;
        }

        // Skip if already set to this allocation
        if (dbAllocation === choice) return;

        setOptimisticChoice(choice);
        setShowBothSplit(false);
        setAllocating(true);
        try {
            // Use available weight, or 0 if not yet weighed (server will store it)
            const weight = Math.max(available, 0);
            const allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }> = [];
            if (choice === 'Flower') {
                allocations.push({ type: 'flower', targetWeight: weight });
            } else {
                allocations.push({ type: 'frozen', targetWeight: weight });
            }
            await apiService.allocateHarvest(harvest.id, allocations);
            await onUpdate();
        } catch (err) {
            console.error('Allocation failed:', err);
            setOptimisticChoice(dbAllocation);
        } finally {
            setAllocating(false);
        }
    };

    const handleBothAllocate = async () => {
        const frozen = Number(frozenTarget);
        if (!frozen || frozen <= 0 || frozen >= available || allocating) return;
        setAllocating(true);
        try {
            await apiService.allocateHarvest(harvest.id, [
                { type: 'flower', targetWeight: available - frozen },
                { type: 'frozen', targetWeight: frozen },
            ]);
            setShowBothSplit(false);
            await onUpdate();
        } finally {
            setAllocating(false);
        }
    };

    const handleWaste = async (wasteType: HarvestWasteType, weight: number) => {
        await apiService.recordHarvestWaste(harvest.id, wasteType, weight);
        await onUpdate();
    };

    const handleContaminantToggle = async (flag: ContaminantFlag) => {
        const current = harvest.contaminants || [];
        const updated = current.includes(flag)
            ? current.filter(c => c !== flag)
            : [...current, flag];
        await apiService.updateHarvest(harvest.id, { contaminants: updated });
        await onUpdate();
    };

    return (
        <div className="hd-column hd-left">
            {/* Allocation */}
            <div className="hd-section">
                <h3 className="hd-section-title">Allocation</h3>
                <div className="hd-alloc-chips">
                    {ALLOCATIONS.map(a => {
                        const Icon = a.icon;
                        const isActive = currentAllocation === a.value || (a.value === 'Both' && showBothSplit);
                        return (
                            <button
                                key={a.value}
                                className={`hd-alloc-chip ${isActive ? 'hd-alloc-chip-active' : ''}`}
                                data-type={a.value.toLowerCase()}
                                onClick={() => handleAllocate(a.value)}
                                disabled={allocating}
                            >
                                <Icon size={16} />
                                <span>{a.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Both mode: editable split */}
                {showBothSplit && harvest.totalWetWeight > 0 && (
                    <div className="hd-alloc-split">
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                            Set frozen target — remainder goes to flower.
                        </p>
                        <div className="hd-alloc-split-row">
                            <span className="hd-alloc-split-label">Frozen</span>
                            <input
                                type="number"
                                className="hd-alloc-split-input"
                                value={frozenTarget}
                                onChange={e => setFrozenTarget(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleBothAllocate()}
                                placeholder="0"
                                min="1"
                            />
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>g</span>
                            <button
                                className="btn-start-batch"
                                onClick={handleBothAllocate}
                                disabled={!frozenTarget || Number(frozenTarget) <= 0 || Number(frozenTarget) >= available}
                                style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                            >
                                Split
                            </button>
                        </div>
                        {frozenTarget && Number(frozenTarget) > 0 && Number(frozenTarget) < available && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                                Flower: {(available - Number(frozenTarget)).toFixed(0)}g / Frozen: {Number(frozenTarget).toFixed(0)}g
                            </p>
                        )}
                    </div>
                )}

                {/* Show current allocation summary */}
                {harvest.allocations.length > 0 && (
                    <div className="hd-allocation-summary">
                        {harvest.allocations.map(a => (
                            <div key={a.id} className="hd-allocation-row">
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                                    {a.allocationType === 'flower' ? 'Flower' : 'Frozen'}
                                </span>
                                <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                                    {a.targetWeight.toFixed(0)}g
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Waste */}
            <div className="hd-section">
                <h3 className="hd-section-title">Waste</h3>
                <WasteEntryForm
                    wasteEntries={harvest.waste}
                    totalWasteWeight={harvest.totalWasteWeight}
                    onAdd={handleWaste}
                />
            </div>

            {/* Contamination flags */}
            <div className="hd-section">
                <h3 className="hd-section-title">Contamination</h3>
                <div className="hd-contaminant-checks">
                    {CONTAMINANTS.map(c => {
                        const isChecked = (harvest.contaminants || []).includes(c.value);
                        return (
                            <label key={c.value} className="hd-contaminant-check">
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleContaminantToggle(c.value)}
                                />
                                <span>{c.label}</span>
                            </label>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

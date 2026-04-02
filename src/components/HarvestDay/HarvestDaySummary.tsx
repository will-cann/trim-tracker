import React from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { Harvest, HarvestPlantWeight } from '../../types/definitions';

interface HarvestDaySummaryProps {
    harvests: Harvest[];
    plantWeights: Record<string, HarvestPlantWeight[]>;
    onApprove: () => void;
    onBack: () => void;
}

export const HarvestDaySummary: React.FC<HarvestDaySummaryProps> = ({
    harvests,
    plantWeights,
    onApprove,
    onBack,
}) => {
    // Calculate stats per batch
    const batchStats = harvests.map(h => {
        const weights = plantWeights[h.id] || [];
        const plantCount = weights.length || h.plantCount;
        const avgPerPlant = plantCount > 0 ? h.totalWetWeight / plantCount : 0;
        const frozenAlloc = h.allocations.find(a => a.allocationType === 'frozen');
        const frozenWeight = frozenAlloc?.targetWeight || 0;

        return {
            harvest: h,
            plantCount,
            avgPerPlant,
            frozenWeight,
        };
    });

    // Outlier detection: mean + stddev of avg/plant
    const avgs = batchStats.filter(b => b.avgPerPlant > 0).map(b => b.avgPerPlant);
    const mean = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
    const stddev = avgs.length > 1
        ? Math.sqrt(avgs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / avgs.length)
        : 0;

    const isOutlier = (avg: number) => {
        if (avgs.length < 2 || stddev === 0) return false;
        return Math.abs(avg - mean) > 1.5 * stddev;
    };

    return (
        <div className="hd-summary">
            <div className="hd-summary-header">
                <button className="icon-btn" onClick={onBack}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-color)' }}>
                        Harvest Day Review
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {harvests.length} batch{harvests.length !== 1 ? 'es' : ''} submitted
                    </p>
                </div>
            </div>

            <div className="hd-summary-table-wrap">
                <table className="hd-summary-table">
                    <thead>
                        <tr>
                            <th>Batch ID</th>
                            <th>Strain</th>
                            <th style={{ textAlign: 'right' }}>Plants</th>
                            <th style={{ textAlign: 'right' }}>Wet Weight</th>
                            <th style={{ textAlign: 'right' }}>Avg / Plant</th>
                            <th style={{ textAlign: 'right' }}>Frozen</th>
                            <th style={{ textAlign: 'right' }}>Waste</th>
                            <th>Flags</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batchStats.map(({ harvest: h, plantCount, avgPerPlant, frozenWeight }) => (
                            <tr
                                key={h.id}
                                className={isOutlier(avgPerPlant) ? 'hd-summary-outlier' : ''}
                            >
                                <td className="font-medium">{h.batchId}</td>
                                <td>{h.strain}</td>
                                <td style={{ textAlign: 'right' }}>{plantCount}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {h.totalWetWeight.toFixed(0)}g
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    {avgPerPlant > 0 ? `${avgPerPlant.toFixed(0)}g` : '—'}
                                    {isOutlier(avgPerPlant) && (
                                        <span className="hd-outlier-badge" title="Avg/plant is unusually high or low">!</span>
                                    )}
                                </td>
                                <td style={{ textAlign: 'right', color: frozenWeight > 0 ? 'var(--secondary-color)' : 'var(--text-secondary)' }}>
                                    {frozenWeight > 0 ? `${frozenWeight.toFixed(0)}g` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', color: h.totalWasteWeight > 0 ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                                    {h.totalWasteWeight > 0 ? `${h.totalWasteWeight.toFixed(0)}g` : '—'}
                                </td>
                                <td>
                                    {h.contaminants.length > 0 && (
                                        <span className="hd-contaminant-dot" title={h.contaminants.join(', ')} />
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {avgs.length > 1 && (
                <p className="hd-summary-stats-note">
                    Avg weight/plant across batches: {mean.toFixed(0)}g
                    {stddev > 0 && ` (\u00B1${stddev.toFixed(0)}g)`}
                </p>
            )}

            <div className="hd-summary-actions">
                <button className="hd-action-btn" onClick={onBack}>Back</button>
                <button className="hd-submit-btn" onClick={onApprove}>
                    <CheckCircle2 size={18} />
                    Approve {harvests.length} Batch{harvests.length !== 1 ? 'es' : ''}
                    <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 4 }}>
                        ({batchStats.reduce((sum, b) => sum + b.plantCount, 0)} plants, {harvests.reduce((sum, h) => sum + h.totalWetWeight, 0).toFixed(0)}g)
                    </span>
                </button>
            </div>
        </div>
    );
};

import React, { useMemo } from 'react';
import { Layers, Wand2 } from 'lucide-react';
import type { MapPlant, CohortSortKey } from '../../types/plantMap';
import { buildCohorts } from '../../types/plantMap';
import { categoryColor } from './plantMapColors';

interface CohortPanelProps {
    plants: MapPlant[];
    order: CohortSortKey[];
    onOrderChange: (order: CohortSortKey[]) => void;
    /** Build and preview a full-room arrangement. */
    onProposeLayout: () => void;
    /** Place only the plants that have no cell yet. */
    onPlaceUnplaced: () => void;
    unplacedCount: number;
    hasLayout: boolean;
    cohortColorIndex: Map<string, number>;
    colorBy: 'feed' | 'flower' | 'stretch';
}

const KEY_LABEL: Record<CohortSortKey, string> = { feed: 'Feed', flower: 'Flower length', stretch: 'Stretch' };

export const cohortValue = (p: { feedProfile: string | null; floweringDays: number | null; stretchTrait: string | null }, key: 'feed' | 'flower' | 'stretch'): string => {
    if (key === 'feed') return p.feedProfile ?? 'No feed set';
    if (key === 'flower') return p.floweringDays != null ? `${p.floweringDays} days` : 'No flower length';
    return p.stretchTrait ? `${p.stretchTrait} stretch` : 'No stretch set';
};

export const CohortPanel: React.FC<CohortPanelProps> = ({
    plants, order, onOrderChange, onProposeLayout, onPlaceUnplaced, unplacedCount, hasLayout, cohortColorIndex, colorBy,
}) => {
    const cohorts = useMemo(() => buildCohorts(plants.map(p => ({
        id: p.id, label: p.label, strainName: p.strainName, feedProfile: p.feedProfile, floweringDays: p.floweringDays, stretchTrait: p.stretchTrait,
    })), order), [plants, order]);

    const missing = plants.filter(p => p.feedProfile == null || p.floweringDays == null || p.stretchTrait == null).length;

    const move = (key: CohortSortKey, dir: -1 | 1) => {
        const i = order.indexOf(key);
        const j = i + dir;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        [next[i], next[j]] = [next[j], next[i]];
        onOrderChange(next);
    };

    return (
        <div className="room-map-panel-body">
            <p className="text-xs text-gray-500 mb-3">
                Benches fill row by row in this order, so each row shares one feed program, finishes on one date and sits at one height under the lights.
            </p>
            <ol className="room-map-order">
                {order.map((key, i) => (
                    <li key={key}>
                        <span className="room-map-order-num">{i + 1}</span>
                        <span className="flex-1">{KEY_LABEL[key]}</span>
                        <button className="room-map-icon-btn" onClick={() => move(key, -1)} disabled={i === 0} title="Sort earlier">↑</button>
                        <button className="room-map-icon-btn" onClick={() => move(key, 1)} disabled={i === order.length - 1} title="Sort later">↓</button>
                    </li>
                ))}
            </ol>

            <div className="flex flex-col gap-2 mt-3">
                <button className="btn-primary text-xs px-2 py-1.5 justify-center" onClick={onProposeLayout} disabled={!hasLayout || plants.length === 0}>
                    <Wand2 size={12} /> Arrange whole room by cohort
                </button>
                <button className="btn-secondary text-xs px-2 py-1.5 justify-center" onClick={onPlaceUnplaced} disabled={!hasLayout || unplacedCount === 0}>
                    <Layers size={12} /> Place {unplacedCount} unplaced plant{unplacedCount === 1 ? '' : 's'}
                </button>
                <p className="text-[11px] text-gray-400">Both skip hot cells while the room has room, and keep the shortest flower cycles for any hot cell they must use.</p>
            </div>

            {missing > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 mt-3">
                    {missing} plant{missing === 1 ? '' : 's'} missing a feed, flower length or stretch value. Set them per strain in Settings → Strains so they sort properly.
                </p>
            )}

            <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-4 mb-1">{cohorts.length} cohort{cohorts.length === 1 ? '' : 's'} in this room</p>
            <ul className="room-map-cohorts">
                {cohorts.map(c => {
                    const sample = c.plants[0];
                    const colorKey = cohortValue({ feedProfile: c.feedProfile, floweringDays: c.floweringDays, stretchTrait: c.stretchTrait }, colorBy);
                    const idx = cohortColorIndex.get(colorKey) ?? 0;
                    return (
                        <li key={c.key} className="room-map-cohort">
                            <span className="room-map-cohort-swatch" style={{ background: categoryColor(idx) }} />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-800">
                                    {cohortValue(sample, 'feed')} · {cohortValue(sample, 'flower')} · {cohortValue(sample, 'stretch')}
                                </div>
                                <div className="text-[11px] text-gray-400 truncate">{c.strains.join(', ')}</div>
                            </div>
                            <span className="text-xs font-semibold tabular-nums text-gray-700">{c.plants.length}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

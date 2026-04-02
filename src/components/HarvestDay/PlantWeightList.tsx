import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import type { HarvestPlantWeight } from '../../types/definitions';

interface PlantWeightListProps {
    weights: HarvestPlantWeight[];
    onDelete: (id: string) => void;
    newestId?: string;
}

export const PlantWeightList: React.FC<PlantWeightListProps> = ({ weights, onDelete, newestId }) => {
    const bottomRef = useRef<HTMLDivElement>(null);
    const rowsRef = useRef<HTMLDivElement>(null);
    const [atBottom, setAtBottom] = useState(false);

    useEffect(() => {
        if (newestId) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [newestId]);

    const checkScroll = useCallback(() => {
        const el = rowsRef.current;
        if (!el) return;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
        setAtBottom(isAtBottom);
    }, []);

    useEffect(() => {
        checkScroll();
    }, [weights.length, checkScroll]);

    if (weights.length === 0) return null;

    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    const avg = total / weights.length;

    return (
        <div className="plant-weight-list">
            <div
                ref={rowsRef}
                className={`plant-weight-rows ${atBottom ? 'plant-weight-rows--at-bottom' : ''}`}
                onScroll={checkScroll}
            >
                {weights.map(w => (
                    <div
                        key={w.id}
                        className={`plant-weight-row ${w.id === newestId ? 'plant-weight-row-new' : ''}`}
                    >
                        <span className="plant-weight-num">#{w.plantNumber}</span>
                        <span className="plant-weight-val">{w.weight.toFixed(0)}g</span>
                        <button
                            className="plant-weight-del"
                            onClick={() => onDelete(w.id)}
                            title="Remove"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className="plant-weight-footer">
                <span>{weights.length} plant{weights.length !== 1 ? 's' : ''}</span>
                <span style={{ color: 'var(--text-secondary)' }}>avg {avg.toFixed(0)}g</span>
                <span className="plant-weight-total">{total.toFixed(0)}g</span>
            </div>
        </div>
    );
};

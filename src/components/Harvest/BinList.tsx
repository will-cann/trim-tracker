import React from 'react';
import type { HarvestBin } from '../../types/definitions';
import { BinCard } from './BinCard';

interface BinListProps {
    bins: HarvestBin[];
    onUpdate: (bin: HarvestBin) => void;
    onSendToTrim?: (binId: string) => void;
    compact?: boolean;
    emptyMessage?: string;
}

export const BinList: React.FC<BinListProps> = ({
    bins, onUpdate, onSendToTrim, compact, emptyMessage,
}) => {
    if (bins.length === 0) {
        return (
            <div style={{
                textAlign: 'center', padding: '16px 0', color: '#C0C0C0',
                fontSize: '0.813rem',
            }}>
                {emptyMessage || 'No bins'}
            </div>
        );
    }

    return (
        <div style={{
            display: compact ? 'flex' : 'grid',
            gap: compact ? 8 : 12,
            overflowX: compact ? 'auto' : undefined,
            gridTemplateColumns: compact ? undefined : '1fr',
        }}>
            {bins.map(bin => (
                <BinCard
                    key={bin.id}
                    bin={bin}
                    onUpdate={onUpdate}
                    onSendToTrim={onSendToTrim}
                    compact={compact}
                />
            ))}
        </div>
    );
};

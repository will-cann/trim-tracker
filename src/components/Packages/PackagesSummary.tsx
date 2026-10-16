import React from 'react';
import type { Package, PackageType } from '../../types/definitions';
import { TypeChip } from '../ui';
import { formatPackageQuantity, isGramUnit } from './packageConstants';

interface PackagesSummaryProps {
    packages: Package[];
}

type Bucket = { count: number; grams: number; each: number };

const emptyBucket = (): Bucket => ({ count: 0, grams: 0, each: 0 });

const add = (b: Bucket, p: Package) => {
    b.count += 1;
    if (isGramUnit(p.unit)) b.grams += p.quantity;
    else b.each += p.quantity;
};

const bucketQuantity = (b: Bucket): string => {
    const parts: string[] = [];
    if (b.grams > 0) parts.push(formatPackageQuantity(b.grams, 'g'));
    if (b.each > 0) parts.push(formatPackageQuantity(b.each, 'each'));
    return parts.join(' + ');
};

/**
 * One-line inventory summary: active count and quantity, status and lab
 * exceptions, then the active inventory broken down by product type.
 */
export const PackagesSummary: React.FC<PackagesSummaryProps> = ({ packages }) => {
    const live = packages.filter(p => p.status !== 'archived');
    const active = emptyBucket();
    const byType = new Map<PackageType, Bucket>();
    let onHold = 0, inTransit = 0, finished = 0, labAwaiting = 0, labFailed = 0;

    for (const p of live) {
        if (p.status === 'active') {
            add(active, p);
            if (!byType.has(p.packageType)) byType.set(p.packageType, emptyBucket());
            add(byType.get(p.packageType)!, p);
        }
        if (p.status === 'on_hold') onHold += 1;
        if (p.status === 'in_transit') inTransit += 1;
        if (p.status === 'finished') finished += 1;
        if (p.status !== 'finished') {
            if (p.labTestingState === 'submitted') labAwaiting += 1;
            if (p.labTestingState === 'failed') labFailed += 1;
        }
    }

    const typeRows = [...byType.entries()].sort((a, b) => b[1].grams + b[1].each - (a[1].grams + a[1].each));

    return (
        <div className="summary-strip">
            <div className="summary-strip-stats">
                <Stat value={active.count} label="active" />
                {active.grams > 0 && <Stat value={formatPackageQuantity(active.grams, 'g')} label="active weight" />}
                {active.each > 0 && <Stat value={formatPackageQuantity(active.each, 'each')} label="active units" />}
                <Stat value={onHold} label="on hold" color={onHold ? '#B06A1F' : undefined} />
                {inTransit > 0 && <Stat value={inTransit} label="in transit" color="#1B5EB5" />}
                <Stat value={finished} label="finished" muted />
            </div>

            <div className="summary-strip-attention">
                <span className="summary-strip-label">Lab</span>
                {labAwaiting === 0 && labFailed === 0 ? (
                    <span className="text-xs text-gray-500">Nothing awaiting results</span>
                ) : (
                    <>
                        {labAwaiting > 0 && (
                            <span className="summary-strip-chip">
                                <span className="data-table-dot" style={{ background: '#1C9EFF' }} />
                                <span className="font-semibold tabular-nums">{labAwaiting}</span>
                                <span className="text-gray-500">awaiting results</span>
                            </span>
                        )}
                        {labFailed > 0 && (
                            <span className="summary-strip-chip">
                                <span className="data-table-dot" style={{ background: '#DF5B59' }} />
                                <span className="font-semibold tabular-nums">{labFailed}</span>
                                <span className="text-gray-500">failed</span>
                            </span>
                        )}
                    </>
                )}
            </div>

            {typeRows.length > 0 && (
                <div className="summary-strip-detail">
                    <span className="summary-strip-label">Active by type</span>
                    {typeRows.map(([type, b]) => (
                        <span key={type} className="summary-strip-chip summary-strip-chip--plain">
                            <TypeChip palette="packageType" value={type} />
                            <span className="font-semibold tabular-nums">{b.count}</span>
                            <span className="text-gray-500 tabular-nums">{bucketQuantity(b)}</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

const Stat: React.FC<{ value: React.ReactNode; label: string; color?: string; muted?: boolean }> = ({ value, label, color, muted }) => (
    <span className="summary-strip-stat">
        <span
            className="summary-strip-stat-value tabular-nums"
            style={color ? { color } : muted ? { color: '#737373' } : undefined}
        >
            {value}
        </span>
        <span className="summary-strip-stat-label">{label}</span>
    </span>
);

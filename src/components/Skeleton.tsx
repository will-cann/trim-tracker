import React from 'react';
import { CenteredSpinner } from './Spinner';

/** A single pulsing bar. Width/height via className or style. */
const Bar: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse rounded bg-gray-100 ${className}`} />
);

/** Skeleton for a stat card row (4 cards). */
export const StatsSkeleton: React.FC = () => (
    <div className="stats-grid">
        {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-item">
                <div className="animate-pulse w-10 h-10 rounded-xl bg-gray-100" />
                <div className="stat-content flex flex-col gap-2">
                    <Bar className="h-3 w-16" />
                    <Bar className="h-5 w-10" />
                </div>
            </div>
        ))}
    </div>
);

/** Skeleton for a table with header + n rows. */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
    <div className="trim-card !p-0 overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-6">
            {Array.from({ length: cols }).map((_, i) => (
                <Bar key={i} className="h-3 w-20" />
            ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="px-4 py-3.5 flex gap-6 border-b border-gray-50">
                {Array.from({ length: cols }).map((_, c) => (
                    <Bar key={c} className={`h-3.5 ${c === 0 ? 'w-28' : 'w-12'}`} />
                ))}
            </div>
        ))}
    </div>
);

/** Skeleton for harvest/plant cards (n cards in a grid). */
export const CardsSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
    <div className="entry-list">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="trim-card animate-pulse">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-100" />
                        <div className="flex flex-col gap-2">
                            <Bar className="h-4 w-32" />
                            <Bar className="h-3 w-20" />
                        </div>
                    </div>
                    <Bar className="h-6 w-16 rounded-full" />
                </div>
                <div className="flex gap-4 mt-3">
                    <Bar className="h-3 w-24" />
                    <Bar className="h-3 w-20" />
                    <Bar className="h-3 w-16" />
                </div>
            </div>
        ))}
    </div>
);

/** Skeleton for the plant map room grid. */
export const RoomGridSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
    <div className="plant-map-grid">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="trim-card animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gray-100" />
                    <Bar className="h-4 w-28" />
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                    {Array.from({ length: 12 }).map((_, j) => (
                        <div key={j} className="w-full aspect-square rounded bg-gray-100" />
                    ))}
                </div>
            </div>
        ))}
    </div>
);

/** Skeleton for a list of sidebar items. */
export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
    <div className="flex flex-col gap-1">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2.5 animate-pulse">
                <div className="w-4 h-4 rounded bg-gray-100" />
                <div className="flex-1 flex flex-col gap-1.5">
                    <Bar className="h-3 w-3/4" />
                    <Bar className="h-2.5 w-1/2" />
                </div>
            </div>
        ))}
    </div>
);

/** Full-page centered skeleton with a spinner (for top-level views). */
export const PageSkeleton: React.FC<{ label?: string }> = ({ label }) => (
    <CenteredSpinner size="lg" label={label} />
);

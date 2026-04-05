import { useState, useRef } from 'react';
import {
    ClipboardList, Scissors, Send, Clock, Package, CheckCircle2,
    GripVertical, Sprout, MapPin, AlertTriangle,
} from 'lucide-react';
import type { Harvest, HarvestStatus } from '../../types/definitions';
import { apiService } from '../../services/apiService';

// ── Config ───────────────────────────────────────────────────────────────────

const COLUMNS: { status: HarvestStatus; label: string; color: string; icon: typeof Clock }[] = [
    { status: 'planning', label: 'Planning', color: '#1C9EFF', icon: ClipboardList },
    { status: 'cutting', label: 'Cutting', color: '#3BB570', icon: Scissors },
    { status: 'submitted', label: 'Submitted', color: '#FA9E52', icon: Send },
    { status: 'hanging', label: 'Hanging', color: '#FA9E52', icon: Clock },
    { status: 'bucking', label: 'Binning', color: '#C27ADB', icon: Package },
    { status: 'completed', label: 'Completed', color: '#959595', icon: CheckCircle2 },
];

// Map old statuses to new columns for backward compat
const STATUS_COLUMN_MAP: Record<string, string> = {
    planning: 'planning',
    active: 'cutting',
    cutting: 'cutting',
    submitted: 'submitted',
    drying: 'hanging',
    hanging: 'hanging',
    ready: 'bucking',
    bucking: 'bucking',
    completed: 'completed',
};

// Valid drag transitions (from → to[])
const VALID_TRANSITIONS: Record<string, string[]> = {
    planning: ['cutting'],
    cutting: ['submitted'],
    // submitted → hanging requires manager approval (via approve endpoint, not drag)
    hanging: ['bucking'],
    bucking: ['completed'],
};

const formatWeight = (g: number) => {
    if (g === 0) return '—';
    if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    return `${g.toLocaleString(undefined, { maximumFractionDigits: 0 })} g`;
};

const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;

const getDryingDays = (harvest: Harvest) => {
    const approved = harvest.approvedAt;
    if (!approved) return 0;
    return Math.floor((Date.now() - new Date(approved).getTime()) / (1000 * 60 * 60 * 24));
};

// ── Kanban Card ──────────────────────────────────────────────────────────────

const HarvestKanbanCard: React.FC<{
    harvest: Harvest;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (id: string) => void;
}> = ({ harvest, onDragStart, onClick }) => {
    const col = STATUS_COLUMN_MAP[harvest.status] || harvest.status;
    const binCount = harvest.bins?.length || 0;
    const curingBins = harvest.bins?.filter(b => b.status === 'curing').length || 0;
    const readyBins = harvest.bins?.filter(b => b.status === 'ready').length || 0;

    return (
        <div
            className="kanban-card"
            draggable
            onDragStart={e => onDragStart(e, harvest.id)}
            onClick={() => onClick(harvest.id)}
        >
            <div className="kanban-card-grip">
                <GripVertical size={12} />
            </div>
            <div className="kanban-card-content">
                <div className="kanban-card-name">{harvest.strain}</div>
                <div className="kanban-card-meta">
                    <span className="kanban-card-strain" style={{ fontFamily: 'monospace', fontSize: '0.688rem' }}>
                        {harvest.batchId}
                    </span>
                    {harvest.plantCount > 0 && (
                        <span className="kanban-card-material">
                            <Sprout size={10} /> {harvest.plantCount}
                        </span>
                    )}
                </div>

                {/* Context-dependent info */}
                {harvest.totalWetWeight > 0 && (
                    <div style={{ fontSize: '0.688rem', color: '#6B7280', marginTop: 4 }}>
                        {formatWeight(harvest.totalWetWeight)} wet
                        {harvest.dryWeight ? ` · ${formatWeight(harvest.dryWeight)} dry` : ''}
                    </div>
                )}

                {col === 'hanging' && (
                    <div style={{ fontSize: '0.688rem', color: '#FA9E52', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={10} /> Day {getDryingDays(harvest)} of ~7
                        {harvest.dryingLocation && (
                            <span style={{ color: '#959595' }}>
                                <MapPin size={10} style={{ marginLeft: 4 }} /> {harvest.dryingLocation}
                            </span>
                        )}
                    </div>
                )}

                {col === 'bucking' && binCount > 0 && (
                    <div style={{ fontSize: '0.688rem', marginTop: 4, display: 'flex', gap: 8 }}>
                        <span style={{ color: '#C27ADB' }}>{binCount} bins</span>
                        {curingBins > 0 && <span style={{ color: '#FA9E52' }}>{curingBins} curing</span>}
                        {readyBins > 0 && <span style={{ color: '#3BB570' }}>{readyBins} ready</span>}
                    </div>
                )}

                {/* Footer */}
                <div className="kanban-card-footer">
                    {formatDate(harvest.createdAt) && (
                        <span className="kanban-card-date">{formatDate(harvest.createdAt)}</span>
                    )}
                    {harvest.isOnHold && (
                        <span style={{ color: '#DF5B59', fontSize: '0.625rem', fontWeight: 600 }}>
                            <AlertTriangle size={10} /> HOLD
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Kanban Column ────────────────────────────────────────────────────────────

const HarvestKanbanColumn: React.FC<{
    status: string;
    label: string;
    color: string;
    icon: typeof Clock;
    harvests: Harvest[];
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDrop: (status: string) => void;
    dragOverStatus: string | null;
    onDragOver: (status: string) => void;
    onDragLeave: () => void;
    onCardClick: (id: string) => void;
}> = ({ status, label, color, icon: Icon, harvests, onDragStart, onDrop, dragOverStatus, onDragOver, onDragLeave, onCardClick }) => {
    const isOver = dragOverStatus === status;

    return (
        <div
            className={`kanban-column ${isOver ? 'kanban-column--dragover' : ''}`}
            onDragOver={e => { e.preventDefault(); onDragOver(status); }}
            onDragLeave={onDragLeave}
            onDrop={e => { e.preventDefault(); onDrop(status); }}
        >
            <div className="kanban-column-header">
                <div className="kanban-column-title">
                    <Icon size={14} style={{ color }} />
                    <span>{label}</span>
                </div>
                <span className="kanban-column-count" style={{ color }}>{harvests.length}</span>
            </div>
            <div className="kanban-column-cards">
                {harvests.map(h => (
                    <HarvestKanbanCard
                        key={h.id}
                        harvest={h}
                        onDragStart={onDragStart}
                        onClick={onCardClick}
                    />
                ))}
                {harvests.length === 0 && (
                    <div className="kanban-column-empty">
                        No {label.toLowerCase()} harvests
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────

interface HarvestKanbanProps {
    harvests: Harvest[];
    onUpdate: () => void;
    onCardClick: (id: string) => void;
    onNavigateHarvestDay?: () => void;
}

export const HarvestKanban: React.FC<HarvestKanbanProps> = ({ harvests, onUpdate, onCardClick, onNavigateHarvestDay }) => {
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
    const draggedId = useRef<string | null>(null);

    const handleDragStart = (_e: React.DragEvent, id: string) => {
        draggedId.current = id;
    };

    const handleDrop = async (targetStatus: string) => {
        const id = draggedId.current;
        if (!id) return;

        const harvest = harvests.find(h => h.id === id);
        if (!harvest) {
            draggedId.current = null;
            setDragOverStatus(null);
            return;
        }

        const currentCol = STATUS_COLUMN_MAP[harvest.status] || harvest.status;
        if (currentCol === targetStatus) {
            draggedId.current = null;
            setDragOverStatus(null);
            return;
        }

        // Check valid transitions
        const allowed = VALID_TRANSITIONS[currentCol];
        if (!allowed || !allowed.includes(targetStatus)) {
            draggedId.current = null;
            setDragOverStatus(null);
            return;
        }

        // Execute transition
        if (currentCol === 'planning' && targetStatus === 'cutting') {
            // Navigate to Harvest Day cockpit if available
            if (onNavigateHarvestDay) {
                onNavigateHarvestDay();
            } else {
                await apiService.updateHarvest(id, { status: 'cutting' });
            }
        } else if (currentCol === 'cutting' && targetStatus === 'submitted') {
            await apiService.submitHarvestBatch(id);
        } else if (currentCol === 'hanging' && targetStatus === 'bucking') {
            await apiService.updateHarvest(id, { status: 'bucking' });
        } else if (currentCol === 'bucking' && targetStatus === 'completed') {
            await apiService.updateHarvest(id, { status: 'completed' });
        }

        draggedId.current = null;
        setDragOverStatus(null);
        onUpdate();
    };

    // Group harvests by column (map old statuses)
    const grouped: Record<string, Harvest[]> = {};
    for (const col of COLUMNS) {
        grouped[col.status] = [];
    }
    for (const h of harvests) {
        const col = STATUS_COLUMN_MAP[h.status] || h.status;
        if (grouped[col]) {
            grouped[col].push(h);
        }
    }

    return (
        <div className="kanban-board" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {COLUMNS.map(col => (
                <HarvestKanbanColumn
                    key={col.status}
                    {...col}
                    harvests={grouped[col.status] || []}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    dragOverStatus={dragOverStatus}
                    onDragOver={setDragOverStatus}
                    onDragLeave={() => setDragOverStatus(null)}
                    onCardClick={onCardClick}
                />
            ))}
        </div>
    );
};

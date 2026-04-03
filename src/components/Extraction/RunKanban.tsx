import { useState, useRef } from 'react';
import { Play, CheckCircle2, Clock, Snowflake, Leaf, GripVertical } from 'lucide-react';
import type { ExtractionRun } from '../../types/definitions';
import { apiService } from '../../services/apiService';

// ── Config ───────────────────────────────────────────────────────────────────

const COLUMNS: { status: string; label: string; color: string; icon: typeof Clock }[] = [
    { status: 'planned', label: 'Planned', color: '#959595', icon: Clock },
    { status: 'active', label: 'Active', color: '#1C9EFF', icon: Play },
    { status: 'completed', label: 'Completed', color: '#3BB570', icon: CheckCircle2 },
];

const MATERIAL_LABELS: Record<string, string> = {
    fresh_frozen: 'Fresh Frozen',
    dry_trim: 'Dry Trim',
    bubble_hash: 'Bubble Hash',
    rosin: 'Rosin',
    flower: 'Flower',
    trim: 'Trim',
    shake: 'Shake',
};

const MATERIAL_ICONS: Record<string, typeof Snowflake> = {
    fresh_frozen: Snowflake,
    dry_trim: Leaf,
};

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;

// ── Kanban Card ──────────────────────────────────────────────────────────────

const KanbanCard: React.FC<{
    run: ExtractionRun;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (id: string) => void;
}> = ({ run, onDragStart, onClick }) => {
    const completedSteps = run.steps.filter(s => s.status === 'completed').length;
    const totalSteps = run.steps.filter(s => !s.isOptional).length;
    const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
    const MaterialIcon = run.inputMaterial ? MATERIAL_ICONS[run.inputMaterial] : null;

    const overallYield = run.steps
        .filter(s => s.status === 'completed' && s.yieldPct != null)
        .reduce((pct, s) => pct * (s.yieldPct! / 100), 1);
    const hasYield = run.steps.some(s => s.yieldPct != null);

    // Current step name
    const activeStep = run.steps.find(s => s.status === 'active');
    const nextStep = run.steps.find(s => s.status === 'pending');
    const currentStepName = activeStep?.name || nextStep?.name;

    return (
        <div
            className="kanban-card"
            draggable
            onDragStart={e => onDragStart(e, run.id)}
            onClick={() => onClick(run.id)}
        >
            <div className="kanban-card-grip">
                <GripVertical size={12} />
            </div>
            <div className="kanban-card-content">
                <div className="kanban-card-name">{run.name}</div>
                <div className="kanban-card-meta">
                    {run.strain && <span className="kanban-card-strain">{run.strain}</span>}
                    {run.inputMaterial && (
                        <span className="kanban-card-material">
                            {MaterialIcon && <MaterialIcon size={10} />}
                            {MATERIAL_LABELS[run.inputMaterial] || run.inputMaterial}
                        </span>
                    )}
                </div>

                {/* Progress bar */}
                {totalSteps > 0 && (
                    <div className="kanban-card-progress">
                        <div className="kanban-card-progress-bar">
                            <div
                                className="kanban-card-progress-fill"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                        <span className="kanban-card-progress-label">
                            {completedSteps}/{totalSteps}
                        </span>
                    </div>
                )}

                {/* Footer: current step + yield */}
                <div className="kanban-card-footer">
                    {currentStepName && run.status === 'active' && (
                        <span className="kanban-card-step">
                            {activeStep ? '▸ ' : ''}{currentStepName}
                        </span>
                    )}
                    {run.status !== 'active' && formatDate(run.plannedStart || run.createdAt) && (
                        <span className="kanban-card-date">
                            {formatDate(run.plannedStart || run.createdAt)}
                        </span>
                    )}
                    {hasYield && (
                        <span className="kanban-card-yield">
                            {(overallYield * 100).toFixed(1)}%
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Kanban Column ────────────────────────────────────────────────────────────

const KanbanColumn: React.FC<{
    status: string;
    label: string;
    color: string;
    icon: typeof Clock;
    runs: ExtractionRun[];
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDrop: (status: string) => void;
    dragOverStatus: string | null;
    onDragOver: (status: string) => void;
    onDragLeave: () => void;
    onCardClick: (id: string) => void;
}> = ({ status, label, color, icon: Icon, runs, onDragStart, onDrop, dragOverStatus, onDragOver, onDragLeave, onCardClick }) => {
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
                <span className="kanban-column-count" style={{ color }}>{runs.length}</span>
            </div>
            <div className="kanban-column-cards">
                {runs.map(run => (
                    <KanbanCard
                        key={run.id}
                        run={run}
                        onDragStart={onDragStart}
                        onClick={onCardClick}
                    />
                ))}
                {runs.length === 0 && (
                    <div className="kanban-column-empty">
                        No {label.toLowerCase()} runs
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────

interface RunKanbanProps {
    runs: ExtractionRun[];
    onUpdate: () => void;
    onCardClick: (id: string) => void;
}

export const RunKanban: React.FC<RunKanbanProps> = ({ runs, onUpdate, onCardClick }) => {
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
    const draggedId = useRef<string | null>(null);

    const handleDragStart = (_e: React.DragEvent, id: string) => {
        draggedId.current = id;
    };

    const handleDrop = async (targetStatus: string) => {
        const id = draggedId.current;
        if (!id) return;

        const run = runs.find(r => r.id === id);
        if (!run || run.status === targetStatus) {
            draggedId.current = null;
            setDragOverStatus(null);
            return;
        }

        // Validate transitions
        const valid =
            (run.status === 'planned' && targetStatus === 'active') ||
            (run.status === 'planned' && targetStatus === 'cancelled') ||
            (run.status === 'active' && targetStatus === 'completed') ||
            (run.status === 'active' && targetStatus === 'cancelled');

        if (!valid) {
            draggedId.current = null;
            setDragOverStatus(null);
            return;
        }

        await apiService.updateExtractionRun(id, { status: targetStatus });

        // If activating, also start the first step
        if (targetStatus === 'active' && run.steps.length > 0 && run.steps[0].status === 'pending') {
            await apiService.updateRunStep(run.steps[0].id, { status: 'active' });
        }

        draggedId.current = null;
        setDragOverStatus(null);
        onUpdate();
    };

    // Group runs by status (exclude cancelled from main columns)
    const grouped: Record<string, ExtractionRun[]> = { planned: [], active: [], completed: [] };
    for (const run of runs) {
        if (run.status in grouped) {
            grouped[run.status].push(run);
        }
    }

    return (
        <div className="kanban-board">
            {COLUMNS.map(col => (
                <KanbanColumn
                    key={col.status}
                    {...col}
                    runs={grouped[col.status] || []}
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

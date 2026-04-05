import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Play, CheckCircle2, XCircle, Clock, Snowflake, Leaf, ChevronRight, LayoutGrid, List, GanttChart, CalendarDays } from 'lucide-react';
import type { ExtractionRun, ExtractionEquipment, ProcessTemplate } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { CenteredSpinner } from '../Spinner';
import { RunDetail } from './RunDetail';
import { RunKanban } from './RunKanban';
import { StartRunModal } from './StartRunModal';
import ResourceTimeline from '../ui/ResourceTimeline';
import ResourceCalendar from '../ui/ResourceCalendar';
import { buildExtractionSchedule } from './extractionScheduleAdapter';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
    planned: { label: 'Planned', color: '#959595', icon: Clock },
    active: { label: 'Active', color: '#1C9EFF', icon: Play },
    completed: { label: 'Completed', color: '#3BB570', icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', color: '#DF5B59', icon: XCircle },
};

const MATERIAL_LABELS: Record<string, string> = {
    fresh_frozen: 'Fresh Frozen',
    dry_trim: 'Dry Trim',
    bubble_hash: 'Bubble Hash',
    rosin: 'Rosin',
    kief: 'Kief',
    flower: 'Flower',
};

const MATERIAL_ICONS: Record<string, typeof Snowflake> = {
    fresh_frozen: Snowflake,
    dry_trim: Leaf,
};

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;

type ViewMode = 'list' | 'kanban' | 'schedule' | 'calendar';

// ── Run Card ─────────────────────────────────────────────────────────────────

const RunCard: React.FC<{
    run: ExtractionRun;
    expanded: boolean;
    onToggle: () => void;
    onUpdate: () => void;
}> = ({ run, expanded, onToggle, onUpdate }) => {
    const statusCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.planned;
    const StatusIcon = statusCfg.icon;
    const completedSteps = run.steps.filter(s => s.status === 'completed').length;
    const totalSteps = run.steps.filter(s => !s.isOptional).length;
    const MaterialIcon = run.inputMaterial ? MATERIAL_ICONS[run.inputMaterial] : null;

    // Overall yield: product of step yields
    const overallYield = run.steps
        .filter(s => s.status === 'completed' && s.yieldPct != null)
        .reduce((pct, s) => pct * (s.yieldPct! / 100), 1);
    const hasYield = run.steps.some(s => s.yieldPct != null);

    return (
        <div className={`run-card ${expanded ? 'run-card--expanded' : ''}`}>
            <button className="run-card-header" onClick={onToggle}>
                <div className="run-card-left">
                    <div className="run-card-status" style={{ background: `${statusCfg.color}15`, color: statusCfg.color }}>
                        <StatusIcon size={14} />
                    </div>
                    <div className="run-card-info">
                        <h3 className="run-card-name">{run.name}</h3>
                        <div className="run-card-meta">
                            {run.strain && <span className="run-card-strain">{run.strain}</span>}
                            {run.inputMaterial && (
                                <span className="run-card-material">
                                    {MaterialIcon && <MaterialIcon size={11} />}
                                    {MATERIAL_LABELS[run.inputMaterial] || run.inputMaterial}
                                </span>
                            )}
                            {run.templateName && (
                                <span className="run-card-template">{run.templateName}</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="run-card-right">
                    <div className="run-card-progress">
                        <div className="run-card-progress-bar">
                            <div
                                className="run-card-progress-fill"
                                style={{
                                    width: totalSteps > 0 ? `${(completedSteps / totalSteps) * 100}%` : '0%',
                                    background: statusCfg.color,
                                }}
                            />
                        </div>
                        <span className="run-card-progress-label">{completedSteps}/{totalSteps}</span>
                    </div>
                    {hasYield && (
                        <span className="run-card-yield" style={{ color: statusCfg.color }}>
                            {(overallYield * 100).toFixed(1)}%
                        </span>
                    )}
                    {formatDate(run.startedAt || run.createdAt) && (
                        <span className="run-card-date">{formatDate(run.startedAt || run.createdAt)}</span>
                    )}
                    <ChevronRight
                        size={16}
                        style={{
                            color: '#C0C0C0',
                            transition: 'transform 0.2s',
                            transform: expanded ? 'rotate(90deg)' : 'none',
                        }}
                    />
                </div>
            </button>

            {expanded && (
                <div className="run-card-body">
                    <RunDetail run={run} onUpdate={onUpdate} />
                </div>
            )}
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────

export const RunList: React.FC = () => {
    const [runs, setRuns] = useState<ExtractionRun[]>([]);
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showStartModal, setShowStartModal] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        return (sessionStorage.getItem('extraction-runs-view') as ViewMode) || 'kanban';
    });
    const [equipment, setEquipment] = useState<ExtractionEquipment[]>([]);
    const [equipmentLoaded, setEquipmentLoaded] = useState(false);

    const loadRuns = useCallback(async () => {
        const data = await apiService.getExtractionRuns();
        setRuns(data);
    }, []);

    const loadTemplates = useCallback(async () => {
        const data = await apiService.getProcessTemplates('extraction');
        setTemplates(data);
    }, []);

    useEffect(() => {
        Promise.all([loadRuns(), loadTemplates()]).finally(() => setLoading(false));
    }, [loadRuns, loadTemplates]);

    // Lazy-load equipment for schedule view
    useEffect(() => {
        if (viewMode !== 'schedule' || equipmentLoaded) return;
        apiService.getExtractionEquipment().then(data => {
            setEquipment(data.filter((e: ExtractionEquipment) => e.status !== 'retired'));
            setEquipmentLoaded(true);
        });
    }, [viewMode, equipmentLoaded]);

    const scheduleDataRaw = useMemo(
        () => buildExtractionSchedule(runs, equipment),
        [runs, equipment],
    );

    // Apply status filter to schedule
    const scheduleData = useMemo(() => {
        if (statusFilter === 'all') return scheduleDataRaw;
        let { resources, blocks } = scheduleDataRaw;
        blocks = blocks.filter(b => b.status === statusFilter);
        const usedIds = new Set(blocks.map(b => b.resourceId));
        resources = resources.filter(r => usedIds.has(r.id));
        return { resources, blocks };
    }, [scheduleDataRaw, statusFilter]);

    const handleRunCreated = async () => {
        setShowStartModal(false);
        await loadRuns();
    };

    const handleViewChange = (mode: ViewMode) => {
        setViewMode(mode);
        sessionStorage.setItem('extraction-runs-view', mode);
    };

    const handleKanbanCardClick = (id: string) => {
        // Switch to list view with that run expanded
        setExpandedId(id);
        handleViewChange('list');
    };

    const filteredRuns = statusFilter === 'all'
        ? runs
        : runs.filter(r => r.status === statusFilter);

    // Group: active first, then planned, then completed/cancelled
    const sortedRuns = [...filteredRuns].sort((a, b) => {
        const order: Record<string, number> = { active: 0, planned: 1, completed: 2, cancelled: 3 };
        const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    if (loading) {
        return <CenteredSpinner label="Loading runs..." height="py-16" />;
    }

    return (
        <div className="run-list">
            {/* Controls */}
            <div className="run-list-controls">
                <div className="run-list-left">
                    {(viewMode === 'list' || viewMode === 'schedule' || viewMode === 'calendar') && (
                        <div className="run-list-filters">
                            {['all', 'active', 'planned', 'completed'].map(s => (
                                <button
                                    key={s}
                                    className={`run-filter-pill ${statusFilter === s ? 'run-filter-pill--active' : ''}`}
                                    onClick={() => setStatusFilter(s)}
                                >
                                    {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s}
                                    {s !== 'all' && (
                                        <span className="run-filter-count">
                                            {runs.filter(r => r.status === s).length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="run-list-right">
                    <div className="view-toggle">
                        <button
                            className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                            onClick={() => handleViewChange('kanban')}
                            title="Board view"
                        >
                            <LayoutGrid size={15} />
                        </button>
                        <button
                            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => handleViewChange('list')}
                            title="List view"
                        >
                            <List size={15} />
                        </button>
                        <button
                            className={`view-toggle-btn ${viewMode === 'schedule' ? 'active' : ''}`}
                            onClick={() => handleViewChange('schedule')}
                            title="Timeline view"
                        >
                            <GanttChart size={15} />
                        </button>
                        <button
                            className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                            onClick={() => handleViewChange('calendar')}
                            title="Calendar view"
                        >
                            <CalendarDays size={15} />
                        </button>
                    </div>
                    <button
                        className="btn-new-batch text-sm px-3 py-1.5"
                        onClick={() => setShowStartModal(true)}
                    >
                        <Plus size={14} /> New Run
                    </button>
                </div>
            </div>

            {/* Kanban View */}
            {viewMode === 'kanban' && (
                <RunKanban
                    runs={runs.filter(r => r.status !== 'cancelled')}
                    onUpdate={loadRuns}
                    onCardClick={handleKanbanCardClick}
                />
            )}

            {/* List View */}
            {viewMode === 'list' && (
                <>
                    {sortedRuns.length === 0 ? (
                        <div className="run-list-empty">
                            <p>
                                {statusFilter === 'all'
                                    ? 'Track wash, press, and cart fill runs here. Create a process template first, then start a run from it.'
                                    : `No ${statusFilter} runs right now.`
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="run-list-cards">
                            {sortedRuns.map(run => (
                                <RunCard
                                    key={run.id}
                                    run={run}
                                    expanded={expandedId === run.id}
                                    onToggle={() => setExpandedId(prev => prev === run.id ? null : run.id)}
                                    onUpdate={loadRuns}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Schedule View */}
            {viewMode === 'schedule' && (
                <ResourceTimeline
                    resources={scheduleData.resources}
                    blocks={scheduleData.blocks}
                    onBlockClick={(block) => {
                        if (block.linkTo?.id) {
                            setExpandedId(block.linkTo.id);
                            handleViewChange('list');
                        }
                    }}
                />
            )}

            {/* Calendar View */}
            {viewMode === 'calendar' && (
                <ResourceCalendar
                    resources={scheduleData.resources}
                    blocks={scheduleData.blocks}
                    onBlockClick={(block) => {
                        if (block.linkTo?.id) {
                            setExpandedId(block.linkTo.id);
                            handleViewChange('list');
                        }
                    }}
                />
            )}

            {/* Start Run Modal */}
            {showStartModal && (
                <StartRunModal
                    templates={templates}
                    onClose={() => setShowStartModal(false)}
                    onCreated={handleRunCreated}
                />
            )}
        </div>
    );
};

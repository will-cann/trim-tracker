import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Flame, Grid3x3, MousePointerClick, X } from 'lucide-react';
import type { MapPlant, RoomLayout, HotspotSummary, CohortSortKey, Placement, CellScore } from '../../types/plantMap';
import { scoreHotspots, proposeLayout, cellKey, CONTAMINANT_MAP, SPREADING_CONTAMINANTS, floweringWeek, contaminantLabel, riskLevel } from '../../types/plantMap';
import { apiService } from '../../services/apiService';
import { RoomGrid } from './RoomGrid';
import type { OverlayMode } from './RoomGrid';
import { LogHealthEventModal } from './LogHealthEventModal';
import { MovePlannerPanel } from './MovePlannerPanel';
import { CohortPanel, cohortValue } from './CohortPanel';
import { HealthEventLog } from './HealthEventLog';
import { categoryColor, RISK_LABEL, RISK_TEXT_COLOR } from './plantMapColors';
import { CenteredSpinner } from '../Spinner';
import { ErrorRetry } from '../ErrorRetry';

type RoomOption = { id: string; name: string; room_type: string; layout_rows?: number | null; layout_cols?: number | null };

interface RoomLayoutViewProps {
    rooms: RoomOption[];
    refreshKey?: number;
    /** Called after any mutation so the card/table views stay in sync. */
    onChanged: () => void;
}

type PanelTab = 'plan' | 'plant' | 'cohorts' | 'log';
type HeatWindow = 30 | 90 | 365 | 'all';

const HEAT_WINDOWS: Array<{ value: HeatWindow; label: string }> = [
    { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1y' }, { value: 'all', label: 'All' },
];

const OVERLAYS: Array<{ value: OverlayMode; label: string }> = [
    { value: 'hotspots', label: 'Hot spots' },
    { value: 'health', label: 'Health' },
    { value: 'feed', label: 'Feed' },
    { value: 'flower', label: 'Flower length' },
    { value: 'stretch', label: 'Stretch' },
];

const ROOM_TYPE_ORDER: Record<string, number> = { flower: 0, veg: 1, nursery: 2 };

export const RoomLayoutView: React.FC<RoomLayoutViewProps> = ({ rooms, refreshKey, onChanged }) => {
    const mappable = useMemo(() => rooms
        .filter(r => ['flower', 'veg', 'vegetative', 'nursery', 'general', ''].includes(r.room_type || ''))
        .sort((a, b) => (ROOM_TYPE_ORDER[a.room_type] ?? 9) - (ROOM_TYPE_ORDER[b.room_type] ?? 9) || a.name.localeCompare(b.name)),
    [rooms]);

    const [roomId, setRoomId] = useState<string | null>(() => sessionStorage.getItem('plantMap.room'));
    const [layout, setLayout] = useState<RoomLayout | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hotspots, setHotspots] = useState<HotspotSummary | null>(null);

    const [overlay, setOverlay] = useState<OverlayMode>('hotspots');
    const [heatContaminant, setHeatContaminant] = useState<string>('botrytis');
    const [heatWindow, setHeatWindow] = useState<HeatWindow>('all');
    const [panelTab, setPanelTab] = useState<PanelTab>('plan');
    const [cohortOrder, setCohortOrder] = useState<CohortSortKey[]>(['feed', 'flower', 'stretch']);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [movingId, setMovingId] = useState<string | null>(null);
    const [preview, setPreview] = useState<{ placements: Placement[]; unplaced: string[]; label: string } | null>(null);
    const [showLog, setShowLog] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [gridDraft, setGridDraft] = useState<{ rows: string; cols: string }>({ rows: '4', cols: '8' });

    // Pick a sensible room on first load.
    useEffect(() => {
        if (mappable.length === 0) return;
        if (roomId && mappable.some(r => r.id === roomId)) return;
        const preferred = mappable.find(r => r.room_type === 'flower' && r.layout_rows && r.layout_cols)
            ?? mappable.find(r => r.layout_rows && r.layout_cols)
            ?? mappable[0];
        setRoomId(preferred.id);
    }, [mappable, roomId]);

    const load = useCallback(async () => {
        if (!roomId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await apiService.getRoomLayout(roomId);
            setLayout(data);
            setGridDraft({ rows: String(data.room.layoutRows ?? 4), cols: String(data.room.layoutCols ?? 8) });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load room');
        } finally {
            setLoading(false);
        }
    }, [roomId]);

    useEffect(() => { load(); }, [load, refreshKey]);
    useEffect(() => { if (roomId) sessionStorage.setItem('plantMap.room', roomId); }, [roomId]);

    useEffect(() => {
        let cancelled = false;
        apiService.getHotspots({ days: heatWindow === 'all' ? 'all' : heatWindow, contaminant: heatContaminant })
            .then(d => { if (!cancelled) setHotspots(d); })
            .catch(() => { if (!cancelled) setHotspots(null); });
        return () => { cancelled = true; };
    }, [heatWindow, heatContaminant, refreshKey, layout]);

    const refresh = useCallback(() => {
        load();
        onChanged();
    }, [load, onChanged]);

    // Heat surface for the overlay (client-side, so filters are instant).
    const heatCells: CellScore[] = useMemo(() => {
        if (!layout?.room.layoutRows || !layout.room.layoutCols) return [];
        return scoreHotspots(
            layout.events.map(e => ({ row: e.row, col: e.col, contaminant: e.contaminant, severity: e.severity, observedAt: e.observedAt, status: e.status })),
            {
                rows: layout.room.layoutRows,
                cols: layout.room.layoutCols,
                contaminants: heatContaminant === 'all' ? null : [heatContaminant],
                windowDays: heatWindow === 'all' ? null : heatWindow,
            },
        ).cells;
    }, [layout, heatContaminant, heatWindow]);

    const plants = layout?.plants ?? [];
    const placed = plants.filter(p => p.row != null && p.col != null);
    const unplaced = plants.filter(p => p.row == null || p.col == null);
    const hasLayout = !!(layout?.room.layoutRows && layout?.room.layoutCols);

    const colorBy: 'feed' | 'flower' | 'stretch' = overlay === 'flower' ? 'flower' : overlay === 'stretch' ? 'stretch' : 'feed';
    const cohortColorIndex = useMemo(() => {
        const values = [...new Set(plants.map(p => cohortValue(p, colorBy)))].sort();
        return new Map(values.map((v, i) => [v, i]));
    }, [plants, colorBy]);
    const cohortColor = useCallback((p: MapPlant) => {
        if (overlay !== 'feed' && overlay !== 'flower' && overlay !== 'stretch') return undefined;
        return categoryColor(cohortColorIndex.get(cohortValue(p, colorBy)) ?? 0);
    }, [overlay, cohortColorIndex, colorBy]);

    const selectedPlants = plants.filter(p => selected.has(p.id));
    const focusPlant = selectedPlants.length === 1 ? selectedPlants[0] : null;

    const handlePlantClick = (plant: MapPlant, e: React.MouseEvent) => {
        if (movingId) {
            // Clicking an occupied cell while moving = swap.
            if (plant.id !== movingId && plant.row != null && plant.col != null) {
                placeMoving(plant.row, plant.col, plant);
            }
            return;
        }
        setSelected(prev => {
            const next = e.metaKey || e.ctrlKey || e.shiftKey ? new Set(prev) : new Set<string>();
            if (prev.has(plant.id) && (e.metaKey || e.ctrlKey || e.shiftKey)) next.delete(plant.id);
            else next.add(plant.id);
            return next;
        });
        setPanelTab('plant');
    };

    const placeMoving = async (row: number, col: number, occupant: MapPlant | null) => {
        if (!movingId || !layout) return;
        const mover = plants.find(p => p.id === movingId);
        if (!mover) return;
        setBusy(true);
        setNotice(null);
        try {
            const placements: Placement[] = [{ plantId: movingId, row, col }];
            // Swap: the occupant takes the mover's old cell (if it had one).
            if (occupant && mover.row != null && mover.col != null) {
                placements.push({ plantId: occupant.id, row: mover.row, col: mover.col });
            }
            const res = await apiService.setPlantPositions({ roomId: layout.room.id, placements });
            if (res.bumped.length) setNotice(`${res.bumped.join(', ')} taken off the grid — place again.`);
            setMovingId(null);
            refresh();
        } catch (e) {
            setNotice(e instanceof Error ? e.message : 'Failed to place plant');
        } finally {
            setBusy(false);
        }
    };

    const handleCellClick = (row: number, col: number, occupant: MapPlant | null) => {
        if (movingId) {
            placeMoving(row, col, occupant);
            return;
        }
        if (!occupant) setSelected(new Set());
    };

    const startMove = (plantId: string) => {
        setMovingId(plantId);
        setPreview(null);
        setNotice('Click a cell to place it. Clicking an occupied cell swaps the two plants.');
    };

    const clearPosition = async (plantIds: string[]) => {
        setBusy(true);
        try {
            await apiService.setPlantPositions({ clearPlantIds: plantIds });
            setSelected(new Set());
            refresh();
        } catch (e) {
            setNotice(e instanceof Error ? e.message : 'Failed to clear position');
        } finally {
            setBusy(false);
        }
    };

    const buildPreview = (subject: MapPlant[], keepOthers: boolean, label: string) => {
        if (!layout?.room.layoutRows || !layout.room.layoutCols) return;
        const occupied = new Set<string>();
        if (keepOthers) {
            const subjectIds = new Set(subject.map(p => p.id));
            for (const p of placed) if (!subjectIds.has(p.id)) occupied.add(cellKey(p.row!, p.col!));
        }
        const result = proposeLayout(
            subject.map(p => ({ id: p.id, label: p.label, strainName: p.strainName, feedProfile: p.feedProfile, floweringDays: p.floweringDays, stretchTrait: p.stretchTrait })),
            { rows: layout.room.layoutRows, cols: layout.room.layoutCols, cells: layout.cells, occupied, order: cohortOrder },
        );
        // Keep untouched plants where they are so the preview shows the whole room.
        const placements = keepOthers
            ? [...result.placements, ...placed.filter(p => !subject.some(s => s.id === p.id)).map(p => ({ plantId: p.id, row: p.row!, col: p.col! }))]
            : result.placements;
        setMovingId(null);
        setSelected(new Set());
        setPreview({ placements, unplaced: result.unplaced, label });
        const moves = result.placements.filter(pl => {
            const p = plants.find(x => x.id === pl.plantId);
            return !p || p.row !== pl.row || p.col !== pl.col;
        }).length;
        setNotice(`${label}: ${moves} plant${moves === 1 ? '' : 's'} would move${result.unplaced.length ? `, ${result.unplaced.length} don't fit` : ''}${result.avoidedCells.length ? `, ${result.avoidedCells.length} hot cell${result.avoidedCells.length === 1 ? '' : 's'} left empty` : ''}.`);
    };

    const applyPreview = async () => {
        if (!preview || !layout) return;
        setBusy(true);
        try {
            const changed = preview.placements.filter(pl => {
                const p = plants.find(x => x.id === pl.plantId);
                return !p || p.row !== pl.row || p.col !== pl.col;
            });
            if (changed.length) {
                // Send the whole arrangement so swaps resolve in one transaction.
                await apiService.setPlantPositions({ roomId: layout.room.id, placements: preview.placements });
            }
            setPreview(null);
            setNotice(null);
            refresh();
        } catch (e) {
            setNotice(e instanceof Error ? e.message : 'Failed to apply arrangement');
        } finally {
            setBusy(false);
        }
    };

    const saveGrid = async () => {
        if (!layout) return;
        const rows = parseInt(gridDraft.rows, 10);
        const cols = parseInt(gridDraft.cols, 10);
        if (!rows || !cols || rows < 1 || cols < 1) { setNotice('Rows and columns must be at least 1.'); return; }
        setBusy(true);
        try {
            await apiService.updateRoom(layout.room.id, { layoutRows: rows, layoutCols: cols });
            setNotice(null);
            refresh();
        } catch (e) {
            setNotice(e instanceof Error ? e.message : 'Failed to save grid');
        } finally {
            setBusy(false);
        }
    };

    const targetCells = useMemo(() => (layout?.plan.suggestions ?? [])
        .filter(s => s.to && s.to.roomId === layout?.room.id)
        .map(s => ({ row: s.to!.row, col: s.to!.col })), [layout]);

    const roomSummary = hotspots?.rooms.find(r => r.roomId === roomId) ?? null;

    if (mappable.length === 0) {
        return (
            <div className="room-map-empty mt-6">
                <Grid3x3 size={18} className="text-gray-300" />
                <p>Add a flower or veg room in Settings → Rooms to start mapping plants.</p>
            </div>
        );
    }

    return (
        <div className="room-map">
            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <div className="room-map-toolbar">
                <select className="field-input room-map-room-select" value={roomId ?? ''} onChange={e => { setRoomId(e.target.value); setSelected(new Set()); setMovingId(null); setPreview(null); }}>
                    {mappable.map(r => {
                        const hs = hotspots?.rooms.find(h => h.roomId === r.id);
                        return (
                            <option key={r.id} value={r.id}>
                                {r.name}{hs?.activeEvents ? ` · ${hs.activeEvents} active` : ''}{!r.layout_rows ? ' · no grid' : ''}
                            </option>
                        );
                    })}
                </select>

                <div className="room-map-seg">
                    {OVERLAYS.map(o => (
                        <button key={o.value} className={`room-map-seg-btn ${overlay === o.value ? 'active' : ''}`} onClick={() => setOverlay(o.value)}>{o.label}</button>
                    ))}
                </div>

                {overlay === 'hotspots' && (
                    <>
                        <select className="field-input room-map-small-select" value={heatContaminant} onChange={e => setHeatContaminant(e.target.value)} title="Which issue to map">
                            <option value="botrytis">Bud rot (botrytis)</option>
                            <option value="all">All spreading issues</option>
                            {SPREADING_CONTAMINANTS.filter(k => k !== 'botrytis').map(k => (
                                <option key={k} value={k}>{CONTAMINANT_MAP[k].label}</option>
                            ))}
                        </select>
                        <div className="room-map-seg">
                            {HEAT_WINDOWS.map(w => (
                                <button key={String(w.value)} className={`room-map-seg-btn ${heatWindow === w.value ? 'active' : ''}`} onClick={() => setHeatWindow(w.value)}>{w.label}</button>
                            ))}
                        </div>
                    </>
                )}

                <div className="flex-1" />

                <button
                    className="btn-new-batch text-xs px-2.5 py-1.5"
                    onClick={() => setShowLog(true)}
                    disabled={selectedPlants.length === 0}
                    title={selectedPlants.length ? 'Log an issue on the selected plants' : 'Select plants on the grid first (shift-click for several)'}
                >
                    <AlertTriangle size={13} /> Log issue{selectedPlants.length ? ` (${selectedPlants.length})` : ''}
                </button>
            </div>

            {/* ── Facility strip ──────────────────────────────────────── */}
            {hotspots && hotspots.rooms.some(r => r.activeEvents > 0 || r.eventsInWindow > 0) && (
                <div className="room-map-strip">
                    <Flame size={12} className="text-orange-500 shrink-0" />
                    <span className="text-[11px] text-gray-500 shrink-0">
                        {hotspots.contaminant ? contaminantLabel(hotspots.contaminant) : 'Spreading issues'}{hotspots.windowDays ? `, ${hotspots.windowDays}d` : ''}:
                    </span>
                    {hotspots.rooms.filter(r => r.activeEvents > 0 || r.eventsInWindow > 0).map(r => (
                        <button key={r.roomId} className={`room-map-strip-chip ${r.roomId === roomId ? 'active' : ''}`} onClick={() => setRoomId(r.roomId)}>
                            {r.roomName}
                            {r.activeEvents > 0 && <span className="room-map-strip-active">{r.activeEvents} active</span>}
                            {r.hottestCells[0] && <span className="text-gray-400"> · hottest R{r.hottestCells[0].row + 1}·{r.hottestCells[0].col + 1}</span>}
                        </button>
                    ))}
                </div>
            )}

            {(notice || preview || movingId) && (
                <div className={`room-map-notice ${preview ? 'preview' : ''}`}>
                    <MousePointerClick size={13} />
                    <span className="flex-1">{notice}</span>
                    {preview && (
                        <>
                            <button className="btn-primary text-xs px-2 py-1" onClick={applyPreview} disabled={busy}>Apply arrangement</button>
                            <button className="btn-cancel text-xs px-2 py-1" onClick={() => { setPreview(null); setNotice(null); }}>Cancel</button>
                        </>
                    )}
                    {movingId && (
                        <button className="btn-cancel text-xs px-2 py-1" onClick={() => { setMovingId(null); setNotice(null); }}>Cancel move</button>
                    )}
                    {!preview && !movingId && (
                        <button className="room-map-icon-btn" onClick={() => setNotice(null)}><X size={12} /></button>
                    )}
                </div>
            )}

            {/* ── Body ────────────────────────────────────────────────── */}
            <div className="room-map-body">
                <div className="room-map-main">
                    {loading && !layout ? (
                        <CenteredSpinner label="Loading room…" height="py-16" />
                    ) : error ? (
                        <ErrorRetry message={error} onRetry={load} />
                    ) : layout && !hasLayout ? (
                        <div className="room-map-setup">
                            <Grid3x3 size={20} className="text-gray-300" />
                            <h3 className="text-sm font-semibold text-gray-800">Set up the grid for {layout.room.name}</h3>
                            <p className="text-xs text-gray-500 max-w-md">
                                Rows are benches or tables, columns are positions along the bench. Match how your team already refers to spots ("bench 3, fourth from the left").
                            </p>
                            <div className="flex items-center gap-2">
                                <input type="number" min={1} max={60} value={gridDraft.rows} onChange={e => setGridDraft(d => ({ ...d, rows: e.target.value }))} className="field-input w-20" placeholder="Rows" />
                                <span className="text-gray-400">×</span>
                                <input type="number" min={1} max={60} value={gridDraft.cols} onChange={e => setGridDraft(d => ({ ...d, cols: e.target.value }))} className="field-input w-20" placeholder="Columns" />
                                <button className="btn-primary text-xs px-3 py-1.5" onClick={saveGrid} disabled={busy}>Save grid</button>
                            </div>
                            {plants.length > 0 && <p className="text-[11px] text-gray-400">{plants.length} plant{plants.length === 1 ? '' : 's'} in this room will be ready to place.</p>}
                        </div>
                    ) : layout ? (
                        <>
                            <RoomGrid
                                rows={layout.room.layoutRows!}
                                cols={layout.room.layoutCols!}
                                plants={plants}
                                cells={heatCells}
                                overlay={overlay}
                                cohortColor={cohortColor}
                                selectedIds={selected}
                                movingId={movingId}
                                preview={preview?.placements ?? null}
                                avoidCells={layout.plan.avoidCells}
                                targetCells={targetCells}
                                onPlantClick={handlePlantClick}
                                onCellClick={handleCellClick}
                            />
                            <div className="room-map-legend">
                                {overlay === 'hotspots' && (
                                    <>
                                        <span className="room-map-legend-item"><i style={{ background: 'hsla(45,85%,52%,0.35)' }} /> Low</span>
                                        <span className="room-map-legend-item"><i style={{ background: 'hsla(20,85%,52%,0.55)' }} /> Hot spot</span>
                                        <span className="room-map-legend-item"><i style={{ background: 'hsla(0,85%,52%,0.8)' }} /> Severe</span>
                                        <span className="room-map-legend-item"><i className="legend-avoid">✕</i> Leave empty</span>
                                        <span className="room-map-legend-item"><i className="legend-target" /> Planner destination</span>
                                        <span className="text-gray-400 ml-auto">{layout.events.filter(e => e.status === 'active').length} active · {layout.events.length} logged here</span>
                                    </>
                                )}
                                {(overlay === 'feed' || overlay === 'flower' || overlay === 'stretch') && (
                                    <>
                                        {[...cohortColorIndex.entries()].map(([value, idx]) => (
                                            <span key={value} className="room-map-legend-item"><i style={{ background: categoryColor(idx) }} /> {value}</span>
                                        ))}
                                    </>
                                )}
                                {overlay === 'health' && (
                                    <>
                                        <span className="room-map-legend-item"><i style={{ background: '#3BB570' }} /> 100</span>
                                        <span className="room-map-legend-item"><i style={{ background: '#F0BF00' }} /> 68–99</span>
                                        <span className="room-map-legend-item"><i style={{ background: '#DF5B59' }} /> ≤67</span>
                                    </>
                                )}
                            </div>
                            {unplaced.length > 0 && (
                                <div className="room-map-unplaced">
                                    <span className="text-[11px] uppercase tracking-wider text-gray-400 shrink-0">Not on grid ({unplaced.length})</span>
                                    {unplaced.map(p => (
                                        <button
                                            key={p.id}
                                            className={`room-map-unplaced-chip ${movingId === p.id ? 'moving' : ''} ${selected.has(p.id) ? 'selected' : ''}`}
                                            onClick={() => (movingId === p.id ? setMovingId(null) : startMove(p.id))}
                                            title="Click, then click a cell"
                                        >
                                            {p.label} <span className="text-gray-400">{p.strainName}</span>
                                        </button>
                                    ))}
                                    <button className="room-map-link-btn" onClick={() => buildPreview(unplaced, true, 'Place unplaced')}>Auto-place by cohort</button>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>

                {/* ── Side panel ──────────────────────────────────────── */}
                {layout && hasLayout && (
                    <aside className="room-map-panel">
                        <div className="room-map-tabs">
                            {([
                                ['plan', `Plan${layout.plan.suggestions.length ? ` (${layout.plan.suggestions.length})` : ''}`],
                                ['plant', focusPlant ? focusPlant.label : `Plant${selectedPlants.length > 1 ? `s (${selectedPlants.length})` : ''}`],
                                ['cohorts', 'Sort'],
                                ['log', `Log${layout.events.filter(e => e.status === 'active').length ? ` (${layout.events.filter(e => e.status === 'active').length})` : ''}`],
                            ] as Array<[PanelTab, string]>).map(([key, label]) => (
                                <button key={key} className={`room-map-tab ${panelTab === key ? 'active' : ''}`} onClick={() => setPanelTab(key)}>{label}</button>
                            ))}
                        </div>

                        {panelTab === 'plan' && (
                            <MovePlannerPanel
                                roomName={layout.room.name}
                                plan={layout.plan}
                                hotspots={hotspots}
                                onApplied={refresh}
                                onFocusPlant={(id) => { setSelected(new Set([id])); setPanelTab('plant'); }}
                            />
                        )}

                        {panelTab === 'plant' && (
                            <PlantPanel
                                plants={selectedPlants}
                                heatCells={heatCells}
                                roomSummaryActive={roomSummary?.activeEvents ?? 0}
                                busy={busy}
                                onMove={startMove}
                                onClear={clearPosition}
                                onLog={() => setShowLog(true)}
                                onResolve={async (plantId) => {
                                    setBusy(true);
                                    try { await apiService.resolvePlantHealthEvents({ plantIds: [plantId] }); refresh(); }
                                    finally { setBusy(false); }
                                }}
                            />
                        )}

                        {panelTab === 'cohorts' && (
                            <CohortPanel
                                plants={plants}
                                order={cohortOrder}
                                onOrderChange={setCohortOrder}
                                onProposeLayout={() => buildPreview(plants, false, 'Arrange by cohort')}
                                onPlaceUnplaced={() => buildPreview(unplaced, true, 'Place unplaced')}
                                unplacedCount={unplaced.length}
                                hasLayout={hasLayout}
                                cohortColorIndex={cohortColorIndex}
                                colorBy={colorBy}
                            />
                        )}

                        {panelTab === 'log' && (
                            <HealthEventLog
                                events={layout.events}
                                onChanged={refresh}
                                onFocusPlant={(id) => { setSelected(new Set([id])); setPanelTab('plant'); }}
                            />
                        )}
                    </aside>
                )}
            </div>

            {showLog && (
                <LogHealthEventModal
                    plants={(selectedPlants.length ? selectedPlants : []).map(p => ({ id: p.id, label: p.label, strainName: p.strainName }))}
                    defaultContaminant={heatContaminant === 'all' ? 'botrytis' : heatContaminant}
                    onClose={() => setShowLog(false)}
                    onLogged={() => { setShowLog(false); refresh(); }}
                />
            )}
        </div>
    );
};

// ── Selected plant(s) panel ───────────────────────────────────────────────

const PlantPanel: React.FC<{
    plants: MapPlant[];
    heatCells: CellScore[];
    roomSummaryActive: number;
    busy: boolean;
    onMove: (plantId: string) => void;
    onClear: (plantIds: string[]) => void;
    onLog: () => void;
    onResolve: (plantId: string) => void;
}> = ({ plants, heatCells, busy, onMove, onClear, onLog, onResolve }) => {
    if (plants.length === 0) {
        return (
            <div className="room-map-panel-body">
                <div className="room-map-empty">
                    <MousePointerClick size={16} className="text-gray-300" />
                    <p>Click a plant on the grid. Shift-click to select several, then log an issue on all of them at once.</p>
                </div>
            </div>
        );
    }
    if (plants.length > 1) {
        return (
            <div className="room-map-panel-body">
                <p className="text-xs text-gray-500 mb-3">{plants.length} plants selected.</p>
                <div className="flex flex-col gap-2">
                    <button className="btn-primary text-xs px-2 py-1.5 justify-center" onClick={onLog}>Log issue on all</button>
                    <button className="btn-secondary text-xs px-2 py-1.5 justify-center" onClick={() => onClear(plants.map(p => p.id))} disabled={busy}>Take off grid</button>
                </div>
                <ul className="mt-3 space-y-1">
                    {plants.map(p => <li key={p.id} className="text-xs text-gray-700">{p.label} <span className="text-gray-400">· {p.strainName}</span></li>)}
                </ul>
            </div>
        );
    }
    const p = plants[0];
    const week = floweringWeek(p.floweringDate, Date.now());
    const cell = p.row != null && p.col != null ? heatCells.find(c => c.row === p.row && c.col === p.col) : undefined;
    const level = riskLevel(cell?.score ?? 0);
    return (
        <div className="room-map-panel-body">
            <h3 className="text-sm font-semibold text-gray-900">{p.label}</h3>
            <p className="text-xs text-gray-500 mb-3">{p.strainName}{p.tag ? ` · ${p.tag}` : ''}</p>

            <dl className="room-map-dl">
                <dt>Cell</dt><dd>{p.row != null && p.col != null ? `R${p.row + 1} · ${p.col + 1}` : 'Not placed'}</dd>
                <dt>Cell risk</dt><dd style={{ color: RISK_TEXT_COLOR[level] }}>{RISK_LABEL[level]}{cell?.events ? ` · ${cell.events} logged here` : ''}</dd>
                <dt>Phase</dt><dd>{p.growthPhase === 'flowering' ? `Flower${week ? `, week ${week}` : ''}` : 'Veg'}</dd>
                {p.targetHarvestDate && <><dt>Harvest</dt><dd>{p.targetHarvestDate}</dd></>}
                <dt>Health</dt><dd>{p.plantHealth}%</dd>
                <dt>Feed</dt><dd>{p.feedProfile ?? <span className="text-gray-400">not set</span>}</dd>
                <dt>Flower length</dt><dd>{p.floweringDays != null ? `${p.floweringDays} days` : <span className="text-gray-400">not set</span>}</dd>
                <dt>Stretch</dt><dd>{p.stretchTrait ?? <span className="text-gray-400">not set</span>}</dd>
            </dl>

            {p.activeIssues.length > 0 && (
                <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Active issues</p>
                    <ul className="space-y-1">
                        {p.activeIssues.map(i => (
                            <li key={i.contaminant} className="text-xs text-gray-800 flex items-center gap-2">
                                <span className="room-map-event-sev" style={{ background: i.severity >= 4 ? '#C53030' : '#E0604A' }}>{i.severity}</span>
                                {contaminantLabel(i.contaminant)}
                                <span className="text-gray-400">{i.observedAt.slice(0, 10)}</span>
                            </li>
                        ))}
                    </ul>
                    <button className="room-map-link-btn mt-1" onClick={() => onResolve(p.id)} disabled={busy}>Mark all resolved</button>
                </div>
            )}

            <div className="flex flex-col gap-2 mt-4">
                <button className="btn-primary text-xs px-2 py-1.5 justify-center" onClick={onLog}>Log issue</button>
                <button className="btn-secondary text-xs px-2 py-1.5 justify-center" onClick={() => onMove(p.id)} disabled={busy}>Move to another cell</button>
                {p.row != null && (
                    <button className="btn-cancel text-xs px-2 py-1.5 justify-center" onClick={() => onClear([p.id])} disabled={busy}>Take off grid</button>
                )}
            </div>
        </div>
    );
};

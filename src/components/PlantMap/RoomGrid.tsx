import React from 'react';
import type { MapPlant, CellScore, Placement } from '../../types/plantMap';
import { cellKey, riskLevel, contaminantAbbrev, getHealthColor, HEALTH_COLOR_MAP } from '../../types/plantMap';
import { heatColor, RISK_LABEL } from './plantMapColors';

export type OverlayMode = 'hotspots' | 'health' | 'feed' | 'flower' | 'stretch';

export interface RoomGridProps {
    rows: number;
    cols: number;
    plants: MapPlant[];
    /** Heat surface for the current contaminant/window filter. */
    cells: CellScore[];
    overlay: OverlayMode;
    /** Cohort colour per plant id (feed / flower / stretch overlays). */
    cohortColor?: (plant: MapPlant) => string | undefined;
    selectedIds: ReadonlySet<string>;
    /** Plant waiting for a destination cell. */
    movingId: string | null;
    /** Proposed layout to preview as ghosts. */
    preview?: Placement[] | null;
    /** Cells the planner says to keep empty. */
    avoidCells?: ReadonlyArray<{ row: number; col: number }>;
    /** Destination cells of pending planner suggestions. */
    targetCells?: ReadonlyArray<{ row: number; col: number }>;
    onPlantClick: (plant: MapPlant, e: React.MouseEvent) => void;
    onCellClick: (row: number, col: number, occupant: MapPlant | null) => void;
}

export const RoomGrid: React.FC<RoomGridProps> = ({
    rows, cols, plants, cells, overlay, cohortColor, selectedIds, movingId, preview, avoidCells, targetCells,
    onPlantClick, onCellClick,
}) => {
    const byCell = new Map<string, MapPlant>();
    for (const p of plants) {
        if (p.row != null && p.col != null) byCell.set(cellKey(p.row, p.col), p);
    }
    const heat = new Map<string, CellScore>();
    for (const c of cells) heat.set(cellKey(c.row, c.col), c);
    const previewByCell = new Map<string, MapPlant>();
    const previewMoved = new Set<string>();
    if (preview) {
        const byId = new Map(plants.map(p => [p.id, p]));
        for (const pl of preview) {
            const plant = byId.get(pl.plantId);
            if (!plant) continue;
            previewByCell.set(cellKey(pl.row, pl.col), plant);
            if (plant.row !== pl.row || plant.col !== pl.col) previewMoved.add(plant.id);
        }
    }
    const avoid = new Set((avoidCells ?? []).map(c => cellKey(c.row, c.col)));
    const targets = new Set((targetCells ?? []).map(c => cellKey(c.row, c.col)));

    const colLabels = Array.from({ length: cols }, (_, i) => i + 1);

    return (
        <div className="room-map-scroll">
            <div
                className="room-map-grid"
                style={{ gridTemplateColumns: `34px repeat(${cols}, minmax(64px, 1fr))` }}
            >
                <div className="room-map-corner" />
                {colLabels.map(c => (
                    <div key={`c${c}`} className="room-map-col-label">{c}</div>
                ))}
                {Array.from({ length: rows }, (_, r) => (
                    <React.Fragment key={`r${r}`}>
                        <div className="room-map-row-label">R{r + 1}</div>
                        {colLabels.map((_, c) => {
                            const key = cellKey(r, c);
                            const occupant = preview ? (previewByCell.get(key) ?? null) : (byCell.get(key) ?? null);
                            const score = heat.get(key)?.score ?? 0;
                            const level = riskLevel(score);
                            const bg = overlay === 'hotspots' ? heatColor(score) : undefined;
                            const isMoveTarget = movingId != null;
                            const classes = ['room-map-cell'];
                            if (occupant) classes.push('occupied');
                            if (isMoveTarget) classes.push('move-target');
                            if (avoid.has(key) && !occupant) classes.push('avoid');
                            if (targets.has(key) && !occupant) classes.push('target');
                            if (preview && occupant && previewMoved.has(occupant.id)) classes.push('preview-moved');
                            const heatInfo = heat.get(key);
                            const title = heatInfo && heatInfo.events > 0
                                ? `${RISK_LABEL[level]} · ${heatInfo.events} event${heatInfo.events === 1 ? '' : 's'} here` + (heatInfo.lastObservedAt ? ` · last ${heatInfo.lastObservedAt.slice(0, 10)}` : '')
                                : level !== 'none' ? `${RISK_LABEL[level]} (spread from a neighbour)` : `R${r + 1} · ${c + 1}`;
                            return (
                                <div
                                    key={key}
                                    className={classes.join(' ')}
                                    style={{ background: bg }}
                                    title={title}
                                    onClick={() => onCellClick(r, c, occupant)}
                                >
                                    {occupant ? (
                                        <PlantChip
                                            plant={occupant}
                                            overlay={overlay}
                                            color={cohortColor?.(occupant)}
                                            selected={selectedIds.has(occupant.id)}
                                            moving={movingId === occupant.id}
                                            ghost={!!preview}
                                            onClick={(e) => { e.stopPropagation(); if (!preview) onPlantClick(occupant, e); }}
                                        />
                                    ) : (
                                        avoid.has(key) ? <span className="room-map-avoid-mark" title="Planner: leave empty at next flip">✕</span> : null
                                    )}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

const PlantChip: React.FC<{
    plant: MapPlant;
    overlay: OverlayMode;
    color?: string;
    selected: boolean;
    moving: boolean;
    ghost: boolean;
    onClick: (e: React.MouseEvent) => void;
}> = ({ plant, overlay, color, selected, moving, ghost, onClick }) => {
    const healthHex = HEALTH_COLOR_MAP[getHealthColor(plant.plantHealth)];
    const active = plant.activeIssues;
    const worst = active.reduce((m, i) => Math.max(m, i.severity), 0);
    const accent = overlay === 'health' ? healthHex : (color ?? (active.length ? '#DF5B59' : undefined));
    const classes = ['room-map-plant'];
    if (selected) classes.push('selected');
    if (moving) classes.push('moving');
    if (ghost) classes.push('ghost');
    if (active.length) classes.push('has-issue');
    return (
        <button
            type="button"
            className={classes.join(' ')}
            style={accent ? { borderLeftColor: accent } : undefined}
            onClick={onClick}
            title={`${plant.label} · ${plant.strainName}${active.length ? ` · ${active.map(i => `${contaminantAbbrev(i.contaminant)} ${i.severity}/5`).join(', ')}` : ''}`}
        >
            <span className="room-map-plant-label">{plant.label}</span>
            <span className="room-map-plant-strain">{plant.strainName}</span>
            {active.length > 0 && (
                <span className="room-map-plant-issue" style={{ background: worst >= 4 ? '#C53030' : '#E0604A' }}>
                    {[...new Set(active.map(i => contaminantAbbrev(i.contaminant)))].join(' ')}
                </span>
            )}
        </button>
    );
};

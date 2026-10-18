import React, { useMemo, useState } from 'react';
import { ArrowRight, Calendar, ChevronRight } from 'lucide-react';
import type { RoomTable, RoomLayoutMeta, PlantHealthEvent } from '../../types/plantMap';
import { cellKey, rotScoreLabel } from '../../types/plantMap';

/**
 * Glance-level map for a room tracked at table granularity (trays of one
 * strain scored for bud rot on the operator's 0.5 / 1 / 2 / 3 scale).
 *
 * Mirrors the operator's own sheet: a blank table is fine, a number is a
 * problem. Unscored tiles stay white; scored tiles take a single-hue tint
 * that deepens with the score. Each tile is one line (strain code · count),
 * sections and axis labels appear once, and the whole room fits without a
 * horizontal scroll. Detail lives in the hover card and the side panel.
 */

export interface TableRoomMapProps {
    room: { name: string; layoutRows: number; layoutCols: number; layoutMeta: RoomLayoutMeta | null };
    tables: RoomTable[];
    /** Cell-level bud-rot events for this room (sheet imports and in-app scores). */
    events: PlantHealthEvent[];
    /** Reference time; defaults to now. */
    now?: number;
    /** Scores older than this read as stale (a flower cycle is ~8–9 weeks). */
    staleAfterDays?: number;
    onScoreTable?: (table: RoomTable) => void;
    onResolve?: (eventIds: string[]) => void;
    onImportSheet?: () => void;
}

type Mode = 'score' | 'change';

interface CellState {
    table: RoomTable;
    /** Latest active score on the cell, if any. */
    current: PlantHealthEvent | null;
    /** Score on the previous import, if any. */
    previous: PlantHealthEvent | null;
    history: PlantHealthEvent[];
}

const SCORE_STEPS = [3, 2, 1, 0.5] as const;
const SCORE_TINT: Record<number, { bg: string; fg: string }> = {
    0.5: { bg: '#FBE9E8', fg: '#1A1A1A' },
    1:   { bg: '#F5C3C1', fg: '#1A1A1A' },
    1.5: { bg: '#F0A9A7', fg: '#1A1A1A' },
    2:   { bg: '#EA8E8C', fg: '#1A1A1A' },
    3:   { bg: '#C8403E', fg: '#FFFFFF' },
};
const tint = (score: number | null | undefined) => (score == null ? null : SCORE_TINT[score] ?? SCORE_TINT[score >= 3 ? 3 : score >= 2 ? 2 : score >= 1 ? 1 : 0.5]);

const dayOf = (iso: string) => iso.slice(0, 10);
const fmtDate = (iso: string) => new Date(`${dayOf(iso)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const ageDays = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(`${dayOf(iso)}T12:00:00`).getTime()) / 86_400_000));
const ageText = (iso: string, now: number) => { const d = ageDays(iso, now); return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`; };
const strainCode = (t: RoomTable) => t.strains.map(s => s.strain).join('/');
const strainDetail = (t: RoomTable) => t.strains.map(s => (s.count != null && t.strains.length > 1 ? `${s.strain} ×${s.count}` : s.strain)).join(' / ');
const cellLabel = (t: RoomTable) => `R${t.row + 1}·${t.col + 1}`;

export const TableRoomMap: React.FC<TableRoomMapProps> = ({ room, tables, events, now: nowProp, staleAfterDays = 56, onScoreTable, onResolve, onImportSheet }) => {
    const [mountedAt] = useState(() => Date.now());
    const now = nowProp ?? mountedAt;
    const [mode, setMode] = useState<Mode>('score');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [hover, setHover] = useState<{ key: string; x: number; y: number; below: boolean } | null>(null);

    // Imports: one per observation day, newest first. The current scores are the
    // active events; "previous" is the most recent import day before the current one.
    const { cells, currentDay, previousDay, importDays } = useMemo(() => {
        const cellEvents = events.filter(e => e.row != null && e.col != null && e.contaminant === 'botrytis');
        const days = [...new Set(cellEvents.map(e => dayOf(e.observedAt)))].sort().reverse();
        const active = cellEvents.filter(e => e.status === 'active');
        const currentDay = active.length ? active.map(e => dayOf(e.observedAt)).sort().reverse()[0] : null;
        const previousDay = days.find(d => currentDay == null || d < currentDay) ?? null;
        const byCell = new Map<string, CellState>();
        for (const t of tables) byCell.set(cellKey(t.row, t.col), { table: t, current: null, previous: null, history: [] });
        const sortedDesc = [...cellEvents].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
        for (const e of sortedDesc) {
            const st = byCell.get(cellKey(e.row!, e.col!));
            if (!st) continue;
            st.history.push(e);
            if (e.status === 'active' && !st.current) st.current = e;
            if (previousDay && dayOf(e.observedAt) === previousDay && !st.previous) st.previous = e;
        }
        return { cells: byCell, currentDay, previousDay, importDays: days };
    }, [tables, events]);

    const scored = [...cells.values()].filter(c => c.current);
    const distribution = SCORE_STEPS.map(s => ({ score: s, n: scored.filter(c => (c.current!.rotScore ?? 0) === s).length }));
    const unscored = tables.length - scored.length;
    const lastScoredAt = currentDay ? `${currentDay}T12:00:00` : null;
    const stale = lastScoredAt ? ageDays(lastScoredAt, now) > staleAfterDays : false;
    const sections = room.layoutMeta?.sections?.length ? room.layoutMeta.sections : [{ name: '', rowStart: 0, rowCount: room.layoutRows }];
    const selected = selectedKey ? cells.get(selectedKey) ?? null : null;

    // Change summary for the "since previous import" mode
    const changes = useMemo(() => {
        let worse = 0, better = 0, added = 0, cleared = 0;
        for (const c of cells.values()) {
            const cur = c.current?.rotScore ?? null; const prev = c.previous?.rotScore ?? null;
            if (cur != null && prev == null) added++;
            else if (cur == null && prev != null) cleared++;
            else if (cur != null && prev != null) { if (cur > prev) worse++; else if (cur < prev) better++; }
        }
        return { worse, better, added, cleared };
    }, [cells]);

    const deltaOf = (c: CellState) => {
        const cur = c.current?.rotScore ?? null; const prev = c.previous?.rotScore ?? null;
        if (cur == null && prev == null) return null;
        if (cur != null && prev == null) return { kind: 'new' as const, delta: cur };
        if (cur == null && prev != null) return { kind: 'cleared' as const, delta: -prev };
        const d = cur! - prev!;
        return { kind: d > 0 ? 'worse' as const : d < 0 ? 'better' as const : 'same' as const, delta: d };
    };

    const tileStyle = (c: CellState): React.CSSProperties => {
        if (mode === 'change') {
            const d = deltaOf(c);
            if (!d || d.kind === 'same') return {};
            if (d.kind === 'worse' || d.kind === 'new') return { background: SCORE_TINT[Math.abs(d.delta) >= 1.5 ? 2 : 1].bg, boxShadow: d.kind === 'worse' ? 'inset 0 0 0 2px #C8403E' : undefined };
            return { background: '#E3F4EA' };
        }
        const t = tint(c.current?.rotScore);
        if (!t) return {};
        return { background: t.bg, color: t.fg, ...(stale ? { opacity: 0.55 } : {}) };
    };

    const showHover = (key: string, el: HTMLElement) => {
        const grid = el.closest('.trm-grid-wrap') as HTMLElement | null;
        if (!grid) return;
        const r = el.getBoundingClientRect(); const g = grid.getBoundingClientRect();
        const below = r.top - g.top < 160;
        setHover({ key, x: r.left - g.left + r.width / 2, y: below ? r.bottom - g.top + 8 : r.top - g.top - 8, below });
    };
    const hovered = hover ? cells.get(hover.key) ?? null : null;

    return (
        <div className={`trm${stale ? ' trm--stale' : ''}`}>
            {/* ── Header: what you're looking at and how fresh it is ── */}
            <div className="trm-head">
                <div className="trm-head-main">
                    <h2 className="trm-title">{room.name}</h2>
                    <span className="trm-sub">
                        {tables.length} tables · {tables.reduce((s, t) => s + t.plantCount, 0).toLocaleString()} plants
                        {lastScoredAt && <> · scored <strong>{fmtDate(lastScoredAt)}</strong> <span className={stale ? 'trm-age trm-age--stale' : 'trm-age'}>{ageText(lastScoredAt, now)}</span></>}
                    </span>
                </div>
                <div className="trm-head-actions">
                    <div className="trm-seg" role="tablist" aria-label="Map mode">
                        <button role="tab" aria-selected={mode === 'score'} className={`trm-seg-btn${mode === 'score' ? ' active' : ''}`} onClick={() => setMode('score')}>Scores</button>
                        <button role="tab" aria-selected={mode === 'change'} className={`trm-seg-btn${mode === 'change' ? ' active' : ''}`} onClick={() => setMode('change')} disabled={!previousDay} title={previousDay ? `Change since ${fmtDate(previousDay)}` : 'Needs two imports'}>
                            Changes{previousDay ? ` since ${fmtDate(previousDay)}` : ''}
                        </button>
                    </div>
                    {onImportSheet && <button className="btn-secondary trm-btn" onClick={onImportSheet}>Import sheet</button>}
                </div>
            </div>

            {stale && lastScoredAt && (
                <div className="trm-banner">
                    <Calendar size={13} />
                    <span>These scores are {ageDays(lastScoredAt, now)} days old, longer than a flower cycle. They're shown faded until a new sheet is imported or the room is marked harvested.</span>
                </div>
            )}

            <div className="trm-body">
                {/* ── Grid ── */}
                <div className="trm-grid-wrap" onMouseLeave={() => setHover(null)}>
                    {(room.layoutMeta?.colStartLabel || room.layoutMeta?.colEndLabel) && (
                        <div className="trm-axis">
                            <span>{room.layoutMeta?.colStartLabel}</span><span className="trm-axis-line" /><span>{room.layoutMeta?.colEndLabel}</span>
                        </div>
                    )}
                    <div className="trm-grid" style={{ gridTemplateColumns: `34px repeat(${room.layoutCols}, minmax(0, 1fr))` }}>
                        <div />
                        {Array.from({ length: room.layoutCols }, (_, c) => <div key={`c${c}`} className="trm-col-label">{c + 1}</div>)}
                        {sections.map(sec => (
                            <React.Fragment key={sec.name || 'all'}>
                                {sec.name && <div className="trm-section" style={{ gridColumn: `1 / span ${room.layoutCols + 1}` }}>{sec.name}</div>}
                                {Array.from({ length: sec.rowCount }, (_, i) => {
                                    const r = sec.rowStart + i;
                                    return (
                                        <React.Fragment key={`r${r}`}>
                                            <div className="trm-row-label">R{r + 1}</div>
                                            {Array.from({ length: room.layoutCols }, (_, c) => {
                                                const key = cellKey(r, c);
                                                const st = cells.get(key);
                                                if (!st) return <div key={key} className="trm-empty" />;
                                                const score = st.current?.rotScore ?? null;
                                                const d = mode === 'change' ? deltaOf(st) : null;
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        data-cell={key}
                                                        className={`trm-tile${selectedKey === key ? ' selected' : ''}${score != null ? ' scored' : ''}`}
                                                        style={tileStyle(st)}
                                                        onClick={() => setSelectedKey(k => (k === key ? null : key))}
                                                        onMouseEnter={e => showHover(key, e.currentTarget)}
                                                        onFocus={e => showHover(key, e.currentTarget)}
                                                        onBlur={() => setHover(null)}
                                                        aria-label={`${strainDetail(st.table)}, ${st.table.plantCount} plants, ${cellLabel(st.table)}${score != null ? `, bud rot ${score}` : ''}`}
                                                    >
                                                        <span className="trm-code">{strainCode(st.table)}</span>
                                                        <span className="trm-count">{st.table.plantCount}</span>
                                                        {mode === 'score' && score != null && score >= 1 && <span className="trm-score">{score}</span>}
                                                        {mode === 'change' && d && d.kind !== 'same' && (
                                                            <span className={`trm-delta trm-delta--${d.kind}`}>
                                                                {d.kind === 'new' ? `+${d.delta}` : d.kind === 'cleared' ? '✓' : `${d.delta > 0 ? '+' : ''}${d.delta}`}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="trm-legend">
                        {mode === 'score' ? (
                            <>
                                <span className="trm-legend-item"><i style={{ background: '#fff', border: '1px solid #E0E0E0' }} /> Not scored</span>
                                {[0.5, 1, 2, 3].map(s => <span key={s} className="trm-legend-item"><i style={{ background: SCORE_TINT[s].bg }} /> {s} {rotScoreLabel(s)}</span>)}
                            </>
                        ) : (
                            <>
                                <span className="trm-legend-item"><i style={{ background: SCORE_TINT[1].bg, boxShadow: 'inset 0 0 0 2px #C8403E' }} /> Worse</span>
                                <span className="trm-legend-item"><i style={{ background: SCORE_TINT[1].bg }} /> New score</span>
                                <span className="trm-legend-item"><i style={{ background: '#E3F4EA' }} /> Better or cleared</span>
                                <span className="trm-legend-item"><i style={{ background: '#fff', border: '1px solid #E0E0E0' }} /> Unchanged</span>
                            </>
                        )}
                    </div>

                    {hovered && hover && (
                        <div className={`trm-card${hover.below ? ' trm-card--below' : ''}`} style={{ left: hover.x, top: hover.y }} role="tooltip">
                            <div className="trm-card-title">{strainDetail(hovered.table)}</div>
                            <div className="trm-card-sub">{hovered.table.plantCount} plants · {cellLabel(hovered.table)}{hovered.table.section ? ` · ${hovered.table.section}` : ''}</div>
                            <div className="trm-card-score">
                                {hovered.current ? (
                                    <>
                                        <ScorePill score={hovered.current.rotScore ?? 0} />
                                        <span>{rotScoreLabel(hovered.current.rotScore ?? 0)} · {fmtDate(hovered.current.observedAt)}, {ageText(hovered.current.observedAt, now)}</span>
                                    </>
                                ) : <span className="trm-muted">Not scored{currentDay ? ` on ${fmtDate(currentDay)}` : ''}</span>}
                            </div>
                            {previousDay && (
                                <div className="trm-card-prev">
                                    {fmtDate(previousDay)}: {hovered.previous ? `${hovered.previous.rotScore} ${rotScoreLabel(hovered.previous.rotScore ?? 0)}` : 'no score'}
                                    {hovered.current && hovered.previous && (hovered.current.rotScore === hovered.previous.rotScore ? ' · unchanged' : (hovered.current.rotScore ?? 0) > (hovered.previous.rotScore ?? 0) ? ' · worse' : ' · better')}
                                </div>
                            )}
                            <div className="trm-card-hint">Click to open</div>
                        </div>
                    )}
                </div>

                {/* ── Panel ── */}
                <aside className="trm-panel">
                    {selected ? (
                        <TableInspector state={selected} now={now} onBack={() => setSelectedKey(null)} onScore={onScoreTable} onResolve={onResolve} />
                    ) : (
                        <RoomSummary
                            tables={tables}
                            cells={cells}
                            distribution={distribution}
                            unscored={unscored}
                            sections={sections}
                            currentDay={currentDay}
                            previousDay={previousDay}
                            importDays={importDays}
                            changes={changes}
                            now={now}
                            onSelect={setSelectedKey}
                        />
                    )}
                </aside>
            </div>
        </div>
    );
};

const ScorePill: React.FC<{ score: number }> = ({ score }) => {
    const t = tint(score)!;
    return <span className="trm-pill" style={{ background: t.bg, color: t.fg }}>{score}</span>;
};

const RoomSummary: React.FC<{
    tables: RoomTable[];
    cells: Map<string, CellState>;
    distribution: Array<{ score: number; n: number }>;
    unscored: number;
    sections: Array<{ name: string; rowStart: number; rowCount: number }>;
    currentDay: string | null;
    previousDay: string | null;
    importDays: string[];
    changes: { worse: number; better: number; added: number; cleared: number };
    now: number;
    onSelect: (key: string) => void;
}> = ({ tables, cells, distribution, unscored, sections, currentDay, previousDay, importDays, changes, now, onSelect }) => {
    const max = Math.max(unscored, ...distribution.map(d => d.n), 1);
    const worst = [...cells.values()].filter(c => c.current).sort((a, b) => (b.current!.rotScore ?? 0) - (a.current!.rotScore ?? 0) || a.table.row - b.table.row || a.table.col - b.table.col).slice(0, 6);
    const perSection = sections.map(sec => {
        const inSec = [...cells.values()].filter(c => c.table.row >= sec.rowStart && c.table.row < sec.rowStart + sec.rowCount);
        const scored = inSec.filter(c => c.current);
        const worstScore = Math.max(0, ...scored.map(c => c.current!.rotScore ?? 0));
        return { name: sec.name || 'Room', tables: inSec.length, scored: scored.length, worstScore };
    });

    if (!currentDay) {
        return (
            <div className="trm-panel-body">
                <h3 className="trm-panel-title">No scores yet</h3>
                <p className="trm-muted">Import a health report or click a table to score it.</p>
            </div>
        );
    }

    return (
        <div className="trm-panel-body">
            <h3 className="trm-panel-title">Bud rot · {fmtDate(currentDay)}</h3>
            <p className="trm-muted" style={{ marginBottom: 10 }}>{tables.length - unscored} of {tables.length} tables scored · {ageText(`${currentDay}T12:00:00`, now)}</p>

            <ul className="trm-dist">
                {distribution.map(d => (
                    <li key={d.score} className="trm-dist-row">
                        <ScorePill score={d.score} />
                        <span className="trm-dist-label">{rotScoreLabel(d.score)}</span>
                        <span className="trm-dist-track"><span className="trm-dist-fill" style={{ width: `${(d.n / max) * 100}%`, background: SCORE_TINT[d.score].bg, border: d.n ? '1px solid rgba(0,0,0,0.08)' : 'none' }} /></span>
                        <span className="trm-dist-n">{d.n}</span>
                    </li>
                ))}
                <li className="trm-dist-row">
                    <span className="trm-pill trm-pill--none">–</span>
                    <span className="trm-dist-label">Not scored</span>
                    <span className="trm-dist-track"><span className="trm-dist-fill" style={{ width: `${(unscored / max) * 100}%`, background: '#F1F1F1' }} /></span>
                    <span className="trm-dist-n">{unscored}</span>
                </li>
            </ul>

            {previousDay && (
                <div className="trm-block">
                    <div className="trm-block-title">Since {fmtDate(previousDay)}</div>
                    <div className="trm-changes">
                        <span className={changes.worse ? 'trm-bad' : ''}>{changes.worse} worse</span>
                        <span className={changes.added ? 'trm-bad' : ''}>{changes.added} new</span>
                        <span className={changes.better ? 'trm-good' : ''}>{changes.better} better</span>
                        <span className={changes.cleared ? 'trm-good' : ''}>{changes.cleared} cleared</span>
                    </div>
                </div>
            )}

            {perSection.length > 1 && (
                <div className="trm-block">
                    <div className="trm-block-title">By section</div>
                    <ul className="trm-list">
                        {perSection.map(s => (
                            <li key={s.name} className="trm-list-row">
                                <span className="trm-list-main">{s.name}</span>
                                <span className="trm-muted">{s.scored}/{s.tables} scored</span>
                                {s.worstScore > 0 ? <ScorePill score={s.worstScore} /> : <span className="trm-pill trm-pill--none">–</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {worst.length > 0 && (
                <div className="trm-block">
                    <div className="trm-block-title">Worst tables</div>
                    <ul className="trm-list">
                        {worst.map(c => (
                            <li key={cellKey(c.table.row, c.table.col)}>
                                <button className="trm-list-row trm-list-btn" onClick={() => onSelect(cellKey(c.table.row, c.table.col))}>
                                    <ScorePill score={c.current!.rotScore ?? 0} />
                                    <span className="trm-list-main">{strainCode(c.table)} <span className="trm-muted">{cellLabel(c.table)}</span></span>
                                    <ChevronRight size={13} className="trm-muted" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {importDays.length > 0 && (
                <div className="trm-block">
                    <div className="trm-block-title">Imports</div>
                    <ul className="trm-list">
                        {importDays.slice(0, 4).map(d => (
                            <li key={d} className="trm-list-row">
                                <span className="trm-list-main">{fmtDate(`${d}T12:00:00`)}</span>
                                <span className="trm-muted">{[...cells.values()].filter(c => c.history.some(e => dayOf(e.observedAt) === d)).length} scored</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

const TableInspector: React.FC<{
    state: CellState;
    now: number;
    onBack: () => void;
    onScore?: (table: RoomTable) => void;
    onResolve?: (eventIds: string[]) => void;
}> = ({ state, now, onBack, onScore, onResolve }) => {
    const { table, current, history } = state;
    const earlier = history.filter(e => e !== current).slice(0, 6);
    return (
        <div className="trm-panel-body">
            <button className="trm-back" onClick={onBack}>← Room</button>
            <h3 className="trm-panel-title">{strainDetail(table)}</h3>
            <p className="trm-muted" style={{ marginBottom: 12 }}>{table.plantCount} plants · {cellLabel(table)}{table.section ? ` · ${table.section}` : ''}</p>

            <div className="trm-block">
                <div className="trm-block-title">Bud rot</div>
                {current ? (
                    <div className="trm-current">
                        <ScorePill score={current.rotScore ?? 0} />
                        <div>
                            <div className="trm-current-label">{rotScoreLabel(current.rotScore ?? 0)}</div>
                            <div className="trm-muted">{fmtDate(current.observedAt)} · {ageText(current.observedAt, now)} · {current.source === 'sheet' ? 'from sheet' : 'scored in app'}</div>
                        </div>
                    </div>
                ) : <p className="trm-muted">Not scored.</p>}
                {current && onResolve && <button className="trm-link" onClick={() => onResolve([current.id])}>Mark resolved</button>}
            </div>

            {earlier.length > 0 && (
                <div className="trm-block">
                    <div className="trm-block-title">Earlier</div>
                    <ul className="trm-list">
                        {earlier.map(e => (
                            <li key={e.id} className="trm-list-row">
                                <ScorePill score={e.rotScore ?? 0} />
                                <span className="trm-list-main">{rotScoreLabel(e.rotScore ?? 0)}</span>
                                <span className="trm-muted">{fmtDate(e.observedAt)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <button className="btn-primary trm-primary" onClick={() => onScore?.(table)}>Score this table <ArrowRight size={14} /></button>
        </div>
    );
};

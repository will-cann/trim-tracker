import React, { useState, useMemo, useCallback } from 'react';
import { ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import { ErrorRetry } from '../ErrorRetry';
import type { RoomMapData, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, contaminantAbbrev, contaminantLabel, abbreviateContaminants } from '../../types/plantMap';
import { DialogDrawer } from './DialogDrawer';
import { PlantActionModal } from './PlantActionModal';
import type { PlantActionType } from './PlantActionModal';
import { shortDate } from './shortDate';

interface StrainsListProps {
    data: RoomMapData | null;
    loading: boolean;
    error?: string | null;
    phase: PlantPhase;
    phaseLabel: string;
    roomName: string;
    onRevalidate: () => void;
}

type SortKey = 'strain' | 'totalPlants' | 'plantHealth' | 'contamination' | 'plantedDate' | 'harvestDate' | 'flipDate';
type SortDir = 'asc' | 'desc';

const ACTION_TYPE_MAP: Record<string, PlantActionType | null> = {
    'destroy': 'destroy',
    'change-phase': 'change-phase',
    'change-room': 'change-room',
    'plant-health': 'plant-health',
    'create-harvest': 'create-harvest',
    'split-plantings': null,   // Future sprint
    'create-packages': null,   // Future sprint
};

const daysSince = (iso: string | null): number | null => {
    if (!iso) return null;
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return days >= 0 ? days : null;
};

export const StrainsList: React.FC<StrainsListProps> = ({
    data,
    loading,
    error,
    phase,
    phaseLabel,
    roomName,
    onRevalidate,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortKey, setSortKey] = useState<SortKey>('strain');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [activeModal, setActiveModal] = useState<PlantActionType | null>(null);
    const [filter, setFilter] = useState('');

    const rows = useMemo(() => {
        if (!data) return [];
        return Object.entries(data)
            .map(([key, group]) => ({ id: key, ...group }))
            .filter(row => row.totalPlants > 0);
    }, [data]);

    const sortedRows = useMemo(() => {
        const sorted = [...rows].sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'strain':
                    cmp = a.strain.localeCompare(b.strain);
                    break;
                case 'totalPlants':
                    cmp = a.totalPlants - b.totalPlants;
                    break;
                case 'plantHealth':
                    cmp = a.plantHealth - b.plantHealth;
                    break;
                case 'contamination':
                    cmp = abbreviateContaminants(a.contamination).localeCompare(abbreviateContaminants(b.contamination));
                    break;
                case 'plantedDate':
                    cmp = (a.phaseDate || a.plantedDate).localeCompare(b.phaseDate || b.plantedDate);
                    break;
                case 'harvestDate':
                    cmp = (a.harvestDate || '').localeCompare(b.harvestDate || '');
                    break;
                case 'flipDate':
                    cmp = (a.flipDate || '').localeCompare(b.flipDate || '');
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [rows, sortKey, sortDir]);

    // Large rooms (a nursery can hold 100+ batches) get a name filter
    const query = filter.trim().toLowerCase();
    const visibleRows = useMemo(
        () => (query ? sortedRows.filter(r => r.strain.toLowerCase().includes(query)) : sortedRows),
        [sortedRows, query],
    );

    const totalSelected = selectedIds.size;
    const allSelected = visibleRows.length > 0 && visibleRows.every(r => selectedIds.has(r.id));

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const toggleRow = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) visibleRows.forEach(r => next.delete(r.id));
            else visibleRows.forEach(r => next.add(r.id));
            return next;
        });
    };

    const selectedGroups = useMemo(() => {
        return rows.filter(r => selectedIds.has(r.id));
    }, [rows, selectedIds]);

    const handleAction = useCallback((actionKey: string) => {
        const modalType = ACTION_TYPE_MAP[actionKey];
        if (!modalType) return;
        setActiveModal(modalType);
    }, []);

    const handleModalSuccess = useCallback(() => {
        setActiveModal(null);
        setSelectedIds(new Set());
        onRevalidate();
    }, [onRevalidate]);

    if (loading) {
        return <CenteredSpinner label="Loading strains…" height="py-10" />;
    }

    if (error) {
        return <ErrorRetry message={error} onRetry={onRevalidate} />;
    }

    if (rows.length === 0) {
        return (
            <div className="data-table-empty">
                No strain data for this room.
            </div>
        );
    }

    // Each phase gets one milestone date column instead of a generic "Date"
    const milestoneCol: { key: SortKey; label: string; color: string } | null =
        phase === 'nursery'   ? { key: 'flipDate', label: 'Uppot', color: '#0E82DB' } :
        phase === 'vegetative' ? { key: 'flipDate', label: 'Flip', color: '#0E82DB' } :
        phase === 'flowering'  ? { key: 'harvestDate', label: 'Harvest', color: '#E0863A' } :
        null;

    const columns: { key: SortKey; label: string; align?: 'right'; className?: string }[] = [
        { key: 'strain', label: 'Strain', className: 'strains-col-strain' },
        { key: 'totalPlants', label: 'Plants', align: 'right', className: 'strains-col-num' },
        { key: 'plantHealth', label: 'Health', align: 'right', className: 'strains-col-num' },
        { key: 'contamination', label: 'Issues', className: 'strains-col-issues' },
        { key: 'plantedDate', label: `Days in ${phaseLabel.toLowerCase()}`, align: 'right', className: 'strains-col-num' },
        ...(milestoneCol ? [{ key: milestoneCol.key, label: milestoneCol.label, align: 'right' as const, className: 'strains-col-num' }] : []),
    ];

    const totalPlants = visibleRows.reduce((s, r) => s + r.totalPlants, 0);
    const avgHealth = totalPlants ? Math.round(visibleRows.reduce((s, r) => s + r.plantHealth * r.totalPlants, 0) / totalPlants) : 100;
    const avgHex = HEALTH_COLOR_MAP[getHealthColor(avgHealth)];
    const allIssues = [...new Set(visibleRows.flatMap(r => r.contamination))];
    const showFilter = rows.length > 8;
    // Nursery rows are plant batches (several per strain); elsewhere one row per strain
    const rowNoun = rows[0]?.type === 'plantbatches' ? 'batch' : 'strain';
    const rowNouns = rowNoun === 'batch' ? 'batches' : 'strains';

    return (
        <>
            <DialogDrawer
                isOpen={totalSelected > 0}
                totalSelected={totalSelected}
                phase={phase}
                phaseLabel={phaseLabel}
                selectedGroups={selectedGroups}
                roomName={roomName}
                onAction={handleAction}
                onClearSelection={() => setSelectedIds(new Set())}
            />

            {showFilter && (
                <div className="strains-toolbar">
                    <label className="strains-filter">
                        <Search size={13} />
                        <input
                            type="search"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            placeholder={`Filter ${rows.length} ${rowNouns}…`}
                            aria-label="Filter strains"
                        />
                        {filter && (
                            <button type="button" onClick={() => setFilter('')} aria-label="Clear filter" className="strains-filter-clear">
                                <X size={12} />
                            </button>
                        )}
                    </label>
                    <span className="strains-toolbar-count tabular-nums">
                        {query ? `${visibleRows.length} of ${rows.length} ${rowNouns}` : `${rows.length} ${rowNouns}`}
                        {query && visibleRows.length === 0 ? ' · nothing matches' : ''}
                    </span>
                </div>
            )}

            <table className="strains-table">
                <thead>
                    <tr>
                        <th className="strains-th strains-col-check">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleAll}
                                aria-label="Select all strains"
                                className="strains-checkbox"
                            />
                        </th>
                        {columns.map(col => {
                            const sorted = sortKey === col.key;
                            return (
                                <th
                                    key={col.key}
                                    className={`strains-th strains-th--sortable ${sorted ? 'strains-th--sorted' : ''} ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.className ?? ''}`}
                                    onClick={() => toggleSort(col.key)}
                                    aria-sort={sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                                >
                                    <span className="strains-th-inner">
                                        {col.label}
                                        <span className="strains-sort-icon">
                                            {sorted && sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                                        </span>
                                    </span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {visibleRows.map(row => {
                        const hHex = HEALTH_COLOR_MAP[getHealthColor(row.plantHealth)];
                        const issues = [...new Set(row.contamination)];
                        const isSelected = selectedIds.has(row.id);
                        const days = daysSince(row.phaseDate || row.plantedDate);
                        const milestone = milestoneCol
                            ? (milestoneCol.key === 'harvestDate' ? row.harvestDate : row.flipDate)
                            : null;
                        return (
                            <tr
                                key={row.id}
                                className={`strains-row ${isSelected ? 'strains-row--selected' : ''}`}
                                onClick={() => toggleRow(row.id)}
                                aria-selected={isSelected}
                            >
                                <td className="strains-td strains-col-check">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleRow(row.id)}
                                        onClick={e => e.stopPropagation()}
                                        aria-label={`Select ${row.strain}`}
                                        className="strains-checkbox"
                                    />
                                </td>
                                <td className="strains-td strains-col-strain">
                                    <span className="strains-name" title={row.strain}>{row.strain}</span>
                                    {row.plants.length > 1 && row.type === 'plantbatches' && (
                                        <span className="strains-sub"> · {row.plants.length} batches</span>
                                    )}
                                </td>
                                <td className="strains-td strains-col-num text-right tabular-nums font-semibold">
                                    {row.totalPlants.toLocaleString()}
                                    {row.plannedCount ? (
                                        <span
                                            className="planned-badge"
                                            title={`${row.plannedCount} of ${row.totalPlants} planned for harvest`}
                                        >
                                            {row.plannedCount === row.totalPlants ? 'P' : `${row.plannedCount}P`}
                                        </span>
                                    ) : null}
                                </td>
                                <td className="strains-td strains-col-num text-right">
                                    <span className="strains-health">
                                        <span className="data-table-dot" style={{ background: hHex }} />
                                        <span className="tabular-nums font-semibold" style={{ color: hHex }}>{row.plantHealth}%</span>
                                    </span>
                                </td>
                                <td className="strains-td">
                                    {issues.length === 0
                                        ? <span className="strains-muted">—</span>
                                        : issues.map(c => (
                                            <span key={c} className="strains-issue" title={contaminantLabel(c)}>{contaminantAbbrev(c)}</span>
                                        ))}
                                </td>
                                <td className="strains-td strains-col-num text-right tabular-nums">
                                    {days == null ? <span className="strains-muted">—</span> : days}
                                </td>
                                {milestoneCol && (
                                    <td className="strains-td strains-col-num text-right tabular-nums">
                                        {milestone
                                            ? <span style={{ color: milestoneCol.color, fontWeight: 600 }}>{shortDate(milestone)}</span>
                                            : <span className="strains-muted">—</span>}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr className="strains-total">
                        <td className="strains-td" />
                        <td className="strains-td strains-col-strain">
                            {query ? `${visibleRows.length} of ${rows.length}` : rows.length} {rows.length === 1 ? rowNoun : rowNouns}
                        </td>
                        <td className="strains-td strains-col-num text-right tabular-nums">{totalPlants.toLocaleString()}</td>
                        <td className="strains-td strains-col-num text-right">
                            <span className="strains-health">
                                <span className="data-table-dot" style={{ background: avgHex }} />
                                <span className="tabular-nums" style={{ color: avgHex }}>{avgHealth}%</span>
                            </span>
                        </td>
                        <td className="strains-td" colSpan={milestoneCol ? 3 : 2}>
                            {allIssues.length === 0
                                ? <span className="strains-muted">No issues reported</span>
                                : allIssues.map(c => (
                                    <span key={c} className="strains-issue" title={contaminantLabel(c)}>{contaminantAbbrev(c)}</span>
                                ))}
                        </td>
                    </tr>
                </tfoot>
            </table>

            {/* Action Modal */}
            {activeModal && (
                <PlantActionModal
                    action={activeModal}
                    phase={phase}
                    phaseLabel={phaseLabel}
                    roomName={roomName}
                    selectedGroups={selectedGroups}
                    onClose={() => setActiveModal(null)}
                    onSuccess={handleModalSuccess}
                />
            )}
        </>
    );
};

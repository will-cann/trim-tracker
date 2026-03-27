import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RoomMapData, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, abbreviateContaminants } from '../../types/plantMap';
import { DialogDrawer } from './DialogDrawer';

interface StrainsListProps {
    data: RoomMapData | null;
    loading: boolean;
    phase: PlantPhase;
    phaseLabel: string;
    roomName: string;
    onRevalidate: () => void;
}

type SortKey = 'strain' | 'totalPlants' | 'plantHealth' | 'contamination' | 'plantedDate';
type SortDir = 'asc' | 'desc';

export const StrainsList: React.FC<StrainsListProps> = ({
    data,
    loading,
    phase,
    phaseLabel,
    roomName,
    onRevalidate: _onRevalidate,
}) => {
    // onRevalidate will be used in Sprint 3 when dialog modals are wired
    void _onRevalidate;
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortKey, setSortKey] = useState<SortKey>('strain');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

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
                    cmp = a.plantedDate.localeCompare(b.plantedDate);
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [rows, sortKey, sortDir]);

    const totalSelected = selectedIds.size;
    const allSelected = rows.length > 0 && selectedIds.size === rows.length;

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
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(rows.map(r => r.id)));
        }
    };

    const selectedGroups = useMemo(() => {
        return rows.filter(r => selectedIds.has(r.id));
    }, [rows, selectedIds]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-emerald-500" />
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-xs text-gray-400">
                No strain data for this room.
            </div>
        );
    }

    const columns: { key: SortKey; label: string; width: string }[] = [
        { key: 'plantHealth', label: 'Health', width: 'w-16' },
        { key: 'strain', label: 'Strain', width: 'flex-1' },
        { key: 'totalPlants', label: 'Plants', width: 'w-16' },
        { key: 'contamination', label: 'Contamination', width: 'w-24' },
        { key: 'plantedDate', label: 'Date', width: 'w-20' },
    ];

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return null;
        return sortDir === 'asc'
            ? <ChevronUp size={12} className="ml-0.5" />
            : <ChevronDown size={12} className="ml-0.5" />;
    };

    return (
        <div className="flex h-full">
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-700">
                        Strains in {roomName}
                    </h4>
                    {totalSelected > 0 && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                            {totalSelected} selected
                        </span>
                    )}
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="w-8 px-2 py-2">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleAll}
                                        className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5"
                                    />
                                </th>
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        className={`px-2 py-2 text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none ${col.width}`}
                                        onClick={() => toggleSort(col.key)}
                                    >
                                        <span className="inline-flex items-center">
                                            {col.label}
                                            <SortIcon col={col.key} />
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map(row => {
                                const hColor = getHealthColor(row.plantHealth);
                                const hHex = HEALTH_COLOR_MAP[hColor];
                                const contam = abbreviateContaminants(row.contamination);
                                const isSelected = selectedIds.has(row.id);
                                return (
                                    <tr
                                        key={row.id}
                                        className={`border-b border-gray-50 cursor-pointer transition-colors ${
                                            isSelected ? 'bg-emerald-50/50' : 'hover:bg-gray-50'
                                        }`}
                                        onClick={() => toggleRow(row.id)}
                                    >
                                        <td className="w-8 px-2 py-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleRow(row.id)}
                                                className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5"
                                            />
                                        </td>
                                        <td className="px-2 py-2 w-16">
                                            <span className="font-semibold tabular-nums" style={{ color: hHex }}>
                                                {row.plantHealth}%
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 flex-1">
                                            <span className="font-medium text-gray-900" title={row.strain}>
                                                {row.strain.length > 12 ? row.strain.slice(0, 12) + '…' : row.strain}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 w-16 tabular-nums text-gray-700 font-medium">
                                            {row.totalPlants}
                                        </td>
                                        <td className="px-2 py-2 w-24 text-gray-500">
                                            {contam}
                                        </td>
                                        <td className="px-2 py-2 w-20 tabular-nums text-gray-500">
                                            {row.plantedDate?.slice(5).replace('-', '/')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Dialog Drawer */}
            <DialogDrawer
                isOpen={totalSelected > 0}
                totalSelected={totalSelected}
                phase={phase}
                phaseLabel={phaseLabel}
                selectedGroups={selectedGroups}
                roomName={roomName}
                onAction={(action) => {
                    console.log('Bulk action:', action, selectedGroups);
                    // Sprint 3: wire actual dialog modals
                }}
                onClearSelection={() => setSelectedIds(new Set())}
            />
        </div>
    );
};

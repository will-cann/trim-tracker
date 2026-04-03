import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Tag } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DataTable, FilterToolbar } from '../ui';
import type { Column, FilterDef, SortOption } from '../ui';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    available: '#3BB570',
    assigned: '#1C9EFF',
    voided: '#959595',
};

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// ── Column definitions ───────────────────────────────────────────────────────

const TAG_COLUMNS: Column<Tag>[] = [
    {
        key: 'tagNumber', label: 'Tag Number', sortable: true,
        render: (r) => (
            <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8125rem' }}>
                {r.tagNumber}
            </span>
        ),
    },
    {
        key: 'tagType', label: 'Type', sortable: true, width: 90,
        render: (r) => (
            <span className="data-table-badge data-table-badge--muted">
                {r.tagType.charAt(0).toUpperCase() + r.tagType.slice(1)}
            </span>
        ),
    },
    {
        key: 'status', label: 'Status', sortable: true, width: 100,
        render: (r) => (
            <span className="data-table-badge" style={{ background: STATUS_COLORS[r.status] || '#959595' }}>
                {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
            </span>
        ),
    },
    {
        key: 'assignedTo', label: 'Assigned To', sortable: true,
        render: (r) => <span style={{ color: r.assignedTo ? '#1A1A1A' : '#959595' }}>{r.assignedTo || '—'}</span>,
    },
    {
        key: 'createdAt', label: 'Created', sortable: true, width: 120,
        render: (r) => <span style={{ color: '#959595' }}>{formatDate(r.createdAt)}</span>,
    },
];

// ── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: SortOption[] = [
    { value: 'tagNumber', label: 'Tag Number' },
    { value: 'status', label: 'Status' },
    { value: 'createdAt', label: 'Created' },
];

// ── Main Component ──────────────────────────────────────────────────────────

interface TagListViewProps {
    onBack?: () => void;
}

export const TagListView: React.FC<TagListViewProps> = ({ onBack }) => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const loadTags = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getTags({ limit: 500 });
        setTags(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadTags();
    }, [loadTags]);

    const statusFilter: FilterDef = {
        key: 'status', label: 'Status', multi: true,
        options: [
            { value: 'available', label: 'Available', dot: 'bg-[#3BB570]' },
            { value: 'assigned', label: 'Assigned', dot: 'bg-[#1C9EFF]' },
            { value: 'voided', label: 'Voided', dot: 'bg-[#959595]' },
        ],
    };

    const typeFilter: FilterDef = {
        key: 'type', label: 'Type', multi: false,
        options: [
            { value: 'plant', label: 'Plant' },
            { value: 'batch', label: 'Batch' },
        ],
    };

    const filteredTags = tags.filter(t => {
        if (search) {
            const q = search.toLowerCase();
            if (!t.tagNumber?.toLowerCase().includes(q) && !t.assignedTo?.toLowerCase().includes(q)) return false;
        }
        if (activeFilters.status?.length && !activeFilters.status.includes(t.status)) return false;
        if (activeFilters.type?.length && !activeFilters.type.includes(t.tagType)) return false;
        return true;
    });

    const sortedTags = [...filteredTags].sort((a, b) => {
        if (!sortKey) return 0;
        const aVal = (a as any)[sortKey];
        const bVal = (b as any)[sortKey];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const handleSort = (key: string) => {
        if (sortKey === key) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortKey(null); setSortDir('asc'); }
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const hasFilters = search || Object.values(activeFilters).some(v => v.length);

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Back to settings">
                            <ArrowLeft size={18} className="text-gray-500" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Tags</h1>
                        <p className="text-xs text-gray-400">Browse all plant and batch tags</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <FilterToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search tags..."
                filters={[statusFilter, typeFilter]}
                activeFilters={activeFilters}
                onFilterChange={(key, values) => setActiveFilters(prev => ({ ...prev, [key]: values }))}
                onClearFilters={() => setActiveFilters({})}
                sortOptions={SORT_OPTIONS}
                activeSort={sortKey}
                sortDir={sortDir}
                onSortChange={(val, dir) => { setSortKey(val); setSortDir(dir); }}
            />

            {/* Table */}
            <div className="mt-4">
                <DataTable
                    columns={TAG_COLUMNS}
                    data={sortedTags}
                    loading={loading}
                    emptyMessage={hasFilters ? 'No tags match your filters.' : 'No tags imported yet.'}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                />
            </div>
        </div>
    );
};

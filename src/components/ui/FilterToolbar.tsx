import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { Search, X, ChevronDown, Check, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface FilterOption {
    value: string;
    label: string;
    icon?: ReactNode;
    dot?: string; // Tailwind bg class for a color dot
}

export interface FilterDef {
    key: string;
    label: string;
    options: FilterOption[];
    multi?: boolean; // Allow multi-select (default: single)
}

export interface SortOption {
    value: string;
    label: string;
}

export interface FilterToolbarProps {
    /** Current search string */
    search: string;
    onSearchChange: (q: string) => void;
    searchPlaceholder?: string;

    /** Filter definitions and active values */
    filters?: FilterDef[];
    activeFilters?: Record<string, string[]>; // key → selected values
    onFilterChange?: (key: string, values: string[]) => void;
    onClearFilters?: () => void;

    /** Sort config */
    sortOptions?: SortOption[];
    activeSort?: string | null;
    sortDir?: 'asc' | 'desc';
    onSortChange?: (value: string | null, dir: 'asc' | 'desc') => void;

    /** Right-side slot (e.g. "New Package" button) */
    trailing?: ReactNode;
}

// ── FilterChip: a single filter trigger + dropdown ─────────────────────────

const FilterChip = ({
    filter,
    selected,
    onChange,
}: {
    filter: FilterDef;
    selected: string[];
    onChange: (values: string[]) => void;
}) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const isActive = selected.length > 0 && selected.length < filter.options.length;
    const selectedLabels = selected
        .map(v => filter.options.find(o => o.value === v)?.label)
        .filter(Boolean);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const toggleValue = (value: string) => {
        if (filter.multi) {
            const next = selected.includes(value)
                ? selected.filter(v => v !== value)
                : [...selected, value];
            // If all selected, treat as "all" (empty)
            onChange(next.length === filter.options.length ? [] : next);
        } else {
            // Single-select: toggle off or select
            onChange(selected.includes(value) ? [] : [value]);
            setOpen(false);
        }
    };

    const clearThis = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange([]);
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={`
                    filter-chip
                    ${isActive ? 'filter-chip--active' : ''}
                    ${open ? 'filter-chip--open' : ''}
                `}
            >
                <span className="filter-chip__label">
                    {filter.label}
                    {isActive && selectedLabels.length <= 2 && (
                        <span className="filter-chip__value">
                            {selectedLabels.join(', ')}
                        </span>
                    )}
                    {isActive && selectedLabels.length > 2 && (
                        <span className="filter-chip__count">{selectedLabels.length}</span>
                    )}
                </span>
                {isActive ? (
                    <span className="filter-chip__clear" onClick={clearThis}>
                        <X size={12} />
                    </span>
                ) : (
                    <ChevronDown size={13} className={`filter-chip__chevron ${open ? 'rotate-180' : ''}`} />
                )}
            </button>

            {open && (
                <div className="filter-dropdown">
                    {filter.options.map(opt => {
                        const checked = selected.includes(opt.value);
                        return (
                            <button
                                key={opt.value}
                                onClick={() => toggleValue(opt.value)}
                                className={`filter-dropdown__item ${checked ? 'filter-dropdown__item--selected' : ''}`}
                            >
                                {filter.multi && (
                                    <span className={`filter-dropdown__check ${checked ? 'filter-dropdown__check--on' : ''}`}>
                                        {checked && <Check size={10} strokeWidth={3} />}
                                    </span>
                                )}
                                {opt.dot && <span className={`filter-dropdown__dot ${opt.dot}`} />}
                                {opt.icon && <span className="filter-dropdown__icon">{opt.icon}</span>}
                                <span className="filter-dropdown__text">{opt.label}</span>
                                {!filter.multi && checked && (
                                    <Check size={13} className="ml-auto text-[var(--primary-color)] shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ── SortChip ───────────────────────────────────────────────────────────────

const SortChip = ({
    options,
    activeSort,
    sortDir,
    onChange,
}: {
    options: SortOption[];
    activeSort: string | null;
    sortDir: 'asc' | 'desc';
    onChange: (value: string | null, dir: 'asc' | 'desc') => void;
}) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const activeLabel = options.find(o => o.value === activeSort)?.label;

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const selectSort = (value: string) => {
        if (value === activeSort) {
            // Cycle: asc → desc → off
            if (sortDir === 'asc') onChange(value, 'desc');
            else { onChange(null, 'asc'); setOpen(false); }
        } else {
            onChange(value, 'asc');
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={`filter-chip ${activeSort ? 'filter-chip--active' : ''} ${open ? 'filter-chip--open' : ''}`}
            >
                <ArrowUpDown size={13} />
                <span className="filter-chip__label">
                    {activeSort ? activeLabel : 'Sort'}
                    {activeSort && (
                        <span className="filter-chip__dir">
                            {sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                        </span>
                    )}
                </span>
                {activeSort ? (
                    <span className="filter-chip__clear" onClick={(e) => { e.stopPropagation(); onChange(null, 'asc'); setOpen(false); }}>
                        <X size={12} />
                    </span>
                ) : (
                    <ChevronDown size={13} className={`filter-chip__chevron ${open ? 'rotate-180' : ''}`} />
                )}
            </button>

            {open && (
                <div className="filter-dropdown filter-dropdown--sort">
                    {options.map(opt => {
                        const isActive = opt.value === activeSort;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => selectSort(opt.value)}
                                className={`filter-dropdown__item ${isActive ? 'filter-dropdown__item--selected' : ''}`}
                            >
                                <span className="filter-dropdown__text">{opt.label}</span>
                                {isActive && (
                                    <span className="ml-auto flex items-center gap-1 text-[var(--primary-color)]">
                                        {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ── Main FilterToolbar ─────────────────────────────────────────────────────

export const FilterToolbar = ({
    search,
    onSearchChange,
    searchPlaceholder = 'Search...',
    filters = [],
    activeFilters = {},
    onFilterChange,
    onClearFilters,
    sortOptions,
    activeSort = null,
    sortDir = 'asc',
    onSortChange,
    trailing,
}: FilterToolbarProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const totalActiveFilters = Object.values(activeFilters).reduce(
        (sum, vals) => sum + (vals.length > 0 ? 1 : 0),
        0,
    );

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            e.preventDefault();
            inputRef.current?.focus();
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="filter-toolbar">
            {/* Search */}
            <div className="filter-toolbar__search">
                <Search size={15} className="filter-toolbar__search-icon" />
                <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="filter-toolbar__search-input"
                />
                {search && (
                    <button
                        onClick={() => onSearchChange('')}
                        className="filter-toolbar__search-clear"
                    >
                        <X size={14} />
                    </button>
                )}
                <kbd className="filter-toolbar__kbd">/</kbd>
            </div>

            {/* Divider */}
            {(filters.length > 0 || sortOptions) && (
                <div className="filter-toolbar__divider" />
            )}

            {/* Filter chips */}
            <div className="filter-toolbar__chips">
                {filters.map(f => (
                    <FilterChip
                        key={f.key}
                        filter={f}
                        selected={activeFilters[f.key] || []}
                        onChange={(vals) => onFilterChange?.(f.key, vals)}
                    />
                ))}

                {sortOptions && sortOptions.length > 0 && onSortChange && (
                    <SortChip
                        options={sortOptions}
                        activeSort={activeSort}
                        sortDir={sortDir}
                        onChange={onSortChange}
                    />
                )}

                {/* Clear all */}
                {totalActiveFilters > 0 && onClearFilters && (
                    <button onClick={onClearFilters} className="filter-toolbar__clear-all">
                        <X size={12} />
                        Clear filters
                    </button>
                )}
            </div>

            {/* Trailing slot */}
            {trailing && <div className="filter-toolbar__trailing">{trailing}</div>}
        </div>
    );
};

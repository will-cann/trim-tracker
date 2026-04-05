import { type ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';

export interface Column<T> {
    key: string;
    label: string;
    render?: (row: T) => ReactNode;
    sortable?: boolean;
    width?: string | number;
    align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    emptyMessage?: string;
    onRowClick?: (row: T) => void;
    sortKey?: string | null;
    sortDir?: 'asc' | 'desc';
    onSort?: (key: string) => void;
}

export function DataTable<T extends Record<string, any>>({
    columns,
    data,
    loading = false,
    emptyMessage = 'Nothing here yet.',
    onRowClick,
    sortKey,
    sortDir = 'asc',
    onSort,
}: DataTableProps<T>) {
    if (loading) {
        return <CenteredSpinner label="Loading…" height="py-16" />;
    }

    if (data.length === 0) {
        return (
            <div className="data-table-empty">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="data-table-wrap">
            <table className="data-table">
                <thead>
                    <tr>
                        {columns.map(col => {
                            const isSorted = sortKey === col.key;
                            const alignClass = col.align === 'center' ? 'text-center'
                                : col.align === 'right' ? 'text-right' : 'text-left';

                            return (
                                <th
                                    key={col.key}
                                    className={[
                                        'data-table-th',
                                        alignClass,
                                        col.sortable && onSort ? 'data-table-th--sortable' : '',
                                        isSorted ? 'data-table-th--sorted' : '',
                                    ].filter(Boolean).join(' ')}
                                    style={col.width ? { width: col.width } : undefined}
                                    onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                                    aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                                >
                                    <span className="data-table-th-inner">
                                        {col.label}
                                        {col.sortable && onSort && (
                                            <span className="data-table-sort-icon">
                                                {isSorted
                                                    ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                                                    : <ArrowUp size={12} />
                                                }
                                            </span>
                                        )}
                                    </span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr
                            key={(row as any).id ?? i}
                            className={`data-table-row ${onRowClick ? 'data-table-row--clickable' : ''}`}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                        >
                            {columns.map(col => {
                                const alignClass = col.align === 'center' ? 'text-center'
                                    : col.align === 'right' ? 'text-right' : '';

                                return (
                                    <td key={col.key} className={`data-table-td ${alignClass}`}>
                                        {col.render ? col.render(row) : (row[col.key] ?? '—')}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

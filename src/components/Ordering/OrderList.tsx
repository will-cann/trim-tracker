import type { PurchaseOrder, OrderStatus } from '../../types/definitions';
import { DataTable } from '../ui';
import type { Column } from '../ui';

interface Props {
    orders: PurchaseOrder[];
    loading: boolean;
    onRefresh: () => Promise<void>;
    onEditOrder: (orderId: string) => void;
}

const STATUS_COLORS: Record<OrderStatus, string> = {
    draft: '#959595',
    submitted: '#1C9EFF',
    confirmed: '#3BB570',
    delivered: '#6B46C1',
    cancelled: '#DF5B59',
};

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '--';

const formatCost = (n: number) => n > 0 ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--';

export const OrderList: React.FC<Props> = ({ orders, loading, onEditOrder }) => {
    const columns: Column<PurchaseOrder>[] = [
        { key: 'vendorName', label: 'Vendor', sortable: true,
            render: (o) => <span style={{ fontWeight: 500 }}>{o.vendorName}</span>,
        },
        { key: 'status', label: 'Status', sortable: true, width: 120,
            render: (o) => (
                <span className="data-table-badge" style={{ background: STATUS_COLORS[o.status] || '#959595' }}>
                    {o.status}
                </span>
            ),
        },
        { key: 'totalUnits', label: 'Units', width: 80, align: 'center',
            render: (o) => o.totalUnits || '--',
        },
        { key: 'totalCost', label: 'Total', width: 110, align: 'right',
            render: (o) => formatCost(o.totalCost),
        },
        { key: 'createdAt', label: 'Created', width: 130, sortable: true,
            render: (o) => formatDate(o.createdAt),
        },
        { key: 'submittedAt', label: 'Submitted', width: 130,
            render: (o) => formatDate(o.submittedAt),
        },
        { key: 'expectedDelivery', label: 'Expected', width: 130,
            render: (o) => formatDate(o.expectedDelivery),
        },
    ];

    return (
        <div style={{ paddingTop: 'var(--space-md)' }}>
            <DataTable
                columns={columns}
                data={orders}
                loading={loading}
                emptyMessage="Purchase orders appear here once you build them. Go to Vendors and click 'Start Order' on any vendor."
                onRowClick={(o) => onEditOrder(o.id)}
            />
        </div>
    );
};

import { Clock } from 'lucide-react';
import type { Vendor } from '../../types/definitions';

/**
 * Informational pill shown on a vendor row when outreach cadence has lapsed.
 * Purely visual — no click handler.
 *
 * Relies on Unit 1 (vendor_type, last_contacted_at) + Unit 9 (outreach_cadence_days,
 * next_reminder_at) columns. If either side hasn't shipped yet, these fields are
 * undefined and the badge renders nothing.
 */
export const SupplierOverdueBadge: React.FC<{ vendor: Vendor }> = ({ vendor }) => {
    const { outreachCadenceDays, nextReminderAt } = vendor;
    if (!outreachCadenceDays || !nextReminderAt) return null;
    if (new Date(nextReminderAt).getTime() > Date.now()) return null;

    return (
        <span
            title={`Outreach overdue — cadence ${outreachCadenceDays}d`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                background: '#FDECEC',
                color: '#A8403E',
                border: '1px solid #F5C6C6',
                fontSize: '0.6875rem',
                fontWeight: 600,
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
            }}
        >
            <span
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#DF5B59',
                    display: 'inline-block',
                }}
            />
            <Clock size={11} />
            overdue
        </span>
    );
};

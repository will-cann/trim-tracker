import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    /** Visual density. `compact` for in-card placements, `default` for full-view empties. */
    size?: 'compact' | 'default';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon,
    title,
    description,
    action,
    size = 'default',
}) => {
    const isCompact = size === 'compact';
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: isCompact ? '32px 24px' : '64px 32px',
            }}
        >
            {Icon && (
                <div
                    style={{
                        width: isCompact ? 40 : 56,
                        height: isCompact ? 40 : 56,
                        borderRadius: '50%',
                        background: '#F1F1F1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: isCompact ? 14 : 20,
                        color: '#959595',
                    }}
                >
                    <Icon size={isCompact ? 20 : 26} strokeWidth={1.75} />
                </div>
            )}
            <h3
                className={isCompact ? 'text-subhead' : 'text-h2'}
                style={{ margin: 0, color: '#1A1A1A' }}
            >
                {title}
            </h3>
            {description && (
                <p
                    className={isCompact ? 'text-body' : 'text-prose'}
                    style={{
                        marginTop: 8,
                        marginBottom: 0,
                        color: '#737373',
                        maxWidth: '44ch',
                    }}
                >
                    {description}
                </p>
            )}
            {action && <div style={{ marginTop: 24 }}>{action}</div>}
        </div>
    );
};

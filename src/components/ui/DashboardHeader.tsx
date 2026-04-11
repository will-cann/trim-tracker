import React from 'react';

interface DashboardHeaderProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    /** Optional eyebrow label rendered above the title (e.g. section context). */
    eyebrow?: string;
    /**
     * Visual density. `default` gives the full display treatment; `compact`
     * halves the vertical footprint for data-dense dashboards where every
     * row counts.
     */
    density?: 'default' | 'compact';
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    title,
    subtitle,
    actions,
    eyebrow,
    density = 'default',
}) => {
    const isCompact = density === 'compact';
    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
                rowGap: 12,
                padding: isCompact ? '16px 0 12px' : '24px 0 20px',
                borderBottom: '1px solid #F1F1F1',
                marginBottom: isCompact ? 16 : 24,
            }}
        >
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                {eyebrow && (
                    <div
                        className="text-eyebrow uppercase"
                        style={{ color: '#959595', marginBottom: isCompact ? 4 : 8 }}
                    >
                        {eyebrow}
                    </div>
                )}
                <h1
                    className={isCompact ? 'text-h1' : 'text-display'}
                    style={{
                        color: '#1A1A1A',
                        margin: 0,
                        // Long dynamic titles wrap rather than truncate — readable > cryptic.
                        overflowWrap: 'anywhere',
                    }}
                >
                    {title}
                </h1>
                {subtitle && (
                    <p
                        className={isCompact ? 'text-body' : 'text-prose'}
                        style={{
                            marginTop: isCompact ? 4 : 8,
                            marginBottom: 0,
                            color: '#737373',
                            maxWidth: '60ch',
                        }}
                    >
                        {subtitle}
                    </p>
                )}
            </div>
            {actions && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0,
                        flexWrap: 'wrap',
                    }}
                >
                    {actions}
                </div>
            )}
        </header>
    );
};

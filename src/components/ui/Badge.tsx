import React from 'react';

type BadgeVariant = 'upcoming' | 'active' | 'complete' | 'outline' | 'custom';

interface BadgeProps {
    variant?: BadgeVariant;
    /** For custom variant: Tailwind bg class (e.g. 'bg-blue-50') */
    bg?: string;
    /** For custom variant: Tailwind text class (e.g. 'text-blue-600') */
    color?: string;
    clickable?: boolean;
    className?: string;
    children: React.ReactNode;
    onClick?: () => void;
}

const variantClasses: Record<Exclude<BadgeVariant, 'custom'>, string> = {
    upcoming: 'status-badge status-upcoming',
    active: 'status-badge status-active',
    complete: 'status-badge status-complete',
    outline: 'status-badge status-badge-outline',
};

export const Badge: React.FC<BadgeProps> = ({
    variant = 'active',
    bg,
    color,
    clickable = false,
    className = '',
    children,
    onClick,
}) => {
    if (variant === 'custom') {
        const classes = [
            'text-xs px-1.5 py-0.5 rounded-full',
            bg,
            color,
            className,
        ].filter(Boolean).join(' ');

        return <span className={classes} onClick={onClick}>{children}</span>;
    }

    const classes = [
        variantClasses[variant],
        clickable ? 'clickable' : '',
        className,
    ].filter(Boolean).join(' ');

    return <span className={classes} onClick={onClick}>{children}</span>;
};

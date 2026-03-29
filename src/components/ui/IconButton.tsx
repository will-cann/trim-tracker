import React from 'react';

type IconButtonSize = 'sm' | 'md';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    size?: IconButtonSize;
    active?: boolean;
    children: React.ReactNode;
}

const sizeClasses: Record<IconButtonSize, string> = {
    sm: 'btn-icon-minimal',
    md: 'btn-icon',
};

export const IconButton: React.FC<IconButtonProps> = ({
    size = 'md',
    active = false,
    className = '',
    children,
    ...props
}) => {
    const classes = [sizeClasses[size], active ? 'listening' : '', className]
        .filter(Boolean)
        .join(' ');

    return (
        <button className={classes} {...props}>
            {children}
        </button>
    );
};

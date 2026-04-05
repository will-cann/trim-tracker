import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'lion';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-cancel',
    danger: 'btn-delete-confirm',
    ghost: 'btn-delete-roster',
    outline: 'btn-new-batch',
    lion: 'btn-lion',
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'btn-size-sm',
    md: '',
    lg: 'btn-size-lg',
};

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    className = '',
    children,
    ...props
}) => {
    const classes = [variantClasses[variant], sizeClasses[size], className]
        .filter(Boolean)
        .join(' ');

    return (
        <button className={classes} {...props}>
            {children}
        </button>
    );
};

import React from 'react';

interface StatCardProps {
    icon: React.ReactNode;
    /** CSS class for the icon wrapper (e.g. 'flower-icon', 'start-icon') or inline style */
    iconClassName?: string;
    iconStyle?: React.CSSProperties;
    label: string;
    value: string | number;
}

export const StatCard: React.FC<StatCardProps> = ({
    icon,
    iconClassName,
    iconStyle,
    label,
    value,
}) => {
    return (
        <div className="stat-item">
            <div className={`stat-icon ${iconClassName || ''}`} style={iconStyle}>
                {icon}
            </div>
            <div className="stat-content">
                <label>{label}</label>
                <p className="stat-value">{value}</p>
            </div>
        </div>
    );
};

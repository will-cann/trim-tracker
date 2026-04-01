import React from 'react';

interface MetricCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    color: 'blue' | 'green' | 'purple' | 'red';
    icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, subtext, color }) => {
    const colorClasses = {
        blue: 'bg-blue-50 text-blue-900',
        green: 'bg-green-50 text-green-900',
        purple: 'bg-blue-50 text-blue-900',
        red: 'bg-red-50 text-red-900',
    };

    const valueColorClasses = {
        blue: 'text-blue-600',
        green: 'text-green-600',
        purple: 'text-blue-600',
        red: 'text-red-600',
    };

    const labelColorClasses = {
        blue: 'text-blue-400',
        green: 'text-green-400',
        purple: 'text-blue-400',
        red: 'text-red-400',
    };

    return (
        <div className={`${colorClasses[color]} rounded-xl p-6 flex flex-col justify-center h-28 shadow-sm`}>
            <div className={`text-4xl font-bold ${valueColorClasses[color]} mb-1`}>
                {value}
            </div>
            <div className={`text-sm font-medium ${labelColorClasses[color]}`}>
                {label}
            </div>
            {subtext && <div className="text-xs mt-1 opacity-60">{subtext}</div>}
        </div>
    );
};

import React from 'react';

interface WeightInputProps {
    label: string;
    value: number;
    onChange: (val: number) => void;
    color: 'flower' | 'shake' | 'trim' | 'waste' | 'emerald' | 'blue' | 'purple' | 'red';
    readOnly?: boolean;
}

export const WeightInput: React.FC<WeightInputProps> = ({ label, value, onChange, color, readOnly }) => {
    const getColorClass = () => {
        switch (color) {
            case 'flower':
            case 'emerald': return 'text-flower focus:ring-emerald-500';
            case 'shake': return 'text-shake focus:ring-amber-500';
            case 'blue': return 'text-blue-600 focus:ring-blue-500'; // Keep for backward compat if needed
            case 'trim':
            case 'purple': return 'text-trim focus:ring-purple-500';
            case 'waste':
            case 'red': return 'text-waste focus:ring-red-500';
            default: return 'text-gray-600 focus:ring-gray-500';
        }
    };

    return (
        <div className="weight-input-group">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{label}</label>
            <div className="relative">
                <input
                    type="number"
                    value={value || ''}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-lg font-semibold ${getColorClass()} focus:outline-none focus:ring-2 transition-all ${readOnly ? 'bg-gray-50 cursor-not-allowed opacity-75' : ''}`}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    disabled={readOnly}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">g</span>
            </div>
        </div>
    );
};

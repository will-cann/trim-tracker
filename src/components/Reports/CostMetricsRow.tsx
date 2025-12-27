import React from 'react';
import { PlusCircle, MinusCircle } from 'lucide-react';

interface CostMetricsRowProps {
    hourlyWage: number;
    estimatedLaborCost: number;
    avgLaborCostPerLb: number;
    onUpdateWage: (wage: number) => void;
}

export const CostMetricsRow: React.FC<CostMetricsRowProps> = ({
    hourlyWage,
    estimatedLaborCost,
    avgLaborCostPerLb,
    onUpdateWage
}) => {
    return (
        <div className="bg-orange-50 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm border border-orange-100">
            {/* Avg Trim Wage */}
            <div className="flex items-center gap-4">
                <div>
                    <div className="text-3xl font-bold text-orange-400">${hourlyWage}</div>
                    <div className="text-xs font-medium text-orange-300 uppercase tracking-wide">Avg Trim Wage</div>
                </div>
                <div className="flex flex-col gap-1">
                    <button
                        onClick={() => onUpdateWage(hourlyWage + 1)}
                        className="text-orange-300 hover:text-orange-500 transition-colors"
                    >
                        <PlusCircle size={20} />
                    </button>
                    <button
                        onClick={() => onUpdateWage(Math.max(0, hourlyWage - 1))}
                        className="text-orange-300 hover:text-orange-500 transition-colors"
                    >
                        <MinusCircle size={20} />
                    </button>
                </div>
            </div>

            {/* Estimated Trim Labor Cost */}
            <div className="text-center md:text-left">
                <div className="text-3xl font-bold text-orange-400">
                    ${estimatedLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-medium text-orange-300 uppercase tracking-wide">Estimated Trim Labor Cost</div>
            </div>

            {/* Avg Labor Cost per Lb */}
            <div className="text-center md:text-left">
                <div className="text-3xl font-bold text-orange-400">
                    ${avgLaborCostPerLb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-medium text-orange-300 uppercase tracking-wide">Avg Labor Cost per Lb</div>
            </div>
        </div>
    );
};

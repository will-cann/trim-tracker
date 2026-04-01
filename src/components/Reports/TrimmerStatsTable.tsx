import React from 'react';
import type { TrimmerStat } from '../../services/reportsData';
import { ArrowUp, ArrowDown, Minus, MoreVertical } from 'lucide-react';

interface TrimmerStatsTableProps {
    data: TrimmerStat[];
}

export const TrimmerStatsTable: React.FC<TrimmerStatsTableProps> = ({ data }) => {

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900">Trimmer Stats</h3>
                    <button className="text-gray-400 hover:text-gray-600 transition-colors">
                        <MoreVertical size={20} />
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Trimmer
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Grams per Hour
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Flower Ratio
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Labor Hours
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Trend
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.map((trimmer, index) => (
                            <tr
                                key={trimmer.id}
                                className="hover:bg-gray-50 transition-colors"
                                style={{ backgroundColor: index % 2 === 0 ? 'white' : '#F8F8F8' }}
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mr-3">
                                            <span className="text-emerald-600 font-semibold text-sm">
                                                {trimmer.name.charAt(0)}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium text-gray-900">{trimmer.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm font-semibold text-gray-900">
                                        {trimmer.gramsPerHour.toFixed(1)}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">g/hr</span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2 max-w-[100px]">
                                            <div
                                                className="bg-emerald-500 h-2 rounded-full"
                                                style={{ width: `${trimmer.flowerRatio * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-sm text-gray-600">
                                            {(trimmer.flowerRatio * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-gray-900">
                                        {trimmer.laborHours.toFixed(1)}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">hrs</span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        {trimmer.trend === 'up' && (
                                            <div className="flex items-center text-green-600">
                                                <ArrowUp size={16} className="mr-1" />
                                                <span className="text-xs font-medium">Up</span>
                                            </div>
                                        )}
                                        {trimmer.trend === 'down' && (
                                            <div className="flex items-center text-red-600">
                                                <ArrowDown size={16} className="mr-1" />
                                                <span className="text-xs font-medium">Down</span>
                                            </div>
                                        )}
                                        {trimmer.trend === 'stable' && (
                                            <div className="flex items-center text-gray-400">
                                                <Minus size={16} className="mr-1" />
                                                <span className="text-xs font-medium">Stable</span>
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

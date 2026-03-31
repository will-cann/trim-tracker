import React from 'react';
import type { TrimSession } from '../types/definitions';

interface DashboardDonutChartProps {
    session: TrimSession;
}

export const DashboardDonutChart: React.FC<DashboardDonutChartProps> = ({ session }) => {
    const totalStart = session.entries.reduce((sum, e) => sum + e.startWeight, 0);
    const totalFlower = session.totalFlower;
    const totalShake = session.totalShake;
    const totalWaste = session.totalWaste;
    const totalTrim = session.totalTrim; // Assuming we want to track this even if not in main cards

    const totalProcessed = totalFlower + totalShake + totalWaste + totalTrim;
    const remaining = Math.max(0, totalStart - totalProcessed);

    if (totalStart === 0) {
        return (
            <div className="donut-chart-container dashboard-chart">
                <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="w-16 h-16 rounded-full border-4 border-gray-100 mb-3" />
                    <p className="text-xs text-gray-400">No weight data yet</p>
                </div>
            </div>
        );
    }

    // Calculate segments
    // Circumference = 2 * PI * r
    // r = 15.9155 (approx for 100 circumference) -> let's use standard SVG coords
    // Let's use a viewBox of 0 0 40 40, radius 15.9155
    // Circumference is approx 100.

    const createSegment = (value: number, color: string, offset: number) => {
        const percentage = (value / totalStart) * 100;
        return {
            strokeDasharray: `${percentage} ${100 - percentage}`,
            strokeDashoffset: offset,
            stroke: color
        };
    };

    // Order: Flower, Shake, Waste, Trim, Remaining
    // Colors matching the app theme
    const colors = {
        flower: '#3BB570', // chameleon
        shake: '#FA9E52',  // lion
        waste: '#DF5B59',  // cardinal
        trim: '#1C9EFF',   // macaw
        remaining: '#E0E0E0'
    };

    let currentOffset = 25; // Start at top (12 o'clock is -90deg, but with dashoffset 25 it works for 100 circ)

    const flowerSegment = createSegment(totalFlower, colors.flower, currentOffset);
    currentOffset -= (totalFlower / totalStart) * 100;

    const shakeSegment = createSegment(totalShake, colors.shake, currentOffset);
    currentOffset -= (totalShake / totalStart) * 100;

    const wasteSegment = createSegment(totalWaste, colors.waste, currentOffset);
    currentOffset -= (totalWaste / totalStart) * 100;

    const trimSegment = createSegment(totalTrim, colors.trim, currentOffset);
    currentOffset -= (totalTrim / totalStart) * 100;

    // remainingSegment is not used in the render as it's the background, but we can calculate it if needed.
    // For now, we just render the background circle as "remaining".

    return (
        <div className="donut-chart-container dashboard-chart">
            <div className="chart-inner">
                <svg viewBox="0 0 40 40" className="donut-chart">
                    <circle className="donut-ring" cx="20" cy="20" r="15.9155" fill="transparent" stroke="#E0E0E0" strokeWidth="4" />

                    {/* Remaining (Background for the rest) */}
                    <circle className="donut-segment" cx="20" cy="20" r="15.9155" fill="transparent" strokeWidth="4"
                        stroke={colors.remaining} strokeDasharray={`${(remaining / totalStart) * 100} ${100 - (remaining / totalStart) * 100}`} strokeDashoffset={currentOffset} />

                    {/* Data Segments */}
                    {totalFlower > 0 && (
                        <circle className="donut-segment" cx="20" cy="20" r="15.9155" fill="transparent" strokeWidth="4"
                            stroke={flowerSegment.stroke} strokeDasharray={flowerSegment.strokeDasharray} strokeDashoffset={flowerSegment.strokeDashoffset} />
                    )}
                    {totalShake > 0 && (
                        <circle className="donut-segment" cx="20" cy="20" r="15.9155" fill="transparent" strokeWidth="4"
                            stroke={shakeSegment.stroke} strokeDasharray={shakeSegment.strokeDasharray} strokeDashoffset={shakeSegment.strokeDashoffset} />
                    )}
                    {totalWaste > 0 && (
                        <circle className="donut-segment" cx="20" cy="20" r="15.9155" fill="transparent" strokeWidth="4"
                            stroke={wasteSegment.stroke} strokeDasharray={wasteSegment.strokeDasharray} strokeDashoffset={wasteSegment.strokeDashoffset} />
                    )}
                    {totalTrim > 0 && (
                        <circle className="donut-segment" cx="20" cy="20" r="15.9155" fill="transparent" strokeWidth="4"
                            stroke={trimSegment.stroke} strokeDasharray={trimSegment.strokeDasharray} strokeDashoffset={trimSegment.strokeDashoffset} />
                    )}

                    <g className="chart-text">
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="chart-number" dy="-0.3em">
                            {Math.round((totalProcessed / totalStart) * 100)}%
                        </text>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="chart-label" dy="0.8em">
                            Complete
                        </text>
                    </g>
                </svg>
            </div>
            <div className="chart-legend">
                <div className="legend-item"><span className="dot" style={{ background: colors.flower }}></span>Flower</div>
                <div className="legend-item"><span className="dot" style={{ background: colors.shake }}></span>Shake</div>
                <div className="legend-item"><span className="dot" style={{ background: colors.trim }}></span>Trim</div>
                <div className="legend-item"><span className="dot" style={{ background: colors.waste }}></span>Waste</div>
                <div className="legend-item"><span className="dot" style={{ background: colors.remaining }}></span>Remaining</div>
            </div>
        </div>
    );
};

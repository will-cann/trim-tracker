import { apiService } from './apiService';
import type { TrimSession } from '../types/definitions';

export interface ReportSummary {
    trimLaborHours: number;
    avgGramsPerHour: number;
    flowerTrimmedLbs: number;
    trimLbs: number;
    avgHourlyWage: number;
    estimatedLaborCost: number;
    avgLaborCostPerLb: number;
}

export interface DailyThroughput {
    date: string;
    flowerLbs: number;
    trimLbs: number;
    laborHours: number;
}

export interface TrimmerStat {
    id: string;
    name: string;
    gramsPerHour: number;
    flowerRatio: number;
    laborHours: number;
    trend: 'up' | 'down' | 'stable';
}

export interface CostMetric {
    date: string;
    costPerLb: number;
    flowerRatio: number;
}

export interface TrimmerPerformanceData {
    date: string;
    [trimmerName: string]: number | string;
}

export interface ReportsData {
    summary: ReportSummary;
    throughput: DailyThroughput[];
    trimmerStats: TrimmerStat[];
    costRatio: CostMetric[];
    trimmerPerformance: TrimmerPerformanceData[];
}

const DEFAULT_HOURLY_WAGE = 15;

function calculateLaborHours(session: TrimSession): number {
    let totalHours = 0;

    for (const entry of session.entries) {
        if (!entry.trimmers) continue;
        for (const trimmer of entry.trimmers) {
            if (trimmer.startTime && trimmer.endTime) {
                const [startHour, startMin] = trimmer.startTime.split(':').map(Number);
                const [endHour, endMin] = trimmer.endTime.split(':').map(Number);
                const hours = (endHour + endMin / 60) - (startHour + startMin / 60);
                totalHours += hours > 0 ? hours : 0;
            }
        }
    }

    return totalHours;
}

export async function getReportsData(): Promise<ReportsData> {
    const sessions = await apiService.getCompletedSessions();

    if (sessions.length === 0) {
        // Return empty data structure
        return {
            summary: {
                trimLaborHours: 0,
                avgGramsPerHour: 0,
                flowerTrimmedLbs: 0,
                trimLbs: 0,
                avgHourlyWage: DEFAULT_HOURLY_WAGE,
                estimatedLaborCost: 0,
                avgLaborCostPerLb: 0
            },
            throughput: [],
            trimmerStats: [],
            costRatio: [],
            trimmerPerformance: []
        };
    }

    // Calculate summary metrics
    const totalLaborHours = sessions.reduce((sum, s) => sum + calculateLaborHours(s), 0);
    const totalFlowerLbs = sessions.reduce((sum, s) => sum + s.totalFlower / 453.592, 0); // grams to lbs
    const totalTrimLbs = sessions.reduce((sum, s) => sum + s.totalTrim / 453.592, 0);
    const totalGrams = sessions.reduce((sum, s) => sum + s.totalFlower + s.totalShake + s.totalTrim, 0);
    const avgGramsPerHour = totalLaborHours > 0 ? totalGrams / totalLaborHours : 0;
    const estimatedLaborCost = totalLaborHours * DEFAULT_HOURLY_WAGE;
    const avgLaborCostPerLb = totalFlowerLbs > 0 ? estimatedLaborCost / totalFlowerLbs : 0;

    // Calculate daily throughput
    const throughputMap = new Map<string, DailyThroughput>();
    for (const session of sessions) {
        if (!session.completedAt) continue;
        const date = new Date(session.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const existing = throughputMap.get(date) || { date, flowerLbs: 0, trimLbs: 0, laborHours: 0 };
        existing.flowerLbs += session.totalFlower / 453.592;
        existing.trimLbs += session.totalTrim / 453.592;
        existing.laborHours += calculateLaborHours(session);
        throughputMap.set(date, existing);
    }

    // Calculate trimmer stats
    const trimmerStatsMap = new Map<string, { totalGrams: number; totalHours: number; totalFlower: number }>();
    for (const session of sessions) {
        for (const entry of session.entries) {
            for (const trimmer of entry.trimmers) {
                const existing = trimmerStatsMap.get(trimmer.name) || { totalGrams: 0, totalHours: 0, totalFlower: 0 };
                existing.totalGrams += trimmer.flowerWeight + trimmer.shakeWeight + trimmer.trimWeight;
                existing.totalFlower += trimmer.flowerWeight;

                if (trimmer.startTime && trimmer.endTime) {
                    const [startHour, startMin] = trimmer.startTime.split(':').map(Number);
                    const [endHour, endMin] = trimmer.endTime.split(':').map(Number);
                    const hours = (endHour + endMin / 60) - (startHour + startMin / 60);
                    existing.totalHours += hours > 0 ? hours : 0;
                }

                trimmerStatsMap.set(trimmer.name, existing);
            }
        }
    }

    const trimmerStats: TrimmerStat[] = Array.from(trimmerStatsMap.entries()).map(([name, stats]) => ({
        id: name,
        name,
        gramsPerHour: stats.totalHours > 0 ? stats.totalGrams / stats.totalHours : 0,
        flowerRatio: stats.totalGrams > 0 ? stats.totalFlower / stats.totalGrams : 0,
        laborHours: stats.totalHours,
        trend: 'stable' as const
    }));

    // Calculate cost ratio over time
    const costRatio: CostMetric[] = Array.from(throughputMap.values()).map(day => ({
        date: day.date,
        costPerLb: day.flowerLbs > 0 ? (day.laborHours * DEFAULT_HOURLY_WAGE) / day.flowerLbs : 0,
        flowerRatio: day.flowerLbs / (day.flowerLbs + day.trimLbs)
    }));

    // Calculate trimmer performance over time (simplified - using daily aggregates)
    const trimmerPerformance: TrimmerPerformanceData[] = Array.from(throughputMap.values()).map(day => {
        const perf: TrimmerPerformanceData = { date: day.date };
        // For now, distribute evenly across trimmers (would need more detailed tracking for real data)
        trimmerStats.forEach(trimmer => {
            perf[trimmer.name] = trimmer.gramsPerHour;
        });
        return perf;
    });

    return {
        summary: {
            trimLaborHours: Math.round(totalLaborHours),
            avgGramsPerHour: Math.round(avgGramsPerHour),
            flowerTrimmedLbs: Math.round(totalFlowerLbs),
            trimLbs: Math.round(totalTrimLbs),
            avgHourlyWage: DEFAULT_HOURLY_WAGE,
            estimatedLaborCost: Math.round(estimatedLaborCost),
            avgLaborCostPerLb: Math.round(avgLaborCostPerLb)
        },
        throughput: Array.from(throughputMap.values()),
        trimmerStats,
        costRatio,
        trimmerPerformance
    };
}

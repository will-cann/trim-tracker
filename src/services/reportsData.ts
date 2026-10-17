import { apiService } from './apiService';
import type { TrimSession } from '../types/definitions';

export interface ReportSummary {
    sessionCount: number;
    trimLaborHours: number;
    avgGramsPerHour: number;
    flowerTrimmedLbs: number;
    trimLbs: number;
    shakeLbs: number;
    avgHourlyWage: number;
}

export interface DailyThroughput {
    /** Day key for sorting (YYYY-MM-DD, local). */
    day: string;
    /** Axis label, e.g. "Mon 12". */
    date: string;
    flowerLbs: number;
    trimLbs: number;
    laborHours: number;
}

export interface TrimmerStat {
    id: string;
    name: string;
    totalGrams: number;
    flowerGrams: number;
    gramsPerHour: number;
    flowerRatio: number;
    laborHours: number;
}

export interface DateRange {
    start: Date;
    end: Date;
}

export interface ReportsData {
    summary: ReportSummary;
    throughput: DailyThroughput[];
    trimmerStats: TrimmerStat[];
    dateRange: DateRange;
    /** Earliest to latest completed session across all time, or null when there are none. */
    availableRange: DateRange | null;
}

export const DEFAULT_HOURLY_WAGE = 15;
const GRAMS_PER_LB = 453.592;

function shiftHours(startTime?: string | null, endTime?: string | null): number {
    if (!startTime || !endTime) return 0;
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const hours = (endHour + endMin / 60) - (startHour + startMin / 60);
    return hours > 0 ? hours : 0;
}

function calculateLaborHours(session: TrimSession): number {
    let total = 0;
    for (const entry of session.entries) {
        for (const trimmer of entry.trimmers ?? []) total += shiftHours(trimmer.startTime, trimmer.endTime);
    }
    return total;
}

/** Get the Monday..Sunday week containing `date` */
export function getWeekRange(date: Date): DateRange {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    const diffToMon = day === 0 ? -6 : 1 - day;
    const start = new Date(d);
    start.setDate(d.getDate() + diffToMon);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

export function shiftWeek(range: DateRange, direction: 1 | -1): DateRange {
    const start = new Date(range.start);
    start.setDate(start.getDate() + direction * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

/** "Oct 12 – 18, 2026", or "Sep 28 – Oct 4, 2026" across a month boundary. */
export function formatDateRange(range: DateRange): string {
    const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
    const sameMonth = range.start.getMonth() === range.end.getMonth() && range.start.getFullYear() === range.end.getFullYear();
    const start = `${month(range.start)} ${range.start.getDate()}`;
    const end = sameMonth ? `${range.end.getDate()}` : `${month(range.end)} ${range.end.getDate()}`;
    return `${start} – ${end}, ${range.end.getFullYear()}`;
}

export function isSameRange(a: DateRange, b: DateRange): boolean {
    return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
}

const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function getReportsData(dateRange?: DateRange): Promise<ReportsData> {
    const allSessions = await apiService.getCompletedSessionsStrict();

    const completedAt = allSessions.filter(s => s.completedAt).map(s => new Date(s.completedAt!).getTime());
    const availableRange: DateRange | null = completedAt.length
        ? { start: new Date(Math.min(...completedAt)), end: new Date(Math.max(...completedAt)) }
        : null;

    // Default to the week of the most recent session
    const effectiveRange = dateRange || (availableRange ? getWeekRange(availableRange.end) : getWeekRange(new Date()));

    const sessions = allSessions.filter(s => {
        if (!s.completedAt) return false;
        const t = new Date(s.completedAt).getTime();
        return t >= effectiveRange.start.getTime() && t <= effectiveRange.end.getTime();
    });

    if (sessions.length === 0) {
        return {
            summary: { sessionCount: 0, trimLaborHours: 0, avgGramsPerHour: 0, flowerTrimmedLbs: 0, trimLbs: 0, shakeLbs: 0, avgHourlyWage: DEFAULT_HOURLY_WAGE },
            throughput: [],
            trimmerStats: [],
            dateRange: effectiveRange,
            availableRange,
        };
    }

    const totalLaborHours = sessions.reduce((sum, s) => sum + calculateLaborHours(s), 0);
    const totalFlowerG = sessions.reduce((sum, s) => sum + s.totalFlower, 0);
    const totalTrimG = sessions.reduce((sum, s) => sum + s.totalTrim, 0);
    const totalShakeG = sessions.reduce((sum, s) => sum + s.totalShake, 0);
    const totalGrams = totalFlowerG + totalShakeG + totalTrimG;

    // Daily throughput, one row per calendar day with a session
    const throughputMap = new Map<string, DailyThroughput>();
    for (const session of sessions) {
        const at = new Date(session.completedAt!);
        const day = localDayKey(at);
        const existing = throughputMap.get(day) || {
            day,
            date: at.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
            flowerLbs: 0, trimLbs: 0, laborHours: 0,
        };
        existing.flowerLbs += session.totalFlower / GRAMS_PER_LB;
        existing.trimLbs += session.totalTrim / GRAMS_PER_LB;
        existing.laborHours += calculateLaborHours(session);
        throughputMap.set(day, existing);
    }
    const throughput = [...throughputMap.values()].sort((a, b) => a.day.localeCompare(b.day));

    // Per-trimmer totals
    const trimmerMap = new Map<string, { totalGrams: number; totalHours: number; totalFlower: number }>();
    for (const session of sessions) {
        for (const entry of session.entries) {
            for (const trimmer of entry.trimmers ?? []) {
                const existing = trimmerMap.get(trimmer.name) || { totalGrams: 0, totalHours: 0, totalFlower: 0 };
                existing.totalGrams += trimmer.flowerWeight + trimmer.shakeWeight + trimmer.trimWeight;
                existing.totalFlower += trimmer.flowerWeight;
                existing.totalHours += shiftHours(trimmer.startTime, trimmer.endTime);
                trimmerMap.set(trimmer.name, existing);
            }
        }
    }
    const trimmerStats: TrimmerStat[] = [...trimmerMap.entries()]
        .map(([name, s]) => ({
            id: name,
            name,
            totalGrams: s.totalGrams,
            flowerGrams: s.totalFlower,
            gramsPerHour: s.totalHours > 0 ? s.totalGrams / s.totalHours : 0,
            flowerRatio: s.totalGrams > 0 ? s.totalFlower / s.totalGrams : 0,
            laborHours: s.totalHours,
        }))
        .sort((a, b) => b.gramsPerHour - a.gramsPerHour || b.totalGrams - a.totalGrams);

    return {
        summary: {
            sessionCount: sessions.length,
            trimLaborHours: totalLaborHours,
            avgGramsPerHour: totalLaborHours > 0 ? totalGrams / totalLaborHours : 0,
            flowerTrimmedLbs: totalFlowerG / GRAMS_PER_LB,
            trimLbs: totalTrimG / GRAMS_PER_LB,
            shakeLbs: totalShakeG / GRAMS_PER_LB,
            avgHourlyWage: DEFAULT_HOURLY_WAGE,
        },
        throughput,
        trimmerStats,
        dateRange: effectiveRange,
        availableRange,
    };
}

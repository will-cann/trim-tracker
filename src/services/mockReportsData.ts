
export interface DailyReportData {
    date: string;
    trimLbs: number;
    flowerLbs: number;
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

export interface TrimmerPerformance {
    date: string;
    [trimmerName: string]: number | string; // Dynamic keys for trimmer names
}

export const mockReportsData = {
    summary: {
        trimLaborHours: 786,
        avgGramsPerHour: 68,
        flowerTrimmedLbs: 100,
        trimLbs: 23,
        avgHourlyWage: 15,
        estimatedLaborCost: 11790.45,
        avgLaborCostPerLb: 120.94
    },
    throughput: [
        { date: '9/19', trimLbs: 8, flowerLbs: 32, laborHours: 50 },
        { date: '9/20', trimLbs: 11, flowerLbs: 43, laborHours: 68 },
        { date: '9/21', trimLbs: 8, flowerLbs: 32, laborHours: 50 },
        { date: '9/22', trimLbs: 13, flowerLbs: 40, laborHours: 66 },
        { date: '9/23', trimLbs: 12, flowerLbs: 46, laborHours: 72 },
        { date: '9/24', trimLbs: 10, flowerLbs: 41, laborHours: 64 },
        { date: '9/25', trimLbs: 5, flowerLbs: 21, laborHours: 32 },
    ] as DailyReportData[],
    trimmerStats: [
        { id: '1', name: 'Alfonso Rima', gramsPerHour: 57.07, flowerRatio: 0.84, laborHours: 23.85, trend: 'up' },
        { id: '2', name: 'Ting Jing', gramsPerHour: 32.27, flowerRatio: 0.71, laborHours: 28.10, trend: 'down' },
        { id: '3', name: 'Longito Nguau', gramsPerHour: 57.43, flowerRatio: 0.79, laborHours: 27.32, trend: 'up' },
        { id: '4', name: 'Grover Brollin', gramsPerHour: 79.51, flowerRatio: 0.79, laborHours: 33.30, trend: 'up' },
        { id: '5', name: 'Anna Kroll', gramsPerHour: 57.07, flowerRatio: 0.84, laborHours: 23.85, trend: 'down' },
        { id: '6', name: 'Olivia Evans', gramsPerHour: 32.27, flowerRatio: 0.71, laborHours: 28.10, trend: 'down' },
    ] as TrimmerStat[],
    costRatio: [
        { date: '9/19', costPerLb: 180, flowerRatio: 90 },
        { date: '9/20', costPerLb: 260, flowerRatio: 66 },
        { date: '9/21', costPerLb: 200, flowerRatio: 82 },
        { date: '9/22', costPerLb: 250, flowerRatio: 64 },
        { date: '9/23', costPerLb: 290, flowerRatio: 62 },
        { date: '9/24', costPerLb: 240, flowerRatio: 78 },
        { date: '9/25', costPerLb: 100, flowerRatio: 76 },
    ] as CostMetric[],
    trimmerPerformance: [
        { date: '9/19', 'Brijimohan Mallick': 110, 'Ezequiel Dengra': 80, 'Leslee Moss': 80 },
        { date: '9/20', 'Brijimohan Mallick': 230, 'Ezequiel Dengra': 150, 'Leslee Moss': 105 },
        { date: '9/21', 'Brijimohan Mallick': 150, 'Ezequiel Dengra': 80, 'Leslee Moss': 70 },
        { date: '9/22', 'Brijimohan Mallick': 220, 'Ezequiel Dengra': 120, 'Leslee Moss': 98 },
        { date: '9/23', 'Brijimohan Mallick': 200, 'Ezequiel Dengra': 165, 'Leslee Moss': 85 },
        { date: '9/24', 'Brijimohan Mallick': 155, 'Ezequiel Dengra': 90, 'Leslee Moss': 155 },
        { date: '9/25', 'Brijimohan Mallick': 75, 'Ezequiel Dengra': 110, 'Leslee Moss': 145 },
    ]
};

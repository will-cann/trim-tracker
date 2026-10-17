/**
 * RoomLayoutView smoke test: renders a room grid from a mocked layout,
 * shows hot-spot cells and the planner's suggestions, and turns a
 * suggestion into a human task with a place_plants onCompleteAction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RoomLayout, HotspotSummary } from '../../../types/plantMap';
import { scoreHotspots, planMoves } from '../../../types/plantMap';

const mocks = vi.hoisted(() => ({
    getRoomLayout: vi.fn(),
    getHotspots: vi.fn(),
    setPlantPositions: vi.fn(),
    createTask: vi.fn(),
    createTasks: vi.fn(),
    updateRoom: vi.fn(),
    logPlantHealthEvent: vi.fn(),
    resolvePlantHealthEvents: vi.fn(),
}));

vi.mock('../../../services/apiService', () => ({ apiService: mocks }));

import { RoomLayoutView } from '../RoomLayoutView';
import { suggestionToTask } from '../MovePlannerPanel';

const NOW = Date.now();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function buildLayout(): RoomLayout {
    const rows = 2, cols = 4;
    const events = [
        { id: 'e1', plantId: 'p1', plantLabel: 'WC-F-001', strainName: 'Wedding Cake', roomId: 'r1', roomName: 'Flower 1', row: 0, col: 0,
          contaminant: 'botrytis', severity: 3, note: null, growthPhase: 'flowering', floweringDay: 45, status: 'active' as const, observedAt: daysAgo(1), resolvedAt: null },
    ];
    const plants = [
        { id: 'p1', label: 'WC-F-001', strainName: 'Wedding Cake', growthPhase: 'flowering' as const, row: 0, col: 0, plantHealth: 70, contaminants: ['botrytis'],
          floweringDate: daysAgo(45).slice(0, 10), targetHarvestDate: null, vegetativeDate: null, tag: null, feedProfile: 'Heavy', floweringDays: 63, stretchTrait: 'high' as const,
          activeIssues: [{ contaminant: 'botrytis', severity: 3, observedAt: daysAgo(1) }] },
        { id: 'p2', label: 'GEL-F-002', strainName: 'Gelato', growthPhase: 'flowering' as const, row: 0, col: 1, plantHealth: 100, contaminants: [],
          floweringDate: daysAgo(45).slice(0, 10), targetHarvestDate: null, vegetativeDate: null, tag: null, feedProfile: 'Medium', floweringDays: 59, stretchTrait: 'medium' as const, activeIssues: [] },
        { id: 'p3', label: 'ZK-F-001', strainName: 'Zkittlez', growthPhase: 'flowering' as const, row: null, col: null, plantHealth: 100, contaminants: [],
          floweringDate: daysAgo(10).slice(0, 10), targetHarvestDate: null, vegetativeDate: null, tag: null, feedProfile: 'Light', floweringDays: 56, stretchTrait: 'low' as const, activeIssues: [] },
    ];
    const cells = scoreHotspots(events.map(e => ({ row: e.row, col: e.col, contaminant: e.contaminant, severity: e.severity, observedAt: e.observedAt, status: e.status })), { rows, cols, now: NOW }).cells;
    const plan = planMoves({ id: 'r1', name: 'Flower 1', rows, cols, cells, plants: plants.map(p => ({
        id: p.id, label: p.label, strainName: p.strainName, row: p.row, col: p.col, growthPhase: p.growthPhase, floweringDate: p.floweringDate,
        floweringDays: p.floweringDays, stretchTrait: p.stretchTrait, feedProfile: p.feedProfile, activeIssues: p.activeIssues.map(i => ({ contaminant: i.contaminant, severity: i.severity })),
    })) }, { now: NOW });
    return {
        room: { id: 'r1', name: 'Flower 1', roomType: 'flower', capacity: 8, layoutRows: rows, layoutCols: cols },
        plants, events, cells, plan, otherRooms: [],
    };
}

const hotspots: HotspotSummary = {
    windowDays: null, contaminant: 'botrytis',
    rooms: [{ roomId: 'r1', roomName: 'Flower 1', roomType: 'flower', hasLayout: true, activeEvents: 1, eventsInWindow: 1, activePlants: 1, contaminants: { botrytis: 1 }, hottestCells: [{ row: 0, col: 0, score: 0.45, events: 1 }] }],
    strains: [{ strainName: 'Wedding Cake', events: 1, activeEvents: 1, plantsAffected: 1, plantsFlowered: 4, incidence: 0.25 }],
    totals: { active: 1, inWindow: 1, plantsWithActive: 1 },
};

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.getRoomLayout.mockResolvedValue(buildLayout());
    mocks.getHotspots.mockResolvedValue(hotspots);
    mocks.createTask.mockResolvedValue({ id: 't1' });
    mocks.setPlantPositions.mockResolvedValue({ success: true, placed: 1, cleared: 0, bumped: [] });
});

const rooms = [{ id: 'r1', name: 'Flower 1', room_type: 'flower', layout_rows: 2, layout_cols: 4 }];

describe('RoomLayoutView', () => {
    it('renders the grid, the active carrier and the planner suggestions', async () => {
        render(<RoomLayoutView rooms={rooms} onChanged={() => undefined} />);
        await waitFor(() => expect(mocks.getRoomLayout).toHaveBeenCalledWith('r1'));
        // Labels appear on the grid chip and again in the planner list.
        expect((await screen.findAllByText('WC-F-001')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('GEL-F-002').length).toBeGreaterThan(0);
        // Unplaced plant is listed off-grid.
        expect(screen.getByText(/Not on grid \(1\)/)).toBeTruthy();
        // Planner: the carrier should be isolated and its neighbour relocated.
        expect(screen.getByText('Isolate')).toBeTruthy();
        expect(screen.getByText('Relocate')).toBeTruthy();
        expect(screen.getByText(/Strain incidence/)).toBeTruthy();
        expect(screen.getByText('25%')).toBeTruthy();
    });

    it('applies a planner move through set-plant-positions', async () => {
        render(<RoomLayoutView rooms={rooms} onChanged={() => undefined} />);
        await screen.findByText('Isolate');
        const applyButtons = screen.getAllByText('Apply move');
        fireEvent.click(applyButtons[0]);
        await waitFor(() => expect(mocks.setPlantPositions).toHaveBeenCalled());
        const arg = mocks.setPlantPositions.mock.calls[0][0];
        expect(arg.roomId).toBe('r1');
        expect(arg.placements).toHaveLength(1);
        expect(arg.placements[0].plantId).toBe('p1');
    });

    it('opens the log-issue modal for a selected plant with bud rot preselected', async () => {
        render(<RoomLayoutView rooms={rooms} onChanged={() => undefined} />);
        await screen.findAllByText('GEL-F-002');
        // The grid chip is the button whose class marks it as a plant on the map.
        const chip = document.querySelector('.room-map-plant[title^="GEL-F-002"]') as HTMLElement;
        fireEvent.click(chip);
        fireEvent.click(screen.getByText(/Log issue \(1\)/));
        expect(await screen.findByText('Log plant health issue')).toBeTruthy();
        const select = screen.getByDisplayValue('Botrytis (bud rot)') as HTMLSelectElement;
        expect(select.value).toBe('botrytis');
    });
});

describe('suggestionToTask', () => {
    it('turns a relocate into a cultivation task that places the plant on completion', () => {
        const task = suggestionToTask({
            kind: 'relocate', priority: 'high', plantId: 'p2', plantLabel: 'GEL-F-002', strainName: 'Gelato', exposure: 0.6,
            from: { roomId: 'r1', roomName: 'Flower 1', row: 0, col: 1 }, to: { roomId: 'r2', roomName: 'Flower 2', row: 1, col: 3 }, reason: 'why',
        }, 'Flower 1');
        expect(task.title).toBe('Move GEL-F-002 from R1·2 to Flower 2 R2·4');
        expect(task.category).toBe('cultivation');
        expect(task.onCompleteAction).toEqual({ type: 'place_plants', data: { roomId: 'r2', roomName: 'Flower 2', placements: [{ plantId: 'p2', row: 1, col: 3 }] } });
    });

    it('turns a cull into an IPM task that destroys the plant on completion', () => {
        const task = suggestionToTask({
            kind: 'cull', priority: 'urgent', plantId: 'p1', plantLabel: 'WC-F-001', strainName: 'Wedding Cake', exposure: 1,
            from: { roomId: 'r1', roomName: 'Flower 1', row: 0, col: 0 }, to: null, reason: 'why',
        }, 'Flower 1');
        expect(task.category).toBe('ipm');
        expect(task.priority).toBe('urgent');
        expect(task.onCompleteAction?.type).toBe('destroy_plants');
    });
});

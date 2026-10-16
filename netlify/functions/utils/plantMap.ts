// Plant-map data builders shared by get-room-layout, get-hotspots and the
// AI's find_hotspots lookup. Everything is scoped by company_id.

import { sql } from './db';
import { scoreHotspots } from '../../../shared/plantMap/hotspots';
import type { HotspotEventInput } from '../../../shared/plantMap/hotspots';
import { planMoves } from '../../../shared/plantMap/movePlanner';
import type { PlannerPlant, PlannerRoom, MovePlan } from '../../../shared/plantMap/movePlanner';

export function toIso(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
}

export function serializeEvent(e: any) {
    return {
        id: e.id,
        plantId: e.plant_id ?? null,
        plantLabel: e.plant_label ?? null,
        strainName: e.strain_name ?? null,
        roomId: e.room_id ?? null,
        roomName: e.room_name ?? null,
        row: e.position_row ?? null,
        col: e.position_col ?? null,
        contaminant: e.contaminant,
        severity: e.severity,
        note: e.note ?? null,
        growthPhase: e.growth_phase ?? null,
        floweringDay: e.flowering_day ?? null,
        status: e.status,
        observedAt: toIso(e.observed_at),
        resolvedAt: e.resolved_at ? toIso(e.resolved_at) : null,
    };
}

export type ActiveIssue = { contaminant: string; severity: number; observedAt: string };

export interface RoomLayoutData {
    room: { id: string; name: string; roomType: string | null; capacity: number | null; layoutRows: number | null; layoutCols: number | null };
    plants: any[];
    events: any[];
    cells: ReturnType<typeof scoreHotspots>['cells'];
    plan: MovePlan;
    otherRooms: Array<{ id: string; name: string; emptyCells: number }>;
}

/** Room grid + plants + event history + hot-spot surface + move plan. Returns null when the room isn't the company's. */
export async function buildRoomLayout(companyId: string, roomId: string): Promise<RoomLayoutData | null> {
    const { rows: roomRows } = await sql`
        SELECT id, name, room_type, capacity, layout_rows, layout_cols
        FROM rooms
        WHERE id = ${roomId}::uuid AND company_id = ${companyId}
    `;
    const room = roomRows[0];
    if (!room) return null;

    // Sibling rooms of the same type that have a grid — candidate destinations.
    const { rows: siblingRows } = await sql`
        SELECT id, name, room_type, layout_rows, layout_cols
        FROM rooms
        WHERE company_id = ${companyId}
          AND id != ${roomId}::uuid
          AND room_type IS NOT DISTINCT FROM ${room.room_type}
          AND layout_rows IS NOT NULL AND layout_cols IS NOT NULL
        ORDER BY name
    `;
    const roomIds = [room.id, ...siblingRows.map((r: any) => r.id)];

    const { rows: plantRows } = await sql`
        SELECT
            p.id, p.label, p.strain_name, p.room_id, p.growth_phase,
            p.position_row, p.position_col, p.plant_health, p.contaminants,
            p.vegetative_date::text AS vegetative_date,
            p.flowering_date::text AS flowering_date,
            p.target_harvest_date::text AS target_harvest_date,
            p.tag,
            s.feed_profile, s.default_flowering_days, s.stretch_trait
        FROM plants p
        LEFT JOIN strains s ON s.company_id = p.company_id AND LOWER(s.name) = LOWER(p.strain_name)
        WHERE p.company_id = ${companyId}
          AND p.room_id = ANY(${roomIds}::uuid[])
          AND p.growth_phase IN ('vegetative', 'flowering')
        ORDER BY p.position_row NULLS LAST, p.position_col NULLS LAST, p.strain_name, p.label
    `;

    const { rows: eventRows } = await sql`
        SELECT
            e.id, e.plant_id, e.plant_label, e.strain_name, e.room_id, e.room_name,
            e.position_row, e.position_col, e.contaminant, e.severity, e.note,
            e.growth_phase, e.flowering_day, e.status,
            e.observed_at, e.resolved_at
        FROM plant_health_events e
        WHERE e.company_id = ${companyId}
          AND e.room_id = ANY(${roomIds}::uuid[])
        ORDER BY e.observed_at DESC
    `;

    // Active issues per plant: one entry per contaminant, worst severity wins.
    const activeByPlant = new Map<string, ActiveIssue[]>();
    for (const e of eventRows) {
        if (e.status !== 'active' || !e.plant_id) continue;
        const list = activeByPlant.get(e.plant_id) ?? [];
        const existing = list.find(i => i.contaminant === e.contaminant);
        if (existing) {
            if (e.severity > existing.severity) existing.severity = e.severity;
        } else {
            list.push({ contaminant: e.contaminant, severity: e.severity, observedAt: toIso(e.observed_at) });
        }
        activeByPlant.set(e.plant_id, list);
    }

    const toPlannerPlant = (p: any): PlannerPlant => ({
        id: p.id,
        label: p.label,
        strainName: p.strain_name,
        row: p.position_row,
        col: p.position_col,
        growthPhase: p.growth_phase,
        floweringDate: p.flowering_date,
        floweringDays: p.default_flowering_days ?? null,
        stretchTrait: p.stretch_trait ?? null,
        feedProfile: p.feed_profile ?? null,
        activeIssues: (activeByPlant.get(p.id) ?? []).map(i => ({ contaminant: i.contaminant, severity: i.severity })),
    });

    const toHotspotEvent = (e: any): HotspotEventInput => ({
        row: e.position_row,
        col: e.position_col,
        contaminant: e.contaminant,
        severity: e.severity,
        observedAt: toIso(e.observed_at),
        status: e.status,
    });

    const buildPlannerRoom = (r: any): PlannerRoom => {
        const rows = r.layout_rows ?? 0;
        const cols = r.layout_cols ?? 0;
        const plants = plantRows.filter((p: any) => p.room_id === r.id).map(toPlannerPlant);
        const events = eventRows.filter((e: any) => e.room_id === r.id).map(toHotspotEvent);
        const cells = rows && cols ? scoreHotspots(events, { rows, cols }).cells : [];
        return { id: r.id, name: r.name, rows, cols, plants, cells };
    };

    const thisRoom = buildPlannerRoom(room);
    const otherRooms = siblingRows.map(buildPlannerRoom);
    const plan: MovePlan = thisRoom.rows && thisRoom.cols
        ? planMoves(thisRoom, { otherRooms })
        : { roomId: room.id, suggestions: [], avoidCells: [], summary: { plantsWithActiveSpread: 0, plantsAtRisk: 0, emptySafeCells: 0, emptyHotCells: 0 } };

    return {
        room: {
            id: room.id,
            name: room.name,
            roomType: room.room_type ?? null,
            capacity: room.capacity ?? null,
            layoutRows: room.layout_rows ?? null,
            layoutCols: room.layout_cols ?? null,
        },
        plants: plantRows.filter((p: any) => p.room_id === room.id).map((p: any) => ({
            id: p.id,
            label: p.label,
            strainName: p.strain_name,
            growthPhase: p.growth_phase,
            row: p.position_row,
            col: p.position_col,
            plantHealth: p.plant_health,
            contaminants: p.contaminants ?? [],
            floweringDate: p.flowering_date,
            targetHarvestDate: p.target_harvest_date,
            vegetativeDate: p.vegetative_date,
            tag: p.tag ?? null,
            feedProfile: p.feed_profile ?? null,
            floweringDays: p.default_flowering_days ?? null,
            stretchTrait: p.stretch_trait ?? null,
            activeIssues: activeByPlant.get(p.id) ?? [],
        })),
        events: eventRows.filter((e: any) => e.room_id === room.id).map(serializeEvent),
        cells: thisRoom.cells,
        plan,
        otherRooms: otherRooms.map(r => ({
            id: r.id,
            name: r.name,
            emptyCells: r.rows * r.cols - r.plants.filter(p => p.row != null && p.col != null).length,
        })),
    };
}

export interface HotspotSummaryOptions {
    /** Window in days; null = all time. */
    days: number | null;
    /** Contaminant key; null = every spreading contaminant. */
    contaminant: string | null;
}

/** Facility-wide: per room and per strain, where and on what the trouble is. */
export async function buildHotspotSummary(companyId: string, opts: HotspotSummaryOptions) {
    const { days, contaminant } = opts;

    const { rows: rooms } = await sql`
        SELECT id, name, room_type, layout_rows, layout_cols
        FROM rooms WHERE company_id = ${companyId}
        ORDER BY name
    `;

    const { rows: events } = await sql`
        SELECT e.room_id, e.position_row, e.position_col, e.contaminant, e.severity,
               e.status, e.observed_at, e.plant_id, e.strain_name
        FROM plant_health_events e
        WHERE e.company_id = ${companyId}
          AND (${contaminant}::text IS NULL OR e.contaminant = ${contaminant}::text)
          AND (e.status = 'active' OR ${days}::int IS NULL OR e.observed_at >= NOW() - (${days}::int * INTERVAL '1 day'))
    `;

    // Denominator for strain incidence: plants that were flowering at some point in the window.
    const { rows: flowered } = await sql`
        SELECT strain_name, COUNT(*)::int AS n
        FROM plants
        WHERE company_id = ${companyId}
          AND flowering_date IS NOT NULL
          AND growth_phase IN ('flowering', 'harvested')
          AND (${days}::int IS NULL OR COALESCE(harvested_date, CURRENT_DATE) >= CURRENT_DATE - ${days}::int)
        GROUP BY strain_name
    `;
    const floweredByStrain = new Map<string, number>(flowered.map((r: any) => [String(r.strain_name).toLowerCase(), r.n]));

    const { rows: activePlants } = await sql`
        SELECT room_id, COUNT(DISTINCT plant_id)::int AS n
        FROM plant_health_events
        WHERE company_id = ${companyId} AND status = 'active' AND plant_id IS NOT NULL
          AND (${contaminant}::text IS NULL OR contaminant = ${contaminant}::text)
        GROUP BY room_id
    `;
    const activePlantsByRoom = new Map<string, number>(activePlants.map((r: any) => [r.room_id, r.n]));

    const now = Date.now();
    const windowMs = days ? days * 86_400_000 : null;
    const inWindow = (e: any) => windowMs == null || now - Date.parse(toIso(e.observed_at)) <= windowMs;

    const roomSummaries = rooms.map((r: any) => {
        const mine = events.filter((e: any) => e.room_id === r.id);
        const counts: Record<string, number> = {};
        for (const e of mine) counts[e.contaminant] = (counts[e.contaminant] ?? 0) + 1;
        const hasLayout = !!(r.layout_rows && r.layout_cols);
        let hottest: Array<{ row: number; col: number; score: number; events: number }> = [];
        if (hasLayout) {
            const { cells } = scoreHotspots(
                mine.map((e: any) => ({ row: e.position_row, col: e.position_col, contaminant: e.contaminant, severity: e.severity, observedAt: toIso(e.observed_at), status: e.status })),
                { rows: r.layout_rows, cols: r.layout_cols, now, contaminants: contaminant ? [contaminant] : null },
            );
            hottest = cells
                .filter(c => c.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(c => ({ row: c.row, col: c.col, score: Math.round(c.score * 100) / 100, events: c.events }));
        }
        return {
            roomId: r.id,
            roomName: r.name,
            roomType: r.room_type ?? null,
            hasLayout,
            activeEvents: mine.filter((e: any) => e.status === 'active').length,
            eventsInWindow: mine.filter(inWindow).length,
            activePlants: activePlantsByRoom.get(r.id) ?? 0,
            contaminants: counts,
            hottestCells: hottest,
        };
    }).filter(r => r.activeEvents > 0 || r.eventsInWindow > 0 || r.hasLayout);

    const byStrain = new Map<string, { strainName: string; events: number; activeEvents: number; plants: Set<string> }>();
    for (const e of events) {
        if (!e.strain_name) continue;
        const key = String(e.strain_name).toLowerCase();
        let s = byStrain.get(key);
        if (!s) {
            s = { strainName: e.strain_name, events: 0, activeEvents: 0, plants: new Set() };
            byStrain.set(key, s);
        }
        if (inWindow(e)) s.events++;
        if (e.status === 'active') s.activeEvents++;
        if (e.plant_id) s.plants.add(e.plant_id);
    }
    const strains = [...byStrain.entries()].map(([key, s]) => {
        const floweredN = floweredByStrain.get(key) ?? 0;
        return {
            strainName: s.strainName,
            events: s.events,
            activeEvents: s.activeEvents,
            plantsAffected: s.plants.size,
            plantsFlowered: floweredN,
            incidence: floweredN > 0 ? Math.min(1, s.plants.size / floweredN) : null,
        };
    }).sort((a, b) => (b.incidence ?? -1) - (a.incidence ?? -1) || b.events - a.events);

    const plantsWithActive = new Set(events.filter((e: any) => e.status === 'active' && e.plant_id).map((e: any) => e.plant_id)).size;

    return {
        windowDays: days,
        contaminant,
        rooms: roomSummaries,
        strains,
        totals: {
            active: events.filter((e: any) => e.status === 'active').length,
            inWindow: events.filter(inWindow).length,
            plantsWithActive,
        },
    };
}

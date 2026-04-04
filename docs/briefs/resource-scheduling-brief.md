# Product Brief: Resource Scheduling System

**Date:** 2026-04-03
**Status:** Design
**Depends on:** Extraction workspace (built), Cultivation SOPs (planned), Facility view (roadmap)

---

## Problem Statement

Operations managers have no visibility into when shared resources (equipment, rooms, benches, drying racks) are occupied, available, or overbooked. Scheduling is done mentally or on whiteboards. When extraction runs, plant batch cycles, and harvest drying overlap, conflicts surface as surprises — a freeze dryer promised to two runs, a veg room double-booked, trim stations understaffed.

This problem repeats across every domain in the facility. Extraction needs equipment timelines. Cultivation needs room/bench occupancy. Harvest needs drying rack and trim station capacity. The underlying question is always the same: **what resource is occupied by what task, and when is it free?**

## Goal

Build a single, reusable scheduling component that any domain can wire into. Start with extraction equipment (data exists today), design so cultivation rooms and harvest resources plug in with zero rework on the visualization.

## Core Abstraction

Every schedulable thing in the facility maps to one shape:

```
ResourceBlock {
  resourceId      — which resource (equipment, room, bench, rack)
  resourceName    — display name
  resourceGroup   — grouping label (e.g., "Extraction", "Veg Rooms", "Drying")
  blockStart      — ISO timestamp (actual or projected)
  blockEnd        — ISO timestamp (actual or projected)
  label           — what's occupying it ("OGK Live Rosin - Wash", "Batch #12 - Veg")
  status          — planned | active | completed | maintenance
  color           — domain/process color
  linkTo          — navigation target { view, id } so clicking opens the source
  isProjected     — true if computed from estimates, false if actual timestamps
}
```

Resources are grouped by domain. Each domain provides a data adapter that maps its entities into `ResourceBlock[]`.

## Domain Adapters

### 1. Extraction Equipment (build now)
- **Resources:** equipment entries (wash vessel, freeze dryer, rosin press, etc.)
- **Blocks:** extraction run steps that have an `equipmentId`
  - `blockStart`: step's `startedAt` if active/completed, else projected from run's `plannedStart` + cumulative `estDurationHours` of prior steps
  - `blockEnd`: step's `completedAt` if completed, else `blockStart + estDurationHours`
  - `status`: maps from run step status (pending→planned, active→active, completed→completed)
  - `label`: "{run name} - {step name}"
  - `color`: process type color (solventless blue, BHO orange, etc.)

### 2. Cultivation Rooms/Benches (wire later)
- **Resources:** rooms and benches from plant map
- **Blocks:** plant batches occupying a room for a growth phase
  - Projected from SOP template step durations once cultivation SOPs are built
  - Shows veg/flower/dry cycles per room

### 3. Harvest / Drying (wire later)
- **Resources:** drying racks, trim stations, packaging stations
- **Blocks:** harvests in drying status, trim sessions, packaging runs

## Component Design

### `ResourceTimeline` (the reusable core)

**Props:**
- `resources: Resource[]` — Y-axis items with id, name, group
- `blocks: ResourceBlock[]` — the occupancy data
- `range: { start: Date, end: Date }` — visible window
- `view: 'week' | 'month'` — time scale
- `onBlockClick?: (block) => void` — navigation callback
- `onRangeChange?: (range) => void` — for scroll/pagination

**Visual spec:**
- Y-axis: resource names, grouped by `resourceGroup` with collapsible headers
- X-axis: time, with day columns (week view) or week columns (month view)
- Blocks: horizontal bars spanning their time range, colored by status/domain
- Today marker: vertical line
- Projected blocks: dashed border or lower opacity to distinguish from actual
- Empty rows: visible (shows the resource is free — that's useful information)
- Hover: tooltip with label, time range, status
- Click: navigates to source entity

**Interactions:**
- Week/month toggle
- Scroll horizontally through time (arrow buttons or drag)
- Click block → navigate to run/batch/harvest
- No drag-to-reschedule (v1 — read-only timeline)

### Data flow

```
Domain data (runs, batches, harvests)
  → Adapter function (per domain)
  → ResourceBlock[]
  → ResourceTimeline component
```

Each adapter is a pure function: `(domainData, resources) => ResourceBlock[]`. No API changes needed — the component is entirely frontend, computing projections from existing data.

## Extraction Wiring (v1 scope)

1. Fetch extraction runs (all statuses) + equipment list
2. `extractionAdapter(runs, equipment) → ResourceBlock[]` by iterating run steps with equipment assignments
3. Render `ResourceTimeline` with equipment as resources, grouped by equipment type
4. Add as a new tab or section in the Extraction Dashboard ("Schedule")
5. Block click navigates to RunDetail

### Projection logic for planned runs

For a run with `plannedStart` and steps that haven't started yet:
```
step1.start = run.plannedStart
step1.end   = step1.start + step1.estDurationHours
step2.start = step1.end
step2.end   = step2.start + step2.estDurationHours
...
```

For active runs, use actual `startedAt`/`completedAt` on completed steps, then project remaining steps from the last completed step's `completedAt`.

## Non-Goals (v1)

- Drag-to-reschedule
- Conflict resolution (highlight overlaps, don't resolve them)
- Resource allocation optimization
- Print/export
- Mobile layout (desktop-first, adapt later)

## Success Criteria

- Equipment utilization visible at a glance for the current and next 2 weeks
- Scheduling conflicts (two runs claiming the same equipment at the same time) are visually obvious
- Component accepts any resource type — no extraction-specific code in the chart itself
- Adding cultivation room scheduling later requires only a new adapter function, no chart changes

## Technical Notes

- No external Gantt library — custom CSS grid. The interaction set (read-only, click-to-navigate) doesn't justify the dependency weight. If drag-to-reschedule becomes a requirement, re-evaluate.
- Use `estDurationHours` (equipment/total time) for block duration, not `estHandsOnHours` — the chart shows resource occupancy, not labor.
- Time math: use native `Date` — no moment/dayjs needed for week/month arithmetic.

# Trim Sessions

**Elevator pitch:** One live session — multiple batches, assigned trimmers, flower/shake/trim/waste weighed as you go, unfinished work rolls over.

## Who it's for

Trim technicians, trim leads/managers; post-harvest for bin handoff; packaging for package creation.

**Nav:** Trim · Department: trim

## Problem

Trim floors lose accountability: who trimmed what, how much landed as flower vs shake vs waste, and what unfinished work carries to the next shift.

## Value

Session + multi-batch + per-trimmer weight accounting on one screen. Rollover keeps overnight work without re-keying. Direct loop from harvest bins → trim → packages.

## Key capabilities (shipped)

- Active trim session dashboard (one active session model in AI context)
- Multi-batch entries: upcoming → active → submitted
- Per-entry: harvest name, strain, license, start weight, moisture-loss fields
- Trimmer roster (profiles) + assignment with start/end, scissors vs machine
- Per-trimmer weights: flower, shake, trim, waste; session totals and stacked progress
- Batch start / submit / revert
- Session submit with rollover of unfinished upcoming/active entries into a new session
- Pull ready harvest bins into trim
- Create packages from trimmed material
- Feeds Reports trimmer performance charts

## Status workflows

Entry: upcoming → active → submitted  
Session: open → submitted; unfinished entries roll into the next session

## Demo script

1. Start a session from a drying harvest or ready bin; add a second upcoming batch.
2. Assign two trimmers (scissors + machine); enter flower/shake; watch the stacked bar fill.
3. Submit one batch; submit the session — show unfinished batches rolling over.
4. Voice: "Add Maria to the Gelato batch with scissors."
5. Create a flower package from submitted trim output.

## Talking points

- "Every gram lands in flower, shake, trim, or waste — per person."
- "Shift ends mid-batch? Rollover keeps the queue without a spreadsheet rebuild."
- "Same voice loop as harvest day — assign labor out loud."

## Differentiators

- Multi-batch session with per-trimmer accounting
- Rollover for unfinished overnight work
- Bin → trim → package continuity in one product

## Do not claim

- Full payroll / piece-rate / timeclock system
- Live METRC package or transfer auto-submit from trim
- Hardware scale integration (tablet entry and voice propose-confirm)
- Moisture loss as a prominent Trim UI feature (exists on the data model)

## Related modules

[Harvest Pipeline](./harvest-pipeline.md) · [Packaging & Compliance](./packaging-compliance.md) · [Reports & Analytics](./reports-analytics.md) · [Team & Roles](./team-roles.md)

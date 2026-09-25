# Extraction

**Elevator pitch:** Template the process, start the run from inventory, check in weights on steps, finish into packages — plan washes backward from finished goods.

## Who it's for

Extraction technicians and managers; production planners; procurement when planning shows biomass or supply gaps.

**Nav:** Extraction · Department: extraction (feature-flagged with extraction workspace)

## Problem

Extraction floors run multi-step SOPs (wash → freeze-dry → press → carts) on paper yield sheets with no live link from biomass inventory to finished concentrate.

## Value

SOP-templated multi-step runs with inventory-linked inputs and outputs. Start a wash without knowing final hash yield. Plan backward from cart targets to biomass gaps. Voice understands wash / hash / press / carts vocabulary.

## Key capabilities (shipped)

- Dashboard tabs: Runs, Processes (SOP templates), Planning
- Process templates: solventless / BHO / distillate / custom; accepted inputs, producible outputs, step list (duration, equipment type, weight/timestamp requirements)
- 18+ preset extraction SOPs seeded per company
- Runs: planned → active → completed | cancelled; kanban/list + detail
- Start run from template + optional source packages (outputs not required to start); equipment assignment
- Active run: wall-clock virtual schedule from start + step durations; inline weight check-ins on weight-required steps
- Finish run → output packages; yield tracking; multi-source inputs; amend inputs mid-run
- Planning calculator: backward plan from target products → biomass/supply gaps; save planning sessions; kick off stage runs
- Equipment registry (wash vessel, freeze dryer, rosin press, etc.)

## Status workflows

Run: planned → active → completed | cancelled  
Step: pending → active → completed | skipped

## Demo script

1. Start a wash from fresh-frozen packages without entering final hash yield.
2. Show the step timeline; enter wash output weight on the weight-required step.
3. Ambient / chat: "also add Blue Dream" → amend inputs on the same run.
4. Planning: target ~200 live rosin carts → show biomass gap → Start Run prefilled.
5. Finish run → show bubble hash / rosin package in inventory.

## Talking points

- "Start the wash when you pull biomass — finish the package when you know the yield."
- "Planning works backward from finished goods, not just forward from freezer weight."
- "Multi-strain amend mid-run matches how extractors actually talk on the floor."

## Differentiators

- SOP-templated runs with inventory-linked I/O
- Backward production planner (variety filters, yield history, supply gaps)
- Voice lifecycle for solventless vocabulary
- Same confirm loop as cultivation and harvest

## Do not claim

- Solvent inventory / closed-loop regulatory reporting automation
- Live METRC sync for concentrate packages
- Hard time-gating of every step (weight steps are the hard gate; schedule is virtual)
- That outputs must be entered before a run can start (that old gate is gone — do not reintroduce it in demos)

## Related modules

[Harvest Pipeline](./harvest-pipeline.md) · [Packaging & Compliance](./packaging-compliance.md) · [SOPs](./sops.md) · [Supplies](./supplies.md) · [Ordering & Procurement](./ordering-procurement.md)

# Product Brief: Extraction & Concentrate Tracking

**Date:** 2026-03-30
**Source:** SME call with extractor (ice water hash / rosin / rosin carts)
**Status:** Discovery

---

## Problem Statement

Extractors currently have no streamlined way to track the multi-stage manufacturing process from fresh frozen cannabis to finished concentrate products. METRC compliance is handled manually by office staff who struggle with the math of partial inventory draws and yield reporting. There is no live inventory visibility across production stages, leading to stockouts, ordering delays, and compliance gaps.

## User Profile

- **Role:** Extractor / Lab Director
- **Process:** Ice water extraction (fresh frozen -> bubble hash -> rosin -> optionally rosin cartridges)
- **Scale:** Works across multiple facilities ranging from 4-person nano-ops to larger vertically integrated operations
- **Current tooling:** METRC (reluctantly, often not directly), mental math, phone notes, an admin who does data entry (poorly)

## Core Workflow: Fresh Frozen to Finished Product

### Stage 1: Fresh Frozen Inventory (input)
- Grow team harvests and freezes cannabis in bags, ideally in consistent batch increments (e.g., 17,000g per strain)
- Stored in freezer, visually organized by strain / section
- **Pain point:** Grow teams don't always hit target weights, resulting in awkward partial batches or forced strain mixing
- **Pain point:** No scanning/tagging on bags currently; identification is visual

### Stage 2: Wash (ice water extraction)
- Extractor pulls a batch of fresh frozen (e.g., 17,000g of one strain)
- Remaining fresh frozen inventory must be adjusted (e.g., 20,000g - 17,000g = 3,000g remaining)
- Wash produces bubble hash (wet weight, then freeze-dried)
- **Pain point:** This is where METRC compliance breaks down -- the admin can't handle the subtraction + new package creation

### Stage 3: Bubble Hash (intermediate)
- Bubble hash comes out of freeze dryer
- May sit in inventory over a weekend before pressing
- Typical volume: ~800g in freezer at any time

### Stage 4: Press (rosin production)
- Bubble hash is pressed into rosin
- Yield is tracked per strain (e.g., 17,000g fresh frozen -> ~550g rosin)
- Typical volume: ~1,800g being pressed or ready to press
- **Key metric:** Yield percentage by strain (drives plant ordering decisions and cost analysis)

### Stage 5: Cartridge Production (optional value-add)
- Rosin is converted into cartridges
- Takes 5-8 days (but SME notes actual time is often 9-14 days)
- Typical volume: ~1,000g being converted at any time
- Requires supply chain inputs: empty carts, press bags, parchment/silicone paper

### Stage 6: Distribution / Sales
- Finished carts need order fulfillment tracking
- "1,100 carts on hand, orders for 1,400 -- where are they all going?"
- Cannabis-specific constraint: you must deliver what you have when you say you have it

## Feature Requirements

### P0: Core Manufacturing Tracker

1. **Multi-stage inventory view**
   - See quantities at each production stage (frozen, washing, hash, pressing, rosin, filling, finished carts)
   - Per-strain visibility at every stage
   - Live/near-real-time updates

2. **Batch tracking with yield**
   - Record: input strain, input weight, output weight, yield %
   - Historical yield data per strain for analysis
   - Cost impact visibility (what happens when batches aren't optimal sizes)

3. **Ambient/voice input at stopping points**
   - 4-5 natural stopping points in the workflow where the extractor can quickly log state
   - Voice: "I pulled 17,000 grams of blackberry, it yielded 500 grams of rosin"
   - App generates a list of proposed system actions for confirmation
   - Doesn't have to do everything -- saving significant time on data entry is the win

4. **METRC package creation & adjustment**
   - When fresh frozen is pulled, adjust source package and create new production batch package
   - When rosin is produced, create new package with yield
   - When carts are filled, create finished good packages
   - Goal: extractor never has to log into METRC directly

### P1: Supply Chain & Reorder Alerts

5. **Recipe / Bill of Materials**
   - Define product recipes (e.g., 1 rosin cart = 0.5g rosin + 1 empty cart hardware)
   - Auto-adjust inventory when a production batch is logged

6. **Smart reorder alerts**
   - Track consumption rate of supplies (empty carts, press bags, parchment paper)
   - Alert when stock drops below threshold based on actual lead times
   - Learn from historical patterns: "you say 5-8 days but it's actually 9-14 days 60% of the time"
   - Lab techs can trigger reorders without calling the boss (with approval guardrails / spend limits)

### P2: Analytics & Optimization

7. **Strain-level economics**
   - Yield % by strain over time
   - Cost per gram of rosin by strain
   - Impact analysis: "what does it cost when we don't freeze in optimal increments?"

8. **Harvest-to-extraction handoff**
   - Fresh frozen target quantities visible to harvest team
   - Alerts/blocks when target weight is hit during harvest packaging
   - Prevent over-filling (visual indicators, acknowledgment gates)

9. **Cycle time tracking**
   - Actual time at each stage vs. planned
   - Identify bottlenecks

### P3: Integrations

10. **METRC API** -- full bidirectional sync for package creation, adjustments, transfers
11. **Total Grow** -- integration with this cultivation management system (mentioned as widely adopted)
12. **Barcode scanning** -- scan fresh frozen bags to identify batches (USB scanner or phone camera)

## Scale Considerations

| Operation Size | Primary Need | Complexity |
|---|---|---|
| **Nano (Fusion, 4 people)** | METRC compliance automation, basic inventory | Low -- just needs voice-in, METRC-out |
| **Small (Hybrid)** | Wholesale + packaged carts, inventory + orders | Medium -- add supply chain tracking |
| **Medium (Cherry)** | Grow + harvest + extraction teams, full visibility | Medium-high -- multi-team coordination |
| **Large (Buffalo/Maryland)** | Full manufacturing ERP, multiple product lines | High -- full feature set |

The product should start simple enough for nano-ops (the "just talk to it" model) and scale up to support larger operations without requiring a different system.

## Ambient Input Design

The core UX insight from this conversation: **the extractor doesn't want to do data entry.** The ideal interaction is:

1. Extractor reaches a natural stopping point (end of wash, end of press, leaving for weekend)
2. Opens NeuroCann, hits record
3. Talks through what happened: strains, weights, yields, what's where
4. App presents proposed actions (inventory adjustments, METRC package operations, task assignments)
5. Extractor confirms or adjusts
6. System executes

This mirrors the ambient trim tracking already in development -- same pattern, different domain vocabulary.

## Key Quotes

> "If I could just vocally say like, hey, I pulled 17,000 grams of blackberry and it yielded 500 -- being able to go into METRC and execute that for me"

> "Anytime I'm at a stopping point... if I could communicate that pretty quickly and not have to actually fully sit down and get into METRC and do the stupid... that would save a lot of time and help me be compliant, which is really important to the big guys"

> "It doesn't have to do it all. If it's just saving a lot of time, little things like that really can pay dividends"

> "You want to empower your people in the trenches doing the labor... you don't need to call me to order carts"

## Open Questions

- [ ] Exact METRC package types and API calls for extraction/manufacturing
- [ ] Total Grow API availability and documentation
- [ ] Cart filling process details (hardware types, fill volumes, curing time)
- [ ] How does testing/COA fit into the workflow? (mentioned briefly re: packaging)
- [ ] Multi-strain mixing rules -- currently avoided due to complexity, but may be needed

## Design Philosophy

The SME said "don't build on hypotheticals" -- but hash making is a well-understood process, METRC package creation for concentrates is universal, and ambient voice input is NeuroCann's core differentiator. The user is the expert on the problem, not on the solution. Our job is to build what he needs without him having to ask for it. His feedback will refine, not define, the workflow.

## Next Steps

1. **Build extraction package creation** -- this is universal METRC workflow, not hypothetical
2. **Extend ambient input to extraction vocabulary** -- reuse existing infrastructure, add extraction-specific intents
3. **Sketch the stopping-point workflow** -- map the 4-5 natural input moments
4. **Research METRC manufacturing/processing API endpoints**
5. **Research Total Grow API** for potential integration
6. **Use SME feedback to refine** -- when he's in the lab, validate and iterate on what's already built

# Supplies

**Elevator pitch:** Par-level inventory for non-cannabis consumables across extraction, cultivation, and facility pools.

## Who it's for

Extraction, cultivation, and facility ops who burn through bags, solvents, nutrients, PPE, and hardware.

**Nav:** Supplies · Universal access

## Problem

Cannabis inventory gets tracked; consumables don't. Stockouts stop a wash or a planting because nobody owned the rockwool count.

## Value

Pools with quantity on hand, par, reorder qty, vendor/SKU/cost, and a ledger for receive / consume / adjust / waste. Low/out badges. SOP steps can declare supply requirements.

## Key capabilities (shipped)

- Pools: extraction / cultivation / facility
- Items: QOH, par, reorder qty, vendor linkage, SKU, cost
- Ledger: receive, consume, adjust, waste
- Low / out badges
- SOP step ↔ supply requirements table support
- Planning / backward extraction planning can surface supply gaps

## Demo script

1. Open Supplies → show a low-stock extraction item.
2. Receive a shipment; show ledger entry.
3. Point at SOP / extraction planning that references the same supply.

## Talking points

- "Cannabis packages and consumables aren't the same ledger — Supplies is for the stuff that isn't flower."
- "Par levels turn 'we ran out of press bags' into a reorder signal."

## Differentiators

- Tied to extraction/cultivation SOP requirements
- Sits beside Ordering vendors for restock context

## Do not claim

- Automatic decrement from every floor action unless step requirements are wired into a specific run completion path
- Full ERP purchasing / AP
- That Supplies replaces Ordering for multi-store retail product POs

## Related modules

[Ordering & Procurement](./ordering-procurement.md) · [Extraction](./extraction.md) · [SOPs](./sops.md)

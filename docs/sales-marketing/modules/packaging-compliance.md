# Packaging & Compliance

**Elevator pitch:** Track finished cannabis inventory from trim and extraction through lab status, audited quantity changes, and plant/package tags — without leaving the floor workflow.

## Who it's for

Post-harvest, extraction, lab, and compliance teams.

**Nav:** Packages · Departments: post_harvest, extraction, lab  
**Also:** Tag List view; tag settings under Settings

## Problem

Finished goods live in spreadsheets or a disconnected METRC-only UI. Weight adjustments lack an audit trail. Tags for plants, batches, and packages aren't managed as one pool.

## Value

Packages sit in the same AI/voice action loop as harvest and trim. Adjustment ledger uses METRC-aligned reason codes. Tag pool covers plant, batch, and package assignment — ready for sync when the API lands.

## Key capabilities (shipped)

- Package inventory: card/table, filters (type/strain/status), search, sort
- Create packages: flower, trim, shake, fresh_frozen, bubble_hash, rosin, rosin_cart; multi-row create from trim prefill
- Detail: edit location / lab / notes / item name; hold / resume; finish; delete (admin/director)
- Lab testing states: not_submitted → submitted → passed | failed
- Audited quantity adjustments with METRC-aligned reasons (Waste, Moisture Loss, Processing Loss, Theft, Reconciliation)
- Tag pool: plant / batch / package types; available / assigned / voided
- Tag settings: enable/disable, auto-generate vs CSV upload, phase trigger (nursery→veg / veg→flower), batch-tag requirement, prefix/counter
- Assign/unassign tags on packages; Tag List browse; import/void from Settings
- METRC-oriented fields: item catalog hints, production batch / trade sample / donation flags, source labels, synced-at display field

## Status workflows

Package: active → on_hold → active (resume) → finished  
Lab: not_submitted → submitted → passed | failed  
Tag: available → assigned | voided

## Demo script

1. Create packages from a finished trim session in one multi-row modal.
2. Put a package on hold; adjust quantity for moisture loss; show the audit trail.
3. Assign a METRC-style tag from the available pool onto a package.
4. AI: "finish all active Wedding Cake flower packages in Vault 1" (lookup → confirm).
5. Show tag settings: upload pool vs auto-prefix generation.

## Talking points

- "Compliance trail is built as you work — not rebuilt on Friday for METRC."
- "Adjustments require a reason. Quantity isn't a free-edit field."
- "Tags for plants, batches, and packages share one pool."

## Differentiators

- Packages inside the same confirm-before-execute AI loop
- METRC reason-code adjustment ledger before live sync exists
- Unified tag pool across plant / batch / package

## Do not claim

- Live METRC API sync (no Metrc client; `metrc_synced_at` / `metrc_id` are prep)
- Full compliance suite (manifests, transfers, state reporting — human-task territory today)
- Every concentrate category as a package type (BHO lives in extraction product catalog, not the package enum)

## Related modules

[Trim Sessions](./trim-sessions.md) · [Extraction](./extraction.md) · [Settings](./settings.md) · [Tasks](./tasks.md)

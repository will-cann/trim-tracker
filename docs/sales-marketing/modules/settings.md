# Settings

**Elevator pitch:** Configure the facility once — licenses, genetics, rooms, tags, equipment, and product catalog — so every other module stays consistent.

## Who it's for

Admins and facility setup owners.

**Nav:** Settings (bottom of sidebar)

## Problem

Every module invents its own strain names, room lists, and license numbers. Inconsistency breaks harvest planning, tags, and compliance fields.

## Value

One configuration surface. Strain flowering days drive harvest dates. Room types constrain where work happens. Tag rules define how plants and packages get IDs.

## Key capabilities (shipped)

- Licenses CRUD (also via AI)
- Strains: veg/flower days, phenotype, terpene tags, notes (also via AI)
- Rooms: types (nursery / veg / flower / dry / general), capacity, sq ft, equipment attachments
- Plant / package tag settings: enable, auto-generate vs CSV, phase triggers, batch-tag requirement, prefix/counter
- Equipment section (feature-flagged with extraction workspace)
- Product type catalog (METRC category hints, process tags)
- Team section shortcut

## Demo script

1. Show strain library with flowering days → explain auto harvest date on flip.
2. Show room types and capacity.
3. Show tag settings (upload vs auto-prefix).
4. If extraction flag on: equipment registry.

## Talking points

- "Settings aren't admin busywork — they're what make voice resolution and harvest dates accurate."
- "Licenses and strains are first-class, not free-text fields buried in forms."

## Differentiators

- Configuration shared across AI entity resolution and every ops module
- Tag policy centralized for plant and package assignment

## Do not claim

- Live sensor integrations on rooms
- Live METRC sync from Settings
- That equipment UI is available when the extraction workspace flag is off

## Related modules

[Cultivation & Plant Map](./cultivation-plant-map.md) · [Packaging & Compliance](./packaging-compliance.md) · [Extraction](./extraction.md) · [Team & Roles](./team-roles.md)

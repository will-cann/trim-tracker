# AI & Voice

**Elevator pitch:** Talk to the facility — chat or mic — and confirm structured actions before they hit the database.

## Who it's for

Every operator using NeuroCann Home. Floor roles benefit most from voice when hands are busy.

**Nav:** NeuroCann logo / Home (always available)

## Problem

Facility software forces tablet taps between every weight, move, and status change. Floor crews stop working to type. Paper catches what software misses.

## Value

One conversational interface across cultivation, harvest, trim, packages, extraction, ordering, and tasks. Propose → preview → confirm. Nothing mutates until the operator says yes.

## Key capabilities (shipped)

- AI Home chat: conversation → Claude (`ai-parse`) → ProposedAction[] → ActionPreview → actionExecutor
- Voice **action mode** (Deepgram): transcript injects into chat input for processing
- Screen-context aware prompts (knows which module you're looking at)
- IndexedDB conversation history
- Facility setup checklist for new companies
- Broad mutation + lookup tool surface (plants, harvest, trim, packages, tags, vendors, extraction, tasks, licenses, strains, rooms)

## Ambient mode (built, gated)

Full ambient stack exists (continuous listening, Ambient Action Center, capture log, extraction run cards). **`AMBIENT_ENABLED` is currently false** — entry points are hidden. Confirm with product before promising ambient in a customer demo or marketing page as generally available.

Safe interim claim: "Ambient continuous capture is in the product; we're rolling it out carefully. Action-mode voice ships today."

## Demo script

1. Open AI Home; type or speak a domain-specific ask (move plants, start trim, create PO outreach).
2. Show Action Preview with every field before confirm.
3. Confirm; show the target module update.
4. Second ask spanning domains to prove one interface.
5. Only demo ambient if the flag is on for that environment.

## Talking points

- "You review every action before it writes — AI proposes, you decide."
- "Same loop from nursery move to supplier email."
- "Voice isn't a gimmick mic button — it's how the floor talks to the system."

## Differentiators

- Confirm-before-execute across the full ops surface
- Fuzzy entity resolution (strain / room / package / vendor names)
- Hybrid human tasks with on-complete digital actions

## Do not claim

- Ambient as GA while the feature flag is off
- That Harvest Day cockpit auto-applies ambient weight actions without the review queue
- Fully autonomous AI agents that act without confirmation (roadmap: AI sub-agents)
- That every executor method is exposed as a conversational tool (some ordering mutations are UI-first today)

## Related modules

All operational modules. Landing showcase: Ambient Voice section in `LandingPage.tsx` — keep copy aligned with flag status.

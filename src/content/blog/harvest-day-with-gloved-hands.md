---
title: "Harvest day with gloved hands"
description: "Wet weights get lost between the scale and the spreadsheet. Here is what harvest day looks like when the record is kept by talking instead of tapping."
date: 2026-09-24
author: NeuroCann Team
tags: [harvest, voice]
---

Harvest day has a rhythm. Cut, carry, hang, weigh, repeat. Somewhere in that rhythm is a clipboard, and on the clipboard are the numbers that matter for the next six weeks: wet weight per plant, where it went, what was wrong with it.

The clipboard is the weak link. Not because people are careless — because gloves are wet, hands are full, and the scale is twelve feet from the tablet.

## Where the data actually goes missing

Walk through a normal harvest day and count the handoffs:

1. A plant comes off the line and onto the scale.
2. Someone reads the number out loud.
3. Someone else writes it down, or remembers it until the next plant.
4. At the end of the day, the sheet gets keyed into whatever system the facility uses.
5. Contamination notes, if they were written at all, live in the margin.

Each handoff is a chance for a transposed digit, a skipped plant, or a "we'll fix it in METRC later." By the time the batch is hanging, the wet weight record is already an approximation.

## Weighing by voice

The fix is to collapse the handoffs. The person at the scale says the number. The system hears it, structures it, and shows them what it heard.

> "Plant 7 is 512 grams, has some PM on the lower fans."

That one sentence carries three facts: a plant number, a wet weight, and a contamination flag with a location. NeuroCann proposes two actions from it — record the weight for plant 7, flag powdery mildew as minor — and puts them on screen for a glance-and-confirm. Nothing is written until someone says yes.

This matters more than it sounds. Speech-to-text is good but not perfect, and "five twelve" and "five twenty" are one syllable apart. The review step is what makes voice trustworthy on a floor where the numbers end up in a compliance record.

## The cockpit, not the card

Harvest Day in NeuroCann is a dedicated weighing surface, not a form buried inside a harvest record. It is built for the shape of the day:

- **Multi-batch tabs** — when two strains come down at once, each has its own lane.
- **Per-plant or bulk entry** — weigh individually when you need the data, in bulk when you don't.
- **Allocation on the spot** — flower to a dry room, fresh frozen to the freezer, or both from the same harvest.
- **Waste and contamination in the moment** — stem waste, bud rot, PM, insects, logged when they are noticed, not reconstructed from memory.
- **Submit to a manager** — the batch moves to hanging only after approval, and the drying day counter starts from there.

The mic in the cockpit fills the number field. The AI proposes the structured action. The operator confirms. Three steps, and the record is right the first time.

## What we are not claiming

Voice on harvest day is not a scale integration. The number still comes from a human reading a display. It is also not fully autonomous — every weight goes through the review queue before it lands. Ambient continuous capture, where the system listens in the background without a prompt, is in the product and rolling out carefully; action-mode voice is what ships to every facility today.

## Why it changes the next six weeks

A clean wet weight record is the baseline for everything downstream. Dry-down percentages mean something. Trim yield per strain means something. The frozen pathway has a real input weight to measure extraction against.

Harvest day is the one day you get to capture that baseline. The goal is simple: keep your hands on the plants, and let the record keep itself.

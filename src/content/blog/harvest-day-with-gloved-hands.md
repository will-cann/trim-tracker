---
title: "Harvest day with gloved hands"
description: "Wet weights get lost between the scale and the spreadsheet. This is what harvest day looks like when the record is kept by speaking rather than tapping."
date: 2026-09-24
author: NeuroCann Team
tags: [harvest, voice]
---

Harvest day has a rhythm to it: cut, carry, hang, weigh, and repeat. Somewhere in that rhythm there is a clipboard, and on the clipboard are the numbers that will matter for the next six weeks: the wet weight of each plant, where it went, and anything that was wrong with it.

The clipboard is the weak point in the process. This is not because people are careless. It is because gloves are wet, hands are full, and the scale is usually some distance from the tablet.

## Where the data goes missing

If you walk through a normal harvest day and count the handoffs, it looks like this:

1. A plant comes off the line and onto the scale.
2. Someone reads the number out loud.
3. Someone else writes it down, or holds it in their head until the next plant.
4. At the end of the day, the sheet is keyed into whatever system the facility uses.
5. Contamination notes, if they were written at all, are in the margin.

Each handoff is an opportunity for a transposed digit, a skipped plant, or a note to fix it in METRC later. By the time the batch is hanging, the wet weight record is already an approximation of what happened.

## Weighing by voice

The way to fix this is to reduce the number of handoffs. The person at the scale says the number. The system hears it, turns it into a structured record, and shows them what it heard.

> "Plant 7 is 512 grams, has some PM on the lower fans."

That one sentence carries three facts: a plant number, a wet weight, and a contamination flag with a location. NeuroCann proposes two actions from it, recording the weight for plant 7 and flagging powdery mildew as minor, and puts both on screen for the operator to look at and confirm. Nothing is written until someone says yes.

This review step matters more than it might seem. Speech-to-text is good but not perfect, and "five twelve" and "five twenty" differ by a single syllable. Showing the number before it enters the database is what makes voice trustworthy on a floor where the numbers end up in a compliance record.

## A dedicated surface for the day

Harvest Day in NeuroCann is a dedicated weighing screen rather than a form inside a harvest record. It is organized around how the day actually goes:

- **Multiple batch tabs**, so that when two strains come down at once, each has its own lane.
- **Per-plant or bulk entry**, so you can weigh individually when you need the detail and in bulk when you do not.
- **Allocation at the time of weighing**, so flower can go to a dry room, fresh frozen to the freezer, or both from the same harvest.
- **Waste and contamination logged as they are noticed**, including stem waste, bud rot, powdery mildew, and insects, rather than reconstructed from memory afterward.
- **Submission to a manager**, so the batch moves to hanging only after approval, and the drying day counter starts from that point.

The microphone fills in the number field. The AI proposes the structured action. The operator confirms it. The record is correct the first time, and no one has to key it in later.

## What we are not claiming

Voice on harvest day is not a scale integration. The number still comes from a person reading a display. It is also not fully autonomous, since every weight goes through the review step before it is saved. Ambient continuous capture, where the system listens in the background without being prompted, exists in the product and is being rolled out carefully; the voice mode that every facility has today is the one where you speak when you are ready to record.

## Why it matters for the next six weeks

A clean wet weight record is the baseline for everything that follows. Dry-down percentages depend on it. Trim yield per strain depends on it. The fresh frozen pathway needs a real input weight to measure extraction against.

Harvest day is the only day you get to capture that baseline. The goal is to let people keep their hands on the plants while the record is kept for them.

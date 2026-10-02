---
title: "Trim tracker: is trim even worth tracking?"
description: "Trim looks like the least interesting step in the facility, so few people measure it. It is where the product is counted, and the byproduct is worth more than most think."
date: 2026-08-27
author: NeuroCann Team
tags: [trim, operations]
---

Of all the steps in a cultivation facility, trim is the one that looks least worth building anything for. Growing is the craft, harvest is the event, and extraction has the equipment. Trim is processing: people at a table with scissors or a machine, turning dried plants into finished flower. It is easy to see it as a cost to be minimized rather than a step to be measured.

We think that view is mistaken, for two reasons.

The first is that trim is where the product gets counted. Everything upstream of the trim table is an estimate: the wet weight on harvest day mostly measures water, and the dry weight of a hanging batch is the plant but not yet the product. The trim table is where the batch is separated into what you can sell, what you can process, and what you throw away. If you measure nothing else in the facility, this is the step to measure.

The second is the byproduct. We have seen many growers treat trim as waste. It gets bagged and given away, or sold off for very little, because the operation is organized around flower and trim is whatever is left. We have also seen growers who freeze their trim as it comes off the table and sell it to extractors as fresh frozen material for a comparatively high price. The difference between those operations is not the plant. It is whether anyone looked at the trim pile as a product, and the same is true of the process around it. A step nobody thought was worth measuring is usually where a second look pays off.

What follows is how we do that measuring.

## The yield number with no explanation

If you ask a trim lead what their yield was last week, you will get a number. If you ask why it was three points lower than the week before, the answer usually gets vague. It might have been a different strain, or a new hire, or the machine being down. Usually it is a guess.

The gap between the number and the explanation is an accounting problem rather than a cultivation one. Most trim floors track what went into a batch and what came out of it. Very few track who did what to it in between.

## Four buckets

Every gram that enters a trim session leaves it as one of four things:

| Bucket | What it is |
|--------|-----------|
| **Flower** | Finished, saleable bud |
| **Shake** | Small bud and loose material, still product |
| **Trim** | Sugar leaf and fan trim, extraction input |
| **Waste** | Stem and anything unusable |

There is nothing novel about four buckets. What changes the picture is tracking them **per trimmer**, inside a session that can hold more than one batch.

## Per person, per batch

A NeuroCann trim session is a single live screen with multiple batch entries on it. Each entry is a harvest, with its strain, license, and starting weight. Each entry has trimmers assigned to it, with a start time, an end time, and whether they are on scissors or the machine.

Weights are entered per trimmer, in each of the four buckets. The session adds them up into a stacked progress bar against the starting weight, so at any moment you can see how much of the batch has landed in each bucket and how much is still on the table.

That one change is what lets you answer the "why" question. Perhaps the machine lane ran a strain with dense, small bud and the shake ran high, or two new trimmers shared a batch and their waste ratio was double the floor average. The data tells you which.

## The shift does not end when the batch does

Trim rarely fits into an eight-hour day. A batch started at two in the afternoon is half finished when the crew leaves, and the next morning someone rebuilds the spreadsheet and tries to remember who had already logged what.

NeuroCann handles this with a rollover rule. When a session is submitted, any batch that is still upcoming or active is carried into a new session automatically, along with its trimmer assignments and logged weights. The morning crew opens the app and the batch is where they left it.

## From bin to package

Trim sits in the middle of the facility, and the session connects to both sides of it. Upstream, a harvest bin that has been cured and marked ready becomes a trim entry without re-entering the strain, license, or weight. Downstream, flower from a submitted batch can be packaged from within the session, with the strain and harvest reference carried into inventory. The result is one chain of custody from hanging to tagged package.

## What this is not

It is not a timeclock or a piece-rate payroll system; start and end times are recorded for productivity analysis, not for paying people. It is not a hardware scale integration; numbers are entered or spoken and then confirmed. And it does not submit packages to METRC automatically. Its job is to get the record right so the submission is clean when you make it.

## The report at the end

Because weights are tracked per person and per batch, the reports module can answer questions that a single yield number cannot: grams per hour by trimmer, flower-to-shake ratio by strain, labor cost per pound, and grams of trim by strain, which you need before deciding whether that trim is worth freezing and selling. These are not estimates. They are the actual accounting from the floor.

That is why we think trim is worth tracking. It is the step where the product is counted, and it produces a byproduct that is only worth something once someone knows how much of it there is. A session that knows which bucket every gram landed in, for every batch and every person, answers both questions.

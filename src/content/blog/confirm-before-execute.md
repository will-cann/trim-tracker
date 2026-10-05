---
title: "Confirm before execute"
description: "An AI that writes directly to compliance records creates more problems than it solves. The loop NeuroCann uses instead: propose, preview, and confirm."
date: 2026-09-10
author: NeuroCann Team
tags: [ai, platform]
---

There is a version of "AI for cannabis operations" in which you say something and the database changes immediately. It makes for an impressive demo. We do not think anyone should run a licensed facility on it, and we want to explain why, and what we do instead.

The reason is not that the models are bad. It is that the cost of a wrong write is uneven. A missed plant move is a minor inconvenience. A phantom package with a METRC tag attached to it means an afternoon with your compliance officer. Any system that touches those records has to earn the right to write to them.

## The loop

NeuroCann uses one interaction pattern across the whole product:

1. **You say what you need.** You can type it or speak it. "Move the OG Kush from veg 2 to flower 1." "Add Maria to the Gelato batch with scissors." "Create a PO for Pacific Roots for 10 cases of rockwool and 5 cases of nutrients."
2. **The AI proposes a structured action.** This is not a paragraph of text. It is a typed object with every field filled in: which plants, which rooms, how many, which strain, which vendor.
3. **You see the proposal before anything changes.** It appears as a preview card with its fields visible. Where it makes sense, the fields can be edited.
4. **You confirm it.** With one tap, the action runs, and the plant map, harvest record, trim session, or purchase order is updated.

The same loop handles a nursery move and a supplier email. That consistency is deliberate. An operator learns one interaction, and it works the same way in every module.

## Why the preview is not optional

There are three things that go wrong with natural language in a facility, and the preview is what catches each of them.

**Ambiguity.** "Flower 1" might be a room or a growth phase. "The Gelato batch" might be one of two active entries. The AI matches names approximately, across strains, rooms, packages, and vendors, and the preview shows you which one it chose. If it guessed wrong, you correct it with a glance instead of discovering a wrong record later.

**Transcription.** Voice on a loud floor is imperfect. "Fifteen" and "fifty" are separated by one consonant. The number is on the screen before it is in the database.

**Scope.** Some requests contain more than one action. "Plant 7 is 512 grams, has some PM" is both a weight and a contamination flag. The preview lists both, and you can confirm one without the other.

## Context improves the proposals

The AI is told which screen you are on. A request for "the active batch" from the Trim dashboard resolves differently than the same request from the Harvest pipeline. It also has the current facility state available to it: the active session, the trimmer roster, open harvests, a summary of the plant map, and pending tasks. Proposals are grounded in what actually exists rather than in what the model might assume exists.

## When the work is physical

Not everything can be done by software. "Defoliate Flower Room 2 before Friday" is a job for a person. NeuroCann creates a human task for it, with a priority, an assignee, a due date, and a location, and the task appears in the queue rather than being marked done by a system that cannot do it.

Some tasks are hybrid: a physical step with a digital consequence. Move the plants, then update the room. In that case the task carries the follow-up action with it. When the person marks the physical step complete, the digital step is proposed for confirmation, using the same loop as everything else.

## What this is not

It is not an autonomous agent. Nothing is written without a confirmation, and that is a deliberate choice. Autonomous sub-agents for routine monitoring are on our roadmap, and when they arrive they will still present their work for review before it affects a record that matters.

It is also not a chat window attached to a dashboard. The actions are first-class. A confirmed proposal runs through the same executor the interface buttons use, so a confirmed proposal and a manual edit produce exactly the same result.

## The principle

The AI proposes and the operator decides. This makes for a slower demo, but we believe it makes for a faster facility, because the time saved is the time you would otherwise spend finding and correcting a write you did not intend to make.

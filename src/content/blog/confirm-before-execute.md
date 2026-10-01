---
title: "Confirm before execute"
description: "An AI that writes directly to your compliance records is a liability. Here is the loop NeuroCann uses instead: propose, preview, confirm — the same way across every module."
date: 2026-09-10
author: NeuroCann Team
tags: [ai, platform]
---

There is a version of "AI for cannabis operations" where you say something and the database changes. It is a demo that lands well and a product that nobody should run a licensed facility on.

The reason is not that the models are bad. It is that the cost of a wrong write is asymmetric. A missed plant move is a shrug. A phantom package with a METRC tag attached is an afternoon with your compliance officer. Any system that touches those records has to earn the right to write.

## The loop

NeuroCann runs one loop everywhere:

1. **You say what you need.** Type it or speak it. "Move the OG Kush from veg 2 to flower 1." "Add Maria to the Gelato batch with scissors." "Create a PO for Pacific Roots — 10 cases of rockwool, 5 cases of nutrients."
2. **The AI proposes a structured action.** Not a paragraph — a typed object with every field filled in: which plants, which rooms, how many, which strain, which vendor.
3. **You see it before anything changes.** The proposal renders as a preview card. Fields are visible. Where it makes sense, they are editable.
4. **You confirm.** One tap. Now it executes, and the plant map, harvest record, trim session, or purchase order updates.

The same loop handles a nursery move and a supplier email. That consistency is the point. Operators learn one interaction and it works in every module.

## Why the preview is not optional

Three things go wrong with natural language in a facility, and the preview catches all of them.

**Ambiguity.** "Flower 1" might be a room or a strain phase. "The Gelato batch" might be one of two active entries. The AI resolves names fuzzily — strain, room, package, vendor — and the preview shows you what it picked, so a wrong guess is a glance and a correction, not a wrong record.

**Transcription.** Voice on a loud floor is imperfect. "Fifteen" and "fifty" are a hard consonant apart. The number is on screen before it is in the database.

**Scope.** Sometimes a request fans out. "Plant 7 is 512 grams, has some PM" is two actions — a weight and a contamination flag. The preview lists both. You can confirm one and not the other.

## Context makes proposals better

The AI is told which screen you are on. Asking for "the active batch" from the Trim dashboard resolves differently than from the Harvest pipeline. It also has the current facility state in front of it: active session, trimmer roster, open harvests, plant map summary, pending tasks. Proposals are grounded in what exists, not in what the model imagines might exist.

## When the work is physical

Not everything can be executed by software. "Defoliate Flower Room 2 before Friday" is a task for a person. NeuroCann creates a human task for it — priority, assignee, due date, location — and it shows up in the task queue instead of pretending to be done.

Some tasks are hybrid: a physical step with a digital consequence. Move the plants, then update the room. The task carries the follow-up action, and when the person marks the physical step complete, the digital one is proposed for confirmation. Same loop.

## What this is not

It is not an autonomous agent. Nothing writes without a confirmation, and we are deliberate about that. Autonomous sub-agents for routine monitoring are on the roadmap, and when they arrive they will still surface their work for review before it affects a record that matters.

It is also not a chat window bolted onto a dashboard. The actions are first-class — the same executor the UI buttons use — so a confirmed proposal and a manual edit produce identical results.

## The principle

AI proposes. You decide. It is a slower demo and a faster facility, because the time you save is the time you would have spent finding and fixing the write you did not mean to make.

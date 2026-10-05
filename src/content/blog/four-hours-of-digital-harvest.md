---
title: "Four hours of digital harvest"
description: "After every harvest, our compliance administrator spent an afternoon typing plant tags and weights into the system. The problem was timing, not typing."
date: 2026-10-01
author: NeuroCann Team
tags: [harvest, what-went-wrong]
---

Harvest day is the most chaotic day in the cycle. Everyone is in the room, everything is moving, and the only thing anyone is thinking about is getting the plants down and hung so the room can be turned over. Keeping the records is a secondary concern, and understandably so.

Then a second part of the harvest begins, and most people do not count it as part of the harvest at all. Our compliance administrator would sit down with the paper sheets and do what we came to call the digital harvest: entering each plant tag and each weight, one at a time, into our system and into METRC. It took about four hours every time. By the end of it he was exhausted, and the error rate showed it.

We had already tried what seemed like the obvious solution. Before any of this, we had built systems to collect every data point a facility produces, with the goal of a supply chain that could tune itself based on its own numbers. What we found was that the data came in inconsistently filled out and barely structured. The reason was that collecting it was a separate step from doing the work. People do the work, and the step after the work is where the record falls apart.

Our conclusion was this: if capturing the record is a second task, it will not be done well. It has to happen in the same motion as the thing being recorded.

That changed how we understood the problem. The four hours were not a typing problem. They were a timing problem. The weight existed for one moment, on the scale with the plant in front of you, and we were trying to reconstruct it later from paper. Everything downstream of that moment is reconciliation.

So the mechanism for recording has to live at the scale. Our first version used a scanner: scan the tag, tap twice, type the number, move to the next plant. That was already a large improvement. But even two taps are difficult with a wet glove, and the fastest input a person has on harvest day is their voice. The number is being said out loud anyway. The system should be the one writing it down.

Two things follow from this for any facility:

- **Time the second harvest.** The hours spent entering a harvest after the harvest are a real cost. Record them next to the chop date so you know what they are.
- **Move the record to the moment.** Whatever gets weighed, flagged, or counted should be captured where and when it happens, by the person doing it. Anything else becomes four hours later.

How we handle it: Harvest Day was the second thing we built, and its purpose is to take that afternoon down to nothing.

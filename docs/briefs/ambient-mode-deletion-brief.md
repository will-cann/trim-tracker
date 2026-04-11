# Ambient Mode Deletion — Design Brief

> Status: planned, not executed
> Last updated: 2026-04-11
> Related roadmap entry: AI Agent → Ambient Mode (deferred)
> Related memory: none yet — add on execution

## Summary

Delete the dormant ambient-mode UI and lifecycle surface from main. Keep the pure chunking primitive (`ambientChunker.ts`) since it's already reused in `ChatPanel` and is directly applicable to the chat-mode intent work on the near roadmap. Tag the pre-deletion commit so ambient can be revived from git when priorities change, rather than carried as flag-off dead code.

Net reduction: ~1,700 lines of code, all of it currently unreachable by users (`AMBIENT_ENABLED = false`).

## Why delete rather than keep flag-off

Ambient mode was rebuilt on main into a structured review-queue architecture (`AmbientProvider` + `AmbientActionCenter`) but gated off via `AMBIENT_ENABLED = false` while the team focuses on chat-mode chunking, intent quality, and building out pathways ambient is supposed to execute through. Ambient is explicitly out of scope for the short term.

The cost of keeping dormant code:
- **Silent rot** — every `AIHome` / `ChatPanel` / `App.tsx` refactor risks breaking a path no test exercises
- **Cognitive overhead** — new work has to reason about "what does this do when ambient is on" for a mode that can't be turned on
- **Coupling drift** — `ChatPanel.tsx` currently reads `useAmbient()` just to short-circuit itself during an ambient session that can never exist
- **False optionality** — "we can flip the flag later" sounds cheap but isn't; when ambient comes back in 3-6 months the AIHome surface will have moved, the review-queue UX will need rethinking against the new chat flow, and the provider wiring will be stale anyway

The revive cost from git is roughly the same as the revive cost with the code sitting in-tree-but-flag-off, because the *integration points* will have drifted regardless. Might as well get the maintenance win now.

## What stays

### `src/lib/ambientChunker.ts` (53 LOC)
Pure functions — `retainTail`, `SILENCE_FLUSH_MS`, `TAIL_OVERLAP_CHARS`. Already imported by both `AmbientContext.tsx` (being deleted) *and* `ChatPanel.tsx` (staying). This is exactly the chunking primitive the chat-mode intent work will want. Tests in `src/lib/__tests__/ambientChunker.test.ts` stay.

### `src/components/InterceptiveCard.tsx` (192 LOC)
Despite the name, this is imported by `ExtractionRunCard.tsx`, not ambient-specific code. Unchanged.

### Whatever `ChatPanel` already does with ambient logic
`ChatPanel.tsx` has its own inline `analyzeAmbientChunk` (line 361) and silence-timer flow that calls `apiService.aiParse`. This is *separate* from `AmbientContext` and appears to be the ChatPanel-local version of the pipeline. **Needs audit before deletion** — see open question below.

## What gets deleted

| File | LOC | Reason |
|---|---:|---|
| `src/contexts/AmbientContext.tsx` | 707 | Provider + lifecycle for the dormant review-queue pattern |
| `src/components/AmbientActionCenter.tsx` | 490 | Review queue UI |
| `src/components/AmbientHeaderIndicator.tsx` | 251 | Global header indicator for active session |
| `src/services/ambientAnalyzer.ts` | 182 | **Already dead** — only imported by its own test file. The real analyzer logic is inlined in `ChatPanel.tsx`. This file is orphaned as of current main. |
| `src/services/__tests__/ambientAnalyzer.test.ts` | — | Covers the orphaned service above |
| `src/components/AmbientStatusPill.tsx` | 76 | Session status pill for the review surface |
| **Total** | **~1,706** | |

### `src/lib/featureFlags.ts`
Remove `AMBIENT_ENABLED` export and the JSDoc block describing ambient. Keep the file — it's a useful pattern and the JSDoc header about build-time flags is worth preserving for the next flag.

## Files requiring rewiring (not deletion)

### `src/App.tsx`
- Remove `AmbientProvider` wrapper around the view tree
- Remove `useAmbient()` call and `AmbientHeaderIndicator`
- Remove `ChatPanelGate` wrapper component (it exists *only* to short-circuit ChatPanel during ambient sessions that can no longer exist) — revert to using `ChatPanel` directly
- Remove `getContext` / `buildAmbientContext` callback (~60 lines) unless `ChatPanel`'s inline ambient flow still needs it (see audit step)

### `src/components/AIHome.tsx`
- Remove `useAmbient()` usage
- Remove `handleStartAmbient` callback and the empty-state feature card wiring that calls it
- Remove `showAmbientCenter` branch that renders `<AmbientActionCenter />`
- Remove the ambient branch inside `voiceMode` switching logic (keep action mode intact)
- Remove `registerInterceptHandler` wiring — extraction card intercepts are only relevant to ambient
- Remove imports: `AmbientActionCenter`, `AmbientStatusPill`, `AMBIENT_ENABLED`, `useAmbient`

### `src/components/AIEmptyState.tsx`
- Remove the "Ambient Listening" feature card / any ambient entry point
- Remove the `onStartAmbient` prop if it exists

### `src/components/VoicePill.tsx`
- Remove "ambient" option from the long-press mode menu
- Simplify to action mode only
- Review whether `VoicePill` still needs a mode menu at all or can collapse to a single-purpose component

### `src/components/ChatPanel.tsx` — **needs audit**
ChatPanel has its own inline `analyzeAmbientChunk` + silence timer that looks like a complete ambient pipeline, and it also reads `ambientActive` from `useAmbient()` to toggle a button class. Two scenarios:

1. **ChatPanel's inline analyzer is the old deployed "ambient → textbox" pattern we're looking at** — in which case it's the legitimate ChatPanel-local ambient mode that shipped, separate from `AmbientContext`'s review-queue pattern. Delete it alongside everything else.
2. **ChatPanel's inline analyzer is experimental / different** — in which case we need to decide whether to keep it.

Either way, the `useAmbient()` import must go. The `ambientActive` check becomes a no-op the moment `AmbientProvider` is removed.

**Recommendation:** Delete ChatPanel's inline ambient flow along with the rest. The chat-mode intent work on the near roadmap should start from a clean chat loop, not from a partially-working ambient bolt-on with questionable provenance. The `ambientChunker` primitive is still available if the new work wants to use it.

## Execution plan

1. **Verify nothing else is importing the target files.** Grep for each deleted module name before removing.
2. **Audit ChatPanel's inline ambient flow** (the open question above). Decide delete vs. keep on inspection.
3. **Create tag** on the last commit *before* deletion: `git tag -a ambient-v1-dormant -m "Last commit with ambient review-queue architecture intact"`. Push the tag.
4. **Delete files** in the order: dead services first (`ambientAnalyzer.ts` + test), then UI components (`AmbientActionCenter`, `AmbientStatusPill`, `AmbientHeaderIndicator`), then the provider (`AmbientContext.tsx`), finally the flag export.
5. **Rewire dependents** — `App.tsx`, `AIHome.tsx`, `AIEmptyState.tsx`, `VoicePill.tsx`, `ChatPanel.tsx`. Typescheck after each file.
6. **Run test suite** — `npm test` + `npm run build`. The ambient chunker tests should still pass; the orphaned `ambientAnalyzer.test.ts` goes with the service.
7. **Manual smoke test** — action-mode voice still works on AIHome, ChatPanel opens and chats normally, extraction run cards still render (InterceptiveCard intact), no console errors from missing providers.
8. **Single commit or small series** — one commit with a clear message referencing this brief and the `ambient-v1-dormant` tag. Don't bundle unrelated changes.

## Revive strategy (for when ambient comes back)

The brief (and the `ambient-v1-dormant` tag) document:
- Where the provider lived and what it hoisted
- The review-queue UX pattern and its intercept hooks
- The Deepgram config choices (nova-3, numerals, imperative-verb keyterm boosting)
- The session persistence approach
- The chunker primitive (still in-tree)

When ambient is back on the roadmap:
1. Check out `ambient-v1-dormant` as a read-only reference branch
2. Re-read this brief to understand why it was removed
3. Rebuild against whatever `AIHome` / chat flow looks like at that point — do not try to merge the old tag back in; the integration points will have drifted
4. Reuse the chunker as-is (it's still in-tree), reuse the review-queue UX *idea*, rewrite the provider to match whatever context shape chat mode has matured into

The point of the tag is not "we'll revert this" — it's "we have a written-down precedent for the UX decisions we already made, so we don't re-debate them from scratch."

## Risk & rollback

- **Risk: ChatPanel inline ambient is load-bearing for something we don't see.** Mitigation: the audit step (2) + manual smoke test (7). If ChatPanel's chat flow depends on the inline analyzer via a code path we missed, tests will catch it or the smoke test will.
- **Risk: extraction run card intercepts regress.** Mitigation: `InterceptiveCard` + `ExtractionRunCard` are untouched. The intercept registration in `AIHome.tsx` is only for ambient-sourced actions; chat-sourced extraction flows go through a separate path.
- **Rollback:** single commit makes `git revert` trivial if something unexpected surfaces post-deploy.

## Open questions

1. **ChatPanel's inline ambient flow — is this the deployed "transcript → textbox" code, or something else?** Answer determines whether (a) we just delete it alongside everything else or (b) we need to preserve some of it.
2. **Deepgram config — which pieces belong to command mode, which to ambient?** The `nova-3 + numerals + keyterm boosting` tuning landed on commits labeled "ambient" but much of it helps action-mode too. Audit `useDeepgram.ts` config and keep anything that benefits chat mode.
3. **Does `VoicePill` still earn its keep** if action is the only mode? Might be able to collapse it into a simpler button in the same pass, or leave that for a follow-up.
4. **Do we lose any Deepgram keyterm lists** that were scoped to ambient? If the imperative-verb list is only used on ambient sessions, it should survive the deletion and be reused in command mode.

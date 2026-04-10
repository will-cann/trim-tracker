/**
 * Build-time feature flags.
 *
 * These are plain module exports rather than env vars or runtime
 * configuration because we want them tree-shaken by Vite when set to
 * `false` and because flipping them requires a deploy anyway — they're
 * not per-user toggles.
 *
 * When a flag is ready to graduate, either flip to `true` and test, or
 * remove the gate entirely and delete the flag here.
 */

/**
 * Ambient mode (hands-free continuous listening on the AI Home surface).
 *
 * Temporarily gated off while we focus on high-quality text chat
 * workflows + Deepgram command-mode accuracy. The ambient code, the
 * AmbientContext provider, AmbientActionCenter, and ExtractionRunCard
 * intercept routing all stay in place and still work — this flag only
 * hides the user-facing entry points (the empty-state feature card,
 * the VoicePill long-press mode menu, and the AmbientHeaderIndicator).
 *
 * Flip to `true` when ambient is ready to ship in earnest.
 */
export const AMBIENT_ENABLED = false;

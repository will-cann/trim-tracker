import type { T3Mode, T3PackageFacts } from '../../../shared/manifest/t3'
import { normalizeTag } from './metrc'
import { lineStatus } from './order'
import { nameOverlap, productCheck } from './reconcile'
import type { OrderState, PickLine } from '../types'

/**
 * Scan-first picking: the picker walks the vault with the scanner open and
 * scans whatever case is in front of them, without choosing a line first.
 * The scan has to find its own line:
 *
 *   1. Apex recorded this tag on a line (Metrc Package ID / Note column) — the
 *      source of truth when present, and it works offline.
 *   2. Otherwise ask Metrc (via T3) what the package is. Its parent package
 *      is the lot Apex printed on the pick list, so the lot tag decides;
 *      the item name is the fallback for lines Apex has no lot on.
 *
 * Pure functions; ScanAnySheet does the network call and the UI.
 */

export type MatchHow = 'recorded' | 'lot' | 'product'

export type LineMatch =
  | { kind: 'line'; lineId: string; how: MatchHow }
  /** Several lines fit (same lot across two lines, say); the picker decides. */
  | { kind: 'ambiguous'; lineIds: string[]; how: MatchHow }
  | { kind: 'none' }

const isOpen = (state: OrderState, line: PickLine) => {
  const st = lineStatus(line, state.scans[line.id])
  return st === 'empty' || st === 'partial'
}

/** One candidate is the answer; several resolve to the only one still open, else the picker chooses. */
function choose(state: OrderState, candidates: PickLine[], how: MatchHow): LineMatch {
  if (candidates.length === 0) return { kind: 'none' }
  if (candidates.length === 1) return { kind: 'line', lineId: candidates[0].id, how }
  const open = candidates.filter((l) => isOpen(state, l))
  if (open.length === 1) return { kind: 'line', lineId: open[0].id, how }
  return { kind: 'ambiguous', lineIds: (open.length ? open : candidates).map((l) => l.id), how }
}

/** Lines whose Apex-recorded tags include this one. */
export function matchRecorded(state: OrderState, raw: string): LineMatch {
  const tag = normalizeTag(raw)
  return choose(
    state,
    state.lines.filter((l) => l.recordedTags.includes(tag)),
    'recorded',
  )
}

/** Which pick line a package belongs to, from what Metrc says is in it. */
export function matchByFacts(state: OrderState, facts: T3PackageFacts): LineMatch {
  if (facts.state === 'not_found') return { kind: 'none' }
  const parents = (facts.sourcePackageLabels ?? []).map((p) => p.toUpperCase())
  if (parents.length) {
    const byLot = state.lines.filter((l) => l.lotTag && parents.includes(l.lotTag.toUpperCase()))
    if (byLot.length) return choose(state, byLot, 'lot')
  }
  if (facts.itemName) {
    // The reconciliation's product check is deliberately lenient (same size,
    // most words shared), so sibling strains all pass it. Keep only the
    // closest name(s); a strain word usually settles it.
    const item = facts.itemName
    const scored = state.lines
      .filter((l) => productCheck(facts, l).verdict === 'ok')
      .map((l) => ({ l, score: nameOverlap(l.productName, item) + nameOverlap(item, l.productName) }))
    const best = Math.max(0, ...scored.map((s) => s.score))
    const byProduct = scored.filter((s) => s.score === best).map((s) => s.l)
    if (byProduct.length) return choose(state, byProduct, 'product')
  }
  return { kind: 'none' }
}

/**
 * Origin licences to look a lone tag up on: the one most of the order ships
 * from first, the rest as fallbacks (the server checks those on a miss).
 */
export function queryLicenses(state: OrderState): { primary: string; others: string[] } | null {
  const count = new Map<string, number>()
  for (const line of state.lines) {
    const lic = state.licenseByProductType[line.productType]
    if (lic) count.set(lic, (count.get(lic) ?? 0) + 1)
  }
  if (!count.size) return null
  const sorted = Array.from(count.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([lic]) => lic)
  return { primary: sorted[0], others: sorted.slice(1) }
}

/**
 * Facts came back relative to the licence we asked about; restate them
 * relative to the matched line's origin licence so the Review screen's
 * reconciliation (which compares against that licence) reads them right.
 */
export function factsForLicense(facts: T3PackageFacts, originLicense: string): T3PackageFacts {
  if (facts.state === 'not_found' || !facts.licenseNumber) return facts
  const same = facts.licenseNumber.toUpperCase() === originLicense.toUpperCase()
  if (same) {
    return facts.state === 'other_license' ? { ...facts, state: 'eligible', reason: undefined } : facts
  }
  if (facts.state === 'eligible' || facts.state === 'other_license') {
    return { ...facts, state: 'other_license', reason: `eligible from ${facts.licenseNumber}, not ${originLicense}` }
  }
  return facts
}

/** Fold one package's facts into the order's Metrc snapshot so Review doesn't have to ask again. */
export function mergeFacts(state: OrderState, facts: T3PackageFacts, mode: T3Mode): OrderState {
  return {
    ...state,
    metrc: {
      checkedAt: Date.now(),
      mode,
      byTag: { ...(state.metrc?.byTag ?? {}), [facts.tag]: facts },
    },
  }
}

/** Short description of a package for toasts: "Proper - Pre-Roll - 1g - Legend OG · from lot …0009173". */
export function describePackage(facts: T3PackageFacts): string {
  if (facts.state === 'not_found') return 'Metrc cannot find this tag on any licence you can see'
  const parts = [facts.itemName, facts.quantity != null ? `${facts.quantity} ${facts.unit ?? ''}`.trim() : null]
  const lot = facts.sourcePackageLabels?.[0]
  if (lot) parts.push(`from lot …${lot.slice(-7)}`)
  return parts.filter(Boolean).join(' · ')
}

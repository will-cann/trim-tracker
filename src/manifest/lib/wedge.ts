import { addScan, lineStatus, type ScanFailReason } from './order'
import { normalizeTag } from './metrc'
import type { OrderState, PickLine, ScanSource } from '../types'

/**
 * Laptop + USB scanner flow: one always-focused input receives every scan,
 * so the tag has to be routed to a line instead of the user picking the line
 * first. Routing order:
 *   1. A line whose Apex-recorded tags contain this tag (source of truth when present)
 *   2. The currently active line
 *   3. The first line that still needs packages
 */
export type RouteReason = 'recorded' | 'active' | 'first-open'
export type Route = { lineId: string; reason: RouteReason } | { lineId: null; reason: 'none' }

export function routeScan(state: OrderState, raw: string, activeLineId: string | null): Route {
  const tag = normalizeTag(raw)
  const recorded = state.lines.find((l) => l.recordedTags.includes(tag))
  if (recorded) return { lineId: recorded.id, reason: 'recorded' }
  if (activeLineId && state.lines.some((l) => l.id === activeLineId)) return { lineId: activeLineId, reason: 'active' }
  const open = firstOpenLine(state)
  return open ? { lineId: open.id, reason: 'first-open' } : { lineId: null, reason: 'none' }
}

export function firstOpenLine(state: OrderState, after?: string | null): PickLine | undefined {
  const idx = after ? state.lines.findIndex((l) => l.id === after) : -1
  const ordered = idx >= 0 ? state.lines.slice(idx + 1).concat(state.lines.slice(0, idx + 1)) : state.lines
  return ordered.find((l) => {
    const st = lineStatus(l, state.scans[l.id])
    return st === 'empty' || st === 'partial'
  })
}

export type WedgeScanResult =
  | { ok: true; state: OrderState; lineId: string; routed: RouteReason; lineComplete: boolean; warning?: string }
  | { ok: false; reason: ScanFailReason | 'no-open-line'; detail?: string; lineId: string | null }

export function wedgeScan(state: OrderState, raw: string, activeLineId: string | null, source: ScanSource = 'usb'): WedgeScanResult {
  const route = routeScan(state, raw, activeLineId)
  if (!route.lineId) {
    // Still validate so the user gets "not a tag" rather than "nothing to scan into".
    const probe = state.lines[0] ? addScan(state, state.lines[0].id, raw, source) : null
    if (probe && !probe.ok && probe.reason === 'invalid') return { ok: false, reason: 'invalid', lineId: null }
    return { ok: false, reason: 'no-open-line', lineId: null }
  }
  const r = addScan(state, route.lineId, raw, source)
  if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail, lineId: route.lineId }
  const line = r.state.lines.find((l) => l.id === route.lineId)!
  return {
    ok: true,
    state: r.state,
    lineId: route.lineId,
    routed: route.reason,
    lineComplete: lineStatus(line, r.state.scans[line.id]) === 'complete',
    warning: r.warning,
  }
}

/**
 * Keyboard-wedge scanners type the whole barcode in one burst and usually
 * finish with Enter or Tab. Treat a buffer as a finished scan when it is a
 * full 24-char tag, or when a suffix key arrives.
 */
export const WEDGE_SUFFIX_KEYS = new Set(['Enter', 'Tab'])

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

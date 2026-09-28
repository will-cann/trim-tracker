import { describe, it, expect } from 'vitest'
import { parsePickList } from '../lib/pickList'
import { createOrderState, lineStatus } from '../lib/order'
import { firstOpenLine, routeScan, wedgeScan } from '../lib/wedge'
import { resolveLayout } from '../lib/layout'
import { DEFAULT_LICENSES } from '../lib/storage'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'

const fresh = () => createOrderState(parsePickList(SAMPLE_PICKLIST_CSV).lines, 'sample', DEFAULT_LICENSES)
const NEW_TAG = '1A40A0300005D2C000000001'

describe('routeScan', () => {
  it('routes a tag Apex recorded to its own line even when another line is active', () => {
    const s = fresh()
    const target = s.lines.find((l) => l.recordedTags.length)!
    const other = s.lines.find((l) => l.id !== target.id)!
    expect(routeScan(s, target.recordedTags[0], other.id)).toEqual({ lineId: target.id, reason: 'recorded' })
  })

  it('falls back to the active line, then the first open line', () => {
    const s = fresh()
    expect(routeScan(s, NEW_TAG, s.lines[3].id)).toEqual({ lineId: s.lines[3].id, reason: 'active' })
    expect(routeScan(s, NEW_TAG, null)).toEqual({ lineId: s.lines[0].id, reason: 'first-open' })
  })
})

describe('wedgeScan', () => {
  it('adds to the active line and reports completion', () => {
    let s = fresh()
    const line = s.lines.find((l) => l.packagesExpected === 1)!
    const r = wedgeScan(s, NEW_TAG, line.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    s = r.state
    expect(r.lineId).toBe(line.id)
    expect(r.lineComplete).toBe(true)
    expect(s.scans[line.id][0].source).toBe('usb')
    expect(lineStatus(line, s.scans[line.id])).toBe('complete')
  })

  it('rejects junk with the invalid reason and a duplicate with duplicate-elsewhere', () => {
    let s = fresh()
    expect(wedgeScan(s, 'ABC123', s.lines[0].id)).toMatchObject({ ok: false, reason: 'invalid' })
    const first = wedgeScan(s, NEW_TAG, s.lines[0].id)
    if (!first.ok) throw new Error('expected ok')
    s = first.state
    expect(wedgeScan(s, NEW_TAG, s.lines[1].id)).toMatchObject({ ok: false, reason: 'duplicate-elsewhere' })
    expect(wedgeScan(s, NEW_TAG, s.lines[0].id)).toMatchObject({ ok: false, reason: 'duplicate-here' })
  })

  it('reports no-open-line only when everything is complete', () => {
    let s = fresh()
    for (const l of s.lines) for (const t of l.recordedTags) {
      const r = wedgeScan(s, t, l.id)
      if (r.ok) s = r.state
    }
    expect(firstOpenLine(s)).toBeUndefined()
    expect(wedgeScan(s, NEW_TAG, null)).toMatchObject({ ok: false, reason: 'no-open-line' })
    expect(wedgeScan(s, 'nope', null)).toMatchObject({ ok: false, reason: 'invalid' })
  })
})

describe('firstOpenLine', () => {
  it('wraps around after the given line', () => {
    const s = fresh()
    const last = s.lines[s.lines.length - 1]
    expect(firstOpenLine(s, last.id)?.id).toBe(s.lines[0].id)
    expect(firstOpenLine(s, s.lines[0].id)?.id).toBe(s.lines[1].id)
  })
})

describe('resolveLayout', () => {
  it('prefers URL, then saved preference, then width', () => {
    expect(resolveLayout('auto', true, '?layout=phone')).toBe('phone')
    expect(resolveLayout('phone', true, '')).toBe('phone')
    expect(resolveLayout('laptop', false, '')).toBe('laptop')
    expect(resolveLayout('auto', true, '')).toBe('laptop')
    expect(resolveLayout('auto', false, '')).toBe('phone')
  })
})

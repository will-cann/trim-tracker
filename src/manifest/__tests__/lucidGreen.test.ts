import { describe, it, expect } from 'vitest'
import { parseLucidCode } from '../lib/lucidGreen'
import { parsePickList } from '../lib/pickList'
import { addScan, createOrderState, isNotATag, scanFailureMessage } from '../lib/order'
import { wedgeScan } from '../lib/wedge'
import { DEFAULT_LICENSES } from '../lib/storage'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'

const fresh = () => createOrderState(parsePickList(SAMPLE_PICKLIST_CSV).lines, 'sample', DEFAULT_LICENSES)

// Formats from https://docs.lucidgreen.io/lucidids.html
const CASE_URL = 'https://qr.lcdg.io/c/MEjwvA9YoDPWBjbcXcjUki'
const ITEM_URL = 'https://qr.lcdg.io/KiX44KRHZ8355HBCPbjZ9r'
const METRC_TAG = '1A40C0300000B55000142105' // Daily Driver Dolato case, CUL000030

describe('parseLucidCode', () => {
  it('recognises a CaseID URL and extracts the id', () => {
    expect(parseLucidCode(CASE_URL)).toEqual({ kind: 'case', id: 'MEjwvA9YoDPWBjbcXcjUki' })
    expect(parseLucidCode('https://qr.lcdg.io/case/MEjwvA9YoDPWBjbcXcjUki/')).toEqual({ kind: 'case', id: 'MEjwvA9YoDPWBjbcXcjUki' })
  })

  it('recognises a unit-level LucidID URL', () => {
    expect(parseLucidCode(ITEM_URL)).toEqual({ kind: 'item', id: 'KiX44KRHZ8355HBCPbjZ9r' })
  })

  it('accepts the documented domain variants: http, lucidgreen.io, any subdomain, trailing slash, surrounding whitespace', () => {
    expect(parseLucidCode('http://lcdg.io/c/MEjwvA9YoDPWBjbcXcjUki')?.kind).toBe('case')
    expect(parseLucidCode('https://lucidgreen.io/c/MEjwvA9YoDPWBjbcXcjUki')?.kind).toBe('case')
    expect(parseLucidCode('https://scan.app.lucidgreen.io/c/MEjwvA9YoDPWBjbcXcjUki/')?.kind).toBe('case')
    expect(parseLucidCode(`  ${CASE_URL}\n`)?.kind).toBe('case')
    expect(parseLucidCode('QR.LCDG.IO/C/MEJWVA9YODPWBJBCXCJUKI')?.kind).toBe('case')
  })

  it('ignores Metrc tags, junk and other domains', () => {
    expect(parseLucidCode(METRC_TAG)).toBeNull()
    expect(parseLucidCode('ABC123')).toBeNull()
    expect(parseLucidCode('')).toBeNull()
    expect(parseLucidCode('https://example.com/c/MEjwvA9YoDPWBjbcXcjUki')).toBeNull()
    expect(parseLucidCode('https://notlcdg.io/c/MEjwvA9YoDPWBjbcXcjUki')).toBeNull()
    expect(parseLucidCode('https://qr.lcdg.io/c/')).toBeNull()
    expect(parseLucidCode('https://qr.lcdg.io/c/has-a-dash')).toBeNull()
  })
})

describe('scanning a Lucid Green QR instead of the Metrc barcode', () => {
  it('phone: addScan names the label and leaves the line untouched', () => {
    const s = fresh()
    const line = s.lines[0]
    expect(addScan(s, line.id, CASE_URL, 'camera')).toEqual({ ok: false, reason: 'case-id', detail: 'MEjwvA9YoDPWBjbcXcjUki' })
    expect(addScan(s, line.id, ITEM_URL, 'camera')).toEqual({ ok: false, reason: 'lucid-id', detail: 'KiX44KRHZ8355HBCPbjZ9r' })
    expect(s.scans[line.id] ?? []).toHaveLength(0)
  })

  it('phone: the same case is still accepted once the Metrc barcode is scanned', () => {
    const s = fresh()
    const line = s.lines[0]
    const r = addScan(s, line.id, METRC_TAG, 'camera')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.scans[line.id].map((x) => x.tag)).toEqual([METRC_TAG])
  })

  it('laptop: wedgeScan reports the label whether or not a line is active', () => {
    const s = fresh()
    expect(wedgeScan(s, CASE_URL, s.lines[0].id)).toMatchObject({ ok: false, reason: 'case-id', detail: 'MEjwvA9YoDPWBjbcXcjUki', lineId: s.lines[0].id })
    // No active line: routed to the first open line, still explained.
    expect(wedgeScan(s, CASE_URL, null)).toMatchObject({ ok: false, reason: 'case-id', lineId: s.lines[0].id })
    expect(wedgeScan(s, ITEM_URL, null)).toMatchObject({ ok: false, reason: 'lucid-id', lineId: s.lines[0].id })
  })

  it('laptop: still explained when every line is already complete (no line to route to)', () => {
    let s = fresh()
    for (const l of s.lines) for (const t of l.recordedTags) {
      const r = wedgeScan(s, t, l.id)
      if (r.ok) s = r.state
    }
    expect(wedgeScan(s, CASE_URL, null)).toMatchObject({ ok: false, reason: 'case-id', detail: 'MEjwvA9YoDPWBjbcXcjUki', lineId: null })
    // A real new tag in that state still gets the old message.
    expect(wedgeScan(s, METRC_TAG, null)).toMatchObject({ ok: false, reason: 'no-open-line' })
  })

  it('tells the picker which barcode to scan instead', () => {
    expect(scanFailureMessage('case-id')).toMatch(/CaseID label.*blue Metrc barcode/)
    expect(scanFailureMessage('lucid-id')).toMatch(/LucidID.*blue Metrc barcode/)
    expect(scanFailureMessage('invalid')).toMatch(/Not a Metrc tag/)
  })

  it('isNotATag groups the three "wrong kind of code" reasons', () => {
    expect(isNotATag('invalid')).toBe(true)
    expect(isNotATag('case-id')).toBe(true)
    expect(isNotATag('lucid-id')).toBe(true)
    expect(isNotATag('duplicate-here')).toBe(false)
    expect(isNotATag('is-lot-tag')).toBe(false)
    expect(isNotATag('no-open-line')).toBe(false)
  })
})

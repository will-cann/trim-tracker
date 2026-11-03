import { describe, it, expect } from 'vitest'
import { parsePickList } from '../lib/pickList'
import { addScan, createOrderState } from '../lib/order'
import { factsForLicense, matchByFacts, matchRecorded, mergeFacts, queryLicenses } from '../lib/scanFirst'
import { splitTag, shortTag } from '../lib/metrc'
import { DEFAULT_LICENSES } from '../lib/storage'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'
import type { T3PackageFacts } from '../../../shared/manifest/t3'
import type { OrderState } from '../types'

const { lines } = parsePickList(SAMPLE_PICKLIST_CSV)
const fresh = (): OrderState => createOrderState(lines, 'sample', DEFAULT_LICENSES)

// Sample order: "Proper - Pre-Roll - 1g - Legend OG" is lot …9173 with cases …135922/23.
const LEGEND = lines.find((l) => l.productName.includes('Legend OG'))!
const LEGEND_CASE = '1A40C0300000B55000135922'
const NEW_CASE = '1A40C0300000B55000999999'

const facts = (over: Partial<T3PackageFacts>): T3PackageFacts => ({
  tag: NEW_CASE,
  state: 'eligible',
  licenseNumber: 'CUL000030',
  itemName: 'Proper - Pre-Roll - 1g - Legend OG',
  quantity: 50,
  unit: 'ea',
  sourcePackageLabels: [LEGEND.lotTag!],
  ...over,
})

describe('tag display', () => {
  it('shows the last seven characters with leading zeros muted', () => {
    expect(splitTag('1A40C030000038B000008955')).toEqual({ head: '1A40C030000038B00', zeros: '000', digits: '8955' })
    expect(splitTag('1A40C0300000B56000146121')).toEqual({ head: '1A40C0300000B5600', zeros: '0', digits: '146121' })
    expect(shortTag('1A40C0300000B56000146121')).toBe('…0146121')
  })

  it('always keeps at least one digit', () => {
    expect(splitTag('1A40C0300000B56000000000')).toEqual({ head: '1A40C0300000B5600', zeros: '000000', digits: '0' })
  })
})

describe('matchRecorded', () => {
  it('routes a tag Apex recorded to its line without asking Metrc', () => {
    expect(matchRecorded(fresh(), LEGEND_CASE)).toEqual({ kind: 'line', lineId: LEGEND.id, how: 'recorded' })
  })

  it('knows nothing about an unrecorded tag', () => {
    expect(matchRecorded(fresh(), NEW_CASE)).toEqual({ kind: 'none' })
  })
})

describe('matchByFacts', () => {
  it("matches by the package's parent lot", () => {
    expect(matchByFacts(fresh(), facts({}))).toEqual({ kind: 'line', lineId: LEGEND.id, how: 'lot' })
  })

  it('falls back to the item name when Metrc lists no parent', () => {
    expect(matchByFacts(fresh(), facts({ sourcePackageLabels: [] }))).toEqual({ kind: 'line', lineId: LEGEND.id, how: 'product' })
  })

  it('prefers the one open line when the same lot is on two lines', () => {
    // "Puffer Fumez" appears twice (2 cases + a 4-unit partial), same lot.
    const puffer = lines.filter((l) => l.productName.includes('Puffer Fumez'))
    expect(puffer).toHaveLength(2)
    const state = fresh()
    const f = facts({ sourcePackageLabels: [puffer[0].lotTag!], itemName: puffer[0].productName })
    const first = matchByFacts(state, f)
    expect(first.kind).toBe('ambiguous')
    if (first.kind !== 'ambiguous') return
    expect(first.lineIds.sort()).toEqual(puffer.map((l) => l.id).sort())

    // Fill the 4-unit line; the two-case line is the only one still open.
    const partial = puffer.find((l) => l.packagesExpected === 1)!
    const filled = addScan(state, partial.id, '1A40C0300000B56000294260', 'camera')
    expect(filled.ok).toBe(true)
    if (!filled.ok) return
    expect(matchByFacts(filled.state, f)).toEqual({ kind: 'line', lineId: puffer.find((l) => l.packagesExpected === 2)!.id, how: 'lot' })
  })

  it('gives up on a package Metrc cannot find or that matches nothing', () => {
    expect(matchByFacts(fresh(), { tag: NEW_CASE, state: 'not_found' })).toEqual({ kind: 'none' })
    expect(matchByFacts(fresh(), facts({ sourcePackageLabels: ['1A40C0300000B55000000001'], itemName: 'Goodnight - Gumdrops - 100mg' }))).toEqual({ kind: 'none' })
  })
})

describe('queryLicenses', () => {
  it('asks the licence most of the order ships from first', () => {
    const q = queryLicenses(fresh())
    // Sample is all pre-rolls: whole-flower ones from cultivation, infused from manufacturing.
    expect(q).not.toBeNull()
    expect(new Set([q!.primary, ...q!.others])).toEqual(new Set([DEFAULT_LICENSES.cultivation, DEFAULT_LICENSES.manufacturing]))
  })
})

describe('factsForLicense', () => {
  it('restates "other licence" as eligible when the line ships from that licence', () => {
    const f = facts({ state: 'other_license', licenseNumber: 'MAN000043', reason: 'eligible from MAN000043, not CUL000030' })
    expect(factsForLicense(f, 'MAN000043')).toMatchObject({ state: 'eligible', reason: undefined })
  })

  it('restates eligible as "other licence" when the line ships from a different one', () => {
    expect(factsForLicense(facts({}), 'MAN000043')).toMatchObject({ state: 'other_license', reason: 'eligible from CUL000030, not MAN000043' })
  })

  it('leaves not-found alone', () => {
    const f: T3PackageFacts = { tag: NEW_CASE, state: 'not_found' }
    expect(factsForLicense(f, 'CUL000030')).toBe(f)
  })
})

describe('mergeFacts', () => {
  it('adds to the snapshot without dropping earlier packages', () => {
    const a = mergeFacts(fresh(), facts({ tag: 'A' }), 'read-only')
    const b = mergeFacts(a, facts({ tag: 'B' }), 'read-only')
    expect(Object.keys(b.metrc!.byTag).sort()).toEqual(['A', 'B'])
  })
})

describe('addScan recorded-tag warning', () => {
  it('warns when a case is outside what Apex recorded for the line', () => {
    const r = addScan(fresh(), LEGEND.id, NEW_CASE, 'camera')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.warning).toMatch(/Not one of the 2 tags Apex recorded/)
  })

  it('stays quiet for a recorded case', () => {
    const r = addScan(fresh(), LEGEND.id, LEGEND_CASE, 'camera')
    expect(r.ok && r.warning).toBeUndefined()
  })
})

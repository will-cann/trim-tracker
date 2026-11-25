/**
 * Chris Wade's first real run (Proper-5718, 2026-11-06): the pick-list CSV he
 * exported, the case tags on the two manifests the picker produced, and the
 * invoice PDF transcribed the way parse-pick-list returns it. Apex puts the
 * case-tag pool after the lot in Batch ID — "(#143967-143980)" — which the
 * picker did not read at the time.
 */
import { describe, it, expect } from 'vitest'
import { parsePickList } from '../lib/pickList'
import { addScan, createOrderState } from '../lib/order'
import { matchRecorded } from '../lib/scanFirst'
import { routeScan } from '../lib/wedge'
import { describeRecorded, hasRecorded, lineRecordsTag, parseSuffixRanges, tagInSuffixRanges } from '../lib/recorded'
import { pickLinesFromDocument } from '../lib/pickListPdf'
import { DEFAULT_LICENSES } from '../lib/storage'
import type { PickListDocLine, PickListDocument } from '../../../shared/manifest/pickListDocument'

const HEADER = `"Order Number","Brand","Operation","Category","Product Type","Product Name","Product SKU","Batch ID","Metrc Package ID","Storage Location","Potency","Quantity","Buyer","Buyer Shipping Address","Buyer License's","Picked","Note" `
const BUYER = `"Key MO - Richmond Heights","1026 S. Brentwood Blvd.,  Richmond Heights,, Missouri, 63117, US","DIS000114","pending", `
const CSV = [
  HEADER,
  `"Proper-5718","Honeybee","Proper Brands HQ1","Edibles & Drink","Gumdrop","Honeybee - Solventless Rosin Gumdrops - 300mg - 20ct - Tangerine Dream - Sativa",,"Honeybee - Solventless Rosin Gumdrops - 300mg - 20ct - Tangerine Dream - Sativa #1A40C0300000B56000273796","",,""," 1 Case (10 Units) | 1 Unit Per Unit",${BUYER}`,
  `"Proper-5718","Proper Cannabis","Proper Brands HQ1","Prepack","A Bud","Proper - Half Ounce - 14g - Marshmallowz","Proper - Half Ounce - 14g - Marshmallowz","Proper - Half Ounce - 14g - Marshmallowz #1A40C0300000B55000128505 (#143967-143980)","",,"23%"," 1 Case (16 Units)",${BUYER}`,
  `"Proper-5718","Honeybee","Proper Brands HQ1","Edibles & Drink","Gumdrop","Honeybee - Solventless Rosin Gumdrops - 100mg - 20ct - Tangerine Dream","Honeybee - Solventless Rosin Gumdrops - 100mg - 20ct - Tangerine Dream","Honeybee - Solventless Rosin Gumdrops - 100mg - 20ct - Tangerine Dream #1A40C0300000B56000273819 (#291767-291905, 307867-307910)","",,""," 1 Case (10 Units) | 1 Unit Per Unit",${BUYER}`,
  `"Proper-5718","Proper Cannabis","Proper Brands HQ1","Preroll","Whole Flower","Proper - Live Rosin Infused Pre-Roll - 1g - "Marshmallow Melt" - Mix #134",,"Proper - Live Rosin Infused Pre-Roll - 1g - "Marshmallow Melt" - Mix #134 #1A40C030000038B000009518 (#315317-315364","",,"40.87%"," 1 Case (20 Units)",${BUYER}`,
  `"Proper-5718","RATIO","Proper Brands HQ1","Edibles & Drink","Mint","Ratio - Focus 5:1 Microdose Mints - 100mg - Peppermint","Ratio - Focus 5:1 Microdose Mints - 100mg - Peppermint","Ratio - Focus 5:1 Microdose Mints - 100mg - Peppermint #1A40C0300000B56000273751 (#316541-316637)","",,""," 1 Case (24 Units) | 1 Unit Per Unit",${BUYER}`,
  `"Proper-5718","Proper Cannabis","Proper Brands HQ1","Extract","Badder","Proper - Badder - 2g - Black Maple 22",,"Proper - Badder - 2g - Black Maple 22 #1A40C0300000B56000287352","",,"67.25%"," 1 Case (12 Units) | 2 Grams Per Unit",${BUYER}`,
].join('\n')

// Case tags from Proper-5718_CUL000030 / _MAN000043_transfer.t3csv
const SCANNED = {
  marshmallowz: '1A40C0300000B55000143972',
  honeybee100: '1A40C0300000B56000291814',
  marshmallowMelt: '1A40C0300000B56000315343',
  ratioFocus: '1A40C0300000B56000315175',
  badder: '1A40C0300000B56000305271',
}

const byName = (needle: string) => {
  const { lines } = parsePickList(CSV)
  const l = lines.find((x) => x.productName.includes(needle))
  if (!l) throw new Error(`no line ${needle}`)
  return l
}

describe('parseSuffixRanges', () => {
  it('reads one range, several ranges, and an unclosed one', () => {
    expect(parseSuffixRanges('Proper - Half Ounce #1A40C0300000B55000128505 (#143967-143980)')).toEqual([{ from: '143967', to: '143980' }])
    expect(parseSuffixRanges('#1A40C0300000B56000273819 (#291767-291905, 307867-307910)')).toEqual([
      { from: '291767', to: '291905' },
      { from: '307867', to: '307910' },
    ])
    expect(parseSuffixRanges('#1A40C030000038B000009518 (#315317-315364')).toEqual([{ from: '315317', to: '315364' }])
  })

  it('accepts the shorthand end and rejects backwards or absurd ranges and digits inside tags', () => {
    expect(parseSuffixRanges('(#146121-131)')).toEqual([{ from: '146121', to: '146131' }])
    expect(parseSuffixRanges('(#146131-146121)')).toEqual([])
    expect(parseSuffixRanges('(#100000-900000)')).toEqual([])
    expect(parseSuffixRanges('1A40C0300000B56000146121-1A40C0300000B56000146131')).toEqual([])
    expect(parseSuffixRanges('Mix #134 #1A40C0300000B56000273796')).toEqual([])
  })

  it('matches on trailing digits only, whatever the prefix', () => {
    const r = [{ from: '315317', to: '315364' }]
    expect(tagInSuffixRanges('1A40C0300000B56000315343', r)).toBe(true)
    expect(tagInSuffixRanges('1A40C030000038B000315343', r)).toBe(true)
    expect(tagInSuffixRanges('1A40C0300000B56000315365', r)).toBe(false)
    expect(tagInSuffixRanges('1A40C0300000B5600031534X', r)).toBe(false)
    expect(tagInSuffixRanges('1A40C0300000B56000315343', undefined)).toBe(false)
  })
})

describe('Proper-5718 pick list CSV', () => {
  it('parses all six rows, including the one with inner quotes and a stray paren', () => {
    const { lines, warnings } = parsePickList(CSV)
    expect(warnings).toEqual([])
    expect(lines).toHaveLength(6)
    expect(byName('Marshmallow Melt')).toMatchObject({
      lotTag: '1A40C030000038B000009518',
      packagesExpected: 1,
      unitsPerPackage: 20,
      recordedTags: [],
      recordedRanges: [{ from: '315317', to: '315364' }],
    })
    expect(byName('Marshmallowz').recordedRanges).toEqual([{ from: '143967', to: '143980' }])
    expect(byName('100mg - 20ct - Tangerine').recordedRanges).toEqual([
      { from: '291767', to: '291905' },
      { from: '307867', to: '307910' },
    ])
    expect(byName('Badder').recordedRanges).toEqual([])
    expect(hasRecorded(byName('Badder'))).toBe(false)
    expect(hasRecorded(byName('Marshmallowz'))).toBe(true)
  })

  it('does not offer the pools as tags to import', () => {
    const { lines } = parsePickList(CSV)
    expect(lines.every((l) => l.recordedTags.length === 0)).toBe(true)
  })

  it('routes the cases Chris actually scanned to their lines, offline', () => {
    const { lines } = parsePickList(CSV)
    const state = createOrderState(lines, 'Picklist-57184.csv', DEFAULT_LICENSES)
    expect(matchRecorded(state, SCANNED.marshmallowz)).toEqual({ kind: 'line', lineId: byName('Marshmallowz').id, how: 'recorded' })
    expect(matchRecorded(state, SCANNED.honeybee100)).toEqual({ kind: 'line', lineId: byName('100mg - 20ct - Tangerine').id, how: 'recorded' })
    // The infused pre-roll's lot is on the other licence's prefix; the case range still finds it.
    expect(matchRecorded(state, SCANNED.marshmallowMelt)).toEqual({ kind: 'line', lineId: byName('Marshmallow Melt').id, how: 'recorded' })
    expect(routeScan(state, SCANNED.marshmallowMelt, null)).toEqual({ lineId: byName('Marshmallow Melt').id, reason: 'recorded' })
    // Nothing recorded for the badder or the 300mg gumdrops: falls through to Metrc / the active line.
    expect(matchRecorded(state, SCANNED.badder)).toEqual({ kind: 'none' })
    expect(routeScan(state, SCANNED.badder, byName('Badder').id)).toEqual({ lineId: byName('Badder').id, reason: 'active' })
  })

  it('flags the Ratio Focus case, which was outside the range Apex recorded', () => {
    const { lines } = parsePickList(CSV)
    const state = createOrderState(lines, 'Picklist-57184.csv', DEFAULT_LICENSES)
    const focus = byName('Focus 5:1')
    expect(lineRecordsTag(focus, SCANNED.ratioFocus)).toBe(false)
    const r = addScan(state, focus.id, SCANNED.ratioFocus, 'camera')
    expect(r.ok && r.warning).toBe(`Not among the cases Apex recorded for this line (${describeRecorded(focus)}). Check the case.`)
    expect(describeRecorded(focus)).toBe('…316541 to …316637')

    const ok = addScan(state, byName('Marshmallowz').id, SCANNED.marshmallowz, 'camera')
    expect(ok.ok && ok.warning).toBeUndefined()
    const badder = addScan(state, byName('Badder').id, SCANNED.badder, 'camera')
    expect(badder.ok && badder.warning).toBeUndefined()
  })
})

/** Lines 1, 2, 4, 14 and 21 of Proper-5718.pdf as parse-pick-list would return them. */
function docLine(over: Partial<PickListDocLine> & Pick<PickListDocLine, 'productName' | 'lotTag'>): PickListDocLine {
  return {
    brand: null,
    category: null,
    productType: null,
    sku: null,
    lotLabel: null,
    metrcTags: [],
    packages: 1,
    totalUnits: null,
    unitsPerPackage: null,
    potency: null,
    unitPrice: null,
    casePrice: null,
    lineTotal: null,
    ...over,
  }
}

const INVOICE: PickListDocument = {
  orderNumber: 'Proper-5718',
  buyer: 'Key MO - Richmond Heights',
  buyerLicense: 'DIS000114',
  buyerAddress: '1026 S. Brentwood Blvd., Richmond Heights, Missouri 63117',
  notes: null,
  lines: [
    docLine({ productName: 'Proper - Sauce+ - 1g - Skywalker OG', brand: 'Proper Cannabis', category: 'Carts & Vapes', productType: 'Cartridge', sku: 'Proper - Sauce+ - 1g - Skywalker OG', lotTag: '1A40C0300000B56000273850', metrcTags: ['(#319491-319558)'], totalUnits: 12, unitsPerPackage: 12, potency: '86.38 % THC', casePrice: 180, lineTotal: 180 }),
    docLine({ productName: "Proper - Sauced - AIO - 1g - Tiger's Milk - Indica", brand: 'Proper Cannabis', category: 'Carts & Vapes', productType: 'Cartridge', lotTag: '1A40C0300000B56000273840', metrcTags: ['(#314803-314872)'], totalUnits: 12, unitsPerPackage: 12, potency: '79.61 % THC', casePrice: 264, lineTotal: 264 }),
    docLine({ productName: 'Honeybee - Solventless Rosin Gumdrops - 100mg - 20ct - Tangerine Dream', brand: 'Honeybee', category: 'Edibles & Drinks', productType: 'Gumdrop', lotTag: '1A40C0300000B56000273819', metrcTags: ['(#291767-291905, 307867-307910)'], totalUnits: 10, unitsPerPackage: 10, casePrice: 100, lineTotal: 100 }),
    docLine({ productName: 'Proper - Half Ounce - 14g - Marshmallowz', brand: 'Proper Cannabis', category: 'Prepack', productType: 'A Bud', lotTag: '1A40C0300000B55000128505', metrcTags: ['(#143967-143980)'], totalUnits: 16, unitsPerPackage: 16, potency: '23 % THC', casePrice: 672, lineTotal: null }),
    docLine({ productName: 'Proper - Live Rosin Infused Pre-Roll - 1g - "Marshmallow Melt" - Mix #134', brand: 'Proper Cannabis', category: 'Prerolls', productType: 'Whole Flower', lotTag: '1A40C030000038B000009518', metrcTags: ['(#315317-315364)'], totalUnits: 20, unitsPerPackage: 20, potency: '40.87 % THC', casePrice: 160, lineTotal: 160 }),
  ],
}

describe('Proper-5718 invoice PDF → pick lines', () => {
  it('matches the CSV export line for line on lot, pool, quantity and buyer', () => {
    const { lines, lineTotals, warnings } = pickLinesFromDocument(INVOICE)
    expect(warnings).toEqual([])
    expect(lines).toHaveLength(5)
    const fromPdf = (needle: string) => lines.find((l) => l.productName.includes(needle))!

    for (const needle of ['Marshmallowz', '100mg - 20ct - Tangerine', 'Marshmallow Melt']) {
      const csv = byName(needle)
      const pdf = fromPdf(needle)
      expect(pdf.lotTag).toBe(csv.lotTag)
      expect(pdf.lotLabel).toBe(csv.lotLabel.replace(/ \(#315317-315364$/, ' (#315317-315364)'))
      expect(pdf.recordedRanges).toEqual(csv.recordedRanges)
      expect(pdf.recordedTags).toEqual([])
      expect([pdf.packagesExpected, pdf.unitsPerPackage, pdf.totalUnits]).toEqual([csv.packagesExpected, csv.unitsPerPackage, csv.totalUnits])
      expect([pdf.buyer, pdf.buyerLicense, pdf.orderNumber]).toEqual([csv.buyer, csv.buyerLicense, csv.orderNumber])
    }
    expect(fromPdf('Skywalker').potency).toBe('86.38 % THC')
    expect(fromPdf('Skywalker').unitWeightG).toBe(1)
    expect(fromPdf('Marshmallowz').unitWeightG).toBe(14)

    // Final line prices after customer discount seed the wholesale prices; the case price covers a missing total.
    expect(lineTotals).toEqual({
      'Proper-5718-1': '180.00',
      'Proper-5718-2': '264.00',
      'Proper-5718-3': '100.00',
      'Proper-5718-4': '672.00',
      'Proper-5718-5': '160.00',
    })
  })

  it('routes the scanned cases the same way the CSV does', () => {
    const { lines } = pickLinesFromDocument(INVOICE)
    const state = createOrderState(lines, 'Proper-5718.pdf', DEFAULT_LICENSES)
    expect(matchRecorded(state, SCANNED.marshmallowMelt)).toMatchObject({ kind: 'line', how: 'recorded' })
    expect(matchRecorded(state, SCANNED.honeybee100)).toMatchObject({ kind: 'line', how: 'recorded' })
    expect(matchRecorded(state, SCANNED.ratioFocus)).toEqual({ kind: 'none' })
  })
})

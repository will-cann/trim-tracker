import { describe, it, expect } from 'vitest'
import { pickLinesFromDocument } from '../lib/pickListPdf'
import type { PickListDocument, PickListDocLine } from '../../../shared/manifest/pickListDocument'

const LOT = '1A40C0300000B56000108430'
const CASE1 = '1A40C0300000B56000146121'
const CASE2 = '1A40C0300000B56000146122'
const CASE3 = '1A40C0300000B56000146123'

function line(over: Partial<PickListDocLine>): PickListDocLine {
  return {
    productName: 'Proper - Pre-Roll - 1g - Legend OG',
    brand: null,
    category: null,
    productType: null,
    sku: null,
    lotTag: LOT,
    lotLabel: null,
    metrcTags: [],
    packages: 2,
    totalUnits: 100,
    unitsPerPackage: 50,
    potency: 'THC 24.1%',
    unitPrice: 4.5,
    lineTotal: 450,
    ...over,
  }
}

function doc(lines: PickListDocLine[], over: Partial<PickListDocument> = {}): PickListDocument {
  return { orderNumber: 'Proper-4934', buyer: 'Terrabis - Springfield', buyerLicense: 'DIS000045', buyerAddress: '1234 S Glenstone', notes: null, lines, ...over }
}

describe('pickLinesFromDocument', () => {
  it('builds pick lines with the same shape the CSV parser produces', () => {
    const { lines, lineTotals, warnings } = pickLinesFromDocument(doc([line({ metrcTags: [`${CASE1}-${CASE3}`] })]))
    expect(warnings).toEqual([])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      id: 'Proper-4934-1',
      orderNumber: 'Proper-4934',
      brand: 'Proper',
      category: 'Pre-Roll',
      productType: 'Pre-Roll',
      lotTag: LOT,
      lotLabel: `Proper - Pre-Roll - 1g - Legend OG #${LOT}`,
      packagesExpected: 2,
      unitsPerPackage: 50,
      totalUnits: 100,
      unitWeightG: 1,
      buyer: 'Terrabis - Springfield',
      buyerLicense: 'DIS000045',
      potency: 'THC 24.1%',
    })
    expect([...lines[0].recordedTags].sort()).toEqual([CASE1, CASE2, CASE3])
    expect(lineTotals).toEqual({ 'Proper-4934-1': '450.00' })
  })

  it('prefers the sheet columns over splitting the name and prices from unit price when no total is printed', () => {
    const { lines, lineTotals } = pickLinesFromDocument(
      doc([line({ brand: 'Daily Driver', category: 'Flower', productType: 'Eighths', productName: 'Daily Driver - Eighths - 3.5g - Dolato', lineTotal: null, unitPrice: 20, totalUnits: 10, packages: 1, unitsPerPackage: 10 })]),
    )
    expect(lines[0]).toMatchObject({ brand: 'Daily Driver', category: 'Flower', productType: 'Eighths', unitWeightG: 3.5 })
    expect(lineTotals['Proper-4934-1']).toBe('200.00')
  })

  it('assumes one case when the sheet only prints units and skips lines with no quantity', () => {
    const { lines, warnings } = pickLinesFromDocument(doc([line({ packages: null, unitsPerPackage: null, totalUnits: 20 }), line({ packages: null, unitsPerPackage: null, totalUnits: null, lineTotal: null, unitPrice: null })]))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ packagesExpected: 1, unitsPerPackage: 20, totalUnits: 20 })
    expect(warnings.some((w) => w.includes('Line 2') && w.includes('skipped'))).toBe(true)
  })

  it('keeps a partial lot label and warns when no lot tags or buyer licence were printed', () => {
    const { lines, lineTotals, warnings } = pickLinesFromDocument(doc([line({ lotTag: null, lotLabel: '…108430', lineTotal: null, unitPrice: null })], { buyerLicense: null, notes: 'Second page was blank.' }))
    expect(lines[0]).toMatchObject({ lotTag: null, lotLabel: 'Proper - Pre-Roll - 1g - Legend OG #…108430' })
    expect(lineTotals).toEqual({})
    expect(warnings).toEqual([
      'No lot tags were printed on this sheet; Metrc checks will match cases by recorded tags only.',
      'No buyer licence on the sheet. Fill in the recipient licence on the review screen.',
      'Second page was blank.',
    ])
  })

  it('reports an empty document with the reader notes', () => {
    const { lines, warnings } = pickLinesFromDocument(doc([], { notes: 'This looks like a lab report.' }))
    expect(lines).toEqual([])
    expect(warnings[0]).toBe('No pick list lines found. This looks like a lab report.')
  })
})

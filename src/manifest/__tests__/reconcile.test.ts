import { describe, it, expect } from 'vitest'
import { nameOverlap, reconcileOrder, reconcilePackage, sizeGrams } from '../lib/reconcile'
import { parsePickList } from '../lib/pickList'
import { createOrderState } from '../lib/order'
import { SAMPLE_PICKLIST_CSV, SAMPLE_PICKLIST_NAME } from '../sample/proper4934'
import type { T3PackageFacts } from '../../../shared/manifest/t3'
import type { OrderState } from '../types'

const { lines } = parsePickList(SAMPLE_PICKLIST_CSV)
const legend = lines.find((l) => l.productName === 'Proper - Pre-Roll - 1g - Legend OG')!
const scorched = lines.find((l) => l.productName.includes('Scorched Citrus'))!
const puffer4 = lines.find((l) => l.productName.includes('Puffer Fumez') && l.totalUnits === 4)!

/** A Metrc case that is exactly what Apex says it is. */
function matching(line: typeof legend, tag: string, extra: Partial<T3PackageFacts> = {}): T3PackageFacts {
  return {
    tag,
    state: 'eligible',
    packageId: 1,
    licenseNumber: 'CUL000030',
    itemName: 'Legend OG Pre-Roll 1g',
    strainName: 'Legend OG',
    quantity: line.unitsPerPackage,
    unit: 'ea',
    sourcePackageLabels: line.lotTag ? [line.lotTag] : [],
    labTestingState: 'TestPassed',
    ...extra,
  }
}

describe('sizeGrams / nameOverlap', () => {
  it('reads sizes out of Apex and Metrc names', () => {
    expect(sizeGrams('Proper - Pre-Roll - .5g - "Scorched Citrus" - Mix #105')).toBe(0.5)
    expect(sizeGrams('Legend OG Pre-Roll 1g')).toBe(1)
    expect(sizeGrams('Eighths 3.5 g')).toBe(3.5)
    expect(sizeGrams('Daily Driver 100mg Gummies')).toBeNull()
  })

  it('scores Metrc item names against Apex product names', () => {
    expect(nameOverlap('Proper - Pre-Roll - 1g - Legend OG', 'Legend OG Pre-Roll 1g')).toBeGreaterThanOrEqual(0.6)
    expect(nameOverlap('Proper - Pre-Roll - 1g - Legend OG', 'Preroll 1g Legend OG')).toBeGreaterThanOrEqual(0.6)
    expect(nameOverlap('Proper - Pre-Roll - 1g - Legend OG', 'Blue Dream Flower 3.5g')).toBeLessThan(0.35)
  })
})

describe('reconcilePackage', () => {
  const tag = legend.recordedTags[0]

  it('passes a case whose lot, quantity, product and lab state all agree', () => {
    const f = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag))
    expect(f.worst).toBe('ok')
    expect(f.issues).toEqual([])
    expect(f.lot.text).toMatch(/From lot/)
    expect(f.quantity.text).toBe('50 units, as picked')
  })

  it('flags a case from a different lot than the Apex Batch ID', () => {
    const f = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { sourcePackageLabels: ['1A40C030000038B000009999'] }))
    expect(f.lot.verdict).toBe('bad')
    expect(f.lot.text).toBe('From lot …00009999; Apex expects …00009173')
    expect(f.worst).toBe('bad')
  })

  it('flags a unit count that does not match the case size', () => {
    const f = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { quantity: 40 }))
    expect(f.quantity.verdict).toBe('bad')
    expect(f.quantity.text).toBe('Metrc has 40 units; pick list case is 50')
  })

  it('compares weight-based packages through units × unit weight', () => {
    const ok = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { quantity: 50, unit: 'g' }))
    expect(ok.quantity.verdict).toBe('ok')
    const bad = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { quantity: 25, unit: 'g' }))
    expect(bad.quantity.verdict).toBe('bad')
    expect(bad.quantity.text).toMatch(/should be 50 g/)
  })

  it('flags a different product or a different size', () => {
    const size = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { itemName: 'Legend OG Pre-Roll .5g' }))
    expect(size.product.verdict).toBe('bad')
    expect(size.product.text).toMatch(/\(0\.5 g\); Apex line is 1 g/)

    const other = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { itemName: 'Blue Dream Flower 1g', strainName: 'Blue Dream' }))
    expect(other.product.verdict).toBe('bad')
  })

  it('accepts a loosely named Metrc item when the strain matches', () => {
    const f = reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { itemName: 'Legend OG PR', strainName: 'Legend OG' }))
    expect(['ok', 'warn']).toContain(f.product.verdict)
    expect(f.product.verdict).not.toBe('bad')
  })

  it('reports lab testing problems', () => {
    expect(reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { labTestingState: 'TestFailed' })).lab.verdict).toBe('bad')
    expect(reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { labTestingState: 'SubmittedForTesting' })).lab.verdict).toBe('warn')
    expect(reconcilePackage(tag, legend, 'CUL000030', matching(legend, tag, { labTestingState: 'NotRequired' })).lab.verdict).toBe('ok')
  })

  it('reports eligibility problems without piling on comparisons for unknown tags', () => {
    const wrongLic = reconcilePackage(tag, legend, 'MAN000043', matching(legend, tag, { state: 'other_license', licenseNumber: 'CUL000030' }))
    expect(wrongLic.eligibility.verdict).toBe('bad')
    expect(wrongLic.eligibility.text).toBe('Lives on CUL000030, not MAN000043')

    const missing = reconcilePackage(tag, legend, 'CUL000030', { tag, state: 'not_found', reason: 'nope' })
    expect(missing.eligibility.verdict).toBe('bad')
    expect(missing.lot.verdict).toBe('unknown')
    expect(missing.issues).toHaveLength(1)
  })

  it('is unknown before Metrc has been asked', () => {
    const f = reconcilePackage(tag, legend, 'CUL000030', null)
    expect(f.worst).toBe('unknown')
    expect(f.issues).toEqual([])
  })
})

describe('reconcileOrder', () => {
  function orderWith(facts: Record<string, T3PackageFacts>, invoiceQty?: number): OrderState {
    const base = createOrderState([legend, scorched, puffer4], SAMPLE_PICKLIST_NAME, { cultivation: 'CUL000030', manufacturing: 'MAN000043' })
    return {
      ...base,
      scans: {
        [legend.id]: legend.recordedTags.map((tag) => ({ tag, at: 1, source: 'recorded' as const })),
        [scorched.id]: [{ tag: scorched.recordedTags[0], at: 1, source: 'recorded' as const }],
      },
      invoiceLines: invoiceQty === undefined ? undefined : { [legend.id]: { description: 'Legend OG', quantity: invoiceQty, total: 350 } },
      metrc: { checkedAt: 1, mode: 'read-only', byTag: facts },
    }
  }

  it('sums Metrc units per line and compares to the pick list and invoice', () => {
    const facts: Record<string, T3PackageFacts> = {}
    for (const tag of legend.recordedTags) facts[tag] = matching(legend, tag)
    const r = reconcileOrder(orderWith(facts, 100))
    const line = r.lines.find((l) => l.line.id === legend.id)!
    expect(line.units).toEqual({ verdict: 'ok', text: '100 units in Metrc = 100 on the pick list' })
    expect(line.invoice.verdict).toBe('ok')
    expect(line.worst).toBe('ok')
    expect(r.packagesChecked).toBe(2)
    // scorched's one case is scanned but unchecked, so the order is not all clear
    expect(r.allClear).toBe(false)
    const sc = r.lines.find((l) => l.line.id === scorched.id)!
    expect(sc.count.verdict).toBe('warn')
    expect(sc.units.text).toBe('Not checked yet')
  })

  it('flags an invoice that bills a different unit count', () => {
    const facts: Record<string, T3PackageFacts> = {}
    for (const tag of legend.recordedTags) facts[tag] = matching(legend, tag)
    const r = reconcileOrder(orderWith(facts, 90))
    const line = r.lines.find((l) => l.line.id === legend.id)!
    expect(line.invoice).toEqual({ verdict: 'bad', text: 'Invoice bills 90 units; pick list has 100' })
    expect(r.bad).toBeGreaterThan(0)
  })

  it('suggests the licence Metrc actually found the cases on', () => {
    const facts: Record<string, T3PackageFacts> = {}
    for (const tag of legend.recordedTags) facts[tag] = matching(legend, tag, { state: 'other_license', licenseNumber: 'MAN000043' })
    const r = reconcileOrder(orderWith(facts))
    expect(r.licenseFixes).toEqual({ [legend.productType]: 'MAN000043' })
    expect(r.bad).toBe(2)
  })
})

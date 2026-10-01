import { describe, it, expect } from 'vitest'
import { parsePickList } from '../lib/pickList'
import { assignmentsToLineTotals, matchInvoiceLines, normalizeName, type InvoiceLine } from '../lib/invoiceMatch'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'

const lines = parsePickList(SAMPLE_PICKLIST_CSV).lines
const inv = (description: string, quantity: number | null, lineTotal: number | null, extra: Partial<InvoiceLine> = {}): InvoiceLine => ({
  description,
  sku: null,
  quantity,
  unitPrice: null,
  lineTotal,
  ...extra,
})

describe('normalizeName', () => {
  it('ignores quote style, case and punctuation', () => {
    expect(normalizeName('Proper - Live Resin Infused Pre-Roll - 1g - “Ecto Exclusive” - Mix #122')).toBe(
      normalizeName('proper live resin infused pre roll 1g "ecto exclusive" mix #122'),
    )
  })
})

describe('matchInvoiceLines', () => {
  it('captures SKU from the pick list', () => {
    expect(lines[1].sku).toContain('Ecto Exclusive')
    expect(lines[0].sku).toBe('')
  })

  it('uses quantity to tell apart two pick lines with the same product', () => {
    // "Puffer Fumez" appears as 2 cases (40 units) and as 4 loose units
    const puffer = lines.filter((l) => l.productName.includes('Puffer Fumez'))
    expect(puffer).toHaveLength(2)
    const r = matchInvoiceLines(lines, [inv(puffer[0].productName, 4, 18), inv(puffer[0].productName, 40, 180)])
    const byId = Object.fromEntries(r.assignments.map((a) => [a.lineId, a]))
    const loose = puffer.find((l) => l.totalUnits === 4)!
    const cases = puffer.find((l) => l.totalUnits === 40)!
    expect(byId[loose.id]).toMatchObject({ total: 18, method: 'name+qty' })
    expect(byId[cases.id]).toMatchObject({ total: 180, method: 'name+qty' })
  })

  it('splits one invoice line across same-name pick lines by units when quantities sum', () => {
    const puffer = lines.filter((l) => l.productName.includes('Puffer Fumez'))
    const r = matchInvoiceLines(lines, [inv(puffer[0].productName, 44, 198)])
    const totals = r.assignments.filter((a) => a.method === 'name-split').map((a) => a.total)
    expect(totals.sort((a, b) => a - b)).toEqual([18, 180])
    expect(r.assignments.reduce((s, a) => s + a.total, 0)).toBe(198)
  })

  it('falls back to a single same-name line and flags a quantity mismatch', () => {
    const stank = lines.find((l) => l.productName.includes('Stank House'))!
    const r = matchInvoiceLines(lines, [inv(stank.productName, 90, 405)])
    expect(r.assignments[0]).toMatchObject({ lineId: stank.id, total: 405, method: 'name' })
    expect(r.assignments[0].note).toMatch(/Invoice shows 90 units, pick list has 100/)
  })

  it('fuzzy-matches OCR-mangled names but not unrelated ones', () => {
    const legend = lines.find((l) => l.productName === 'Proper - Pre-Roll - 1g - Legend OG')!
    const r = matchInvoiceLines(lines, [inv('Proper Pre-Roll 1g Legend OG (100ct)', 100, 350), inv('Gummies - Watermelon 10pk', 12, 60)])
    expect(r.assignments).toHaveLength(1)
    expect(r.assignments[0]).toMatchObject({ lineId: legend.id, method: 'fuzzy', total: 350 })
    expect(r.unmatchedInvoice).toHaveLength(1)
    expect(r.unmatchedInvoice[0].description).toContain('Gummies')
  })

  it('computes a total from unit price × quantity and reports unpriced lines', () => {
    const hfcs = lines[0]
    const r = matchInvoiceLines(lines, [inv(hfcs.productName, 20, null, { unitPrice: 4.5 })])
    expect(r.assignments[0]).toMatchObject({ lineId: hfcs.id, total: 90 })
    expect(r.unpricedLineIds).toHaveLength(lines.length - 1)
    expect(assignmentsToLineTotals(r.assignments)).toEqual({ [hfcs.id]: '90.00' })
  })

  it('prefers SKU when both sides have one', () => {
    const ecto = lines.find((l) => l.sku && l.totalUnits === 20)!
    const r = matchInvoiceLines(lines, [inv('completely different text', 20, 77, { sku: ecto.sku })])
    expect(r.assignments[0]).toMatchObject({ lineId: ecto.id, method: 'sku', total: 77 })
  })
})

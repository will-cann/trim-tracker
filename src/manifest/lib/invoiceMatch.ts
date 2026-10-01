import type { PickLine } from '../types'

export interface InvoiceLine {
  description: string
  sku: string | null
  quantity: number | null
  unitPrice: number | null
  lineTotal: number | null
}

export interface ParsedInvoice {
  invoiceNumber: string | null
  orderNumber: string | null
  invoiceDate: string | null
  buyer: string | null
  total: number | null
  lines: InvoiceLine[]
  notes: string | null
}

export type MatchMethod = 'sku' | 'name+qty' | 'name-split' | 'name' | 'fuzzy'

export interface LineAssignment {
  lineId: string
  /** Dollar total for this pick line (what goes in lineTotals, split across its packages later). */
  total: number
  method: MatchMethod
  invoiceDescription: string
  note?: string
}

export interface MatchResult {
  assignments: LineAssignment[]
  unmatchedInvoice: InvoiceLine[]
  unpricedLineIds: string[]
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[^a-z0-9#.%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(' ').filter((t) => t.length > 1))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

function money(n: number): number {
  return Math.round(n * 100) / 100
}

function lineTotalOf(inv: InvoiceLine): number | null {
  if (inv.lineTotal !== null) return inv.lineTotal
  if (inv.unitPrice !== null && inv.quantity !== null) return money(inv.unitPrice * inv.quantity)
  return null
}

/**
 * Map invoice lines onto pick list lines so each line gets a dollar total.
 *
 * Apex SKUs are often blank or equal to the product name, and the same
 * product can appear twice on a pick list with different quantities (a case
 * line and a loose-units line), so name alone is ambiguous. Order of attack:
 *   1. SKU equality (when both sides have one)
 *   2. Same name, same unit quantity
 *   3. Same name, invoice quantity == sum of the remaining same-name pick
 *      lines → split the invoice total in proportion to units
 *   4. Same name, single remaining candidate (quantity differs → flagged)
 *   5. Fuzzy token overlap ≥ 0.6, best candidate, quantity used as tiebreak
 */
export function matchInvoiceLines(lines: PickLine[], invoice: InvoiceLine[]): MatchResult {
  const assignments: LineAssignment[] = []
  const unmatchedInvoice: InvoiceLine[] = []
  const taken = new Set<string>()
  const free = () => lines.filter((l) => !taken.has(l.id))

  const assign = (line: PickLine, total: number, method: MatchMethod, inv: InvoiceLine, note?: string) => {
    taken.add(line.id)
    assignments.push({ lineId: line.id, total: money(total), method, invoiceDescription: inv.description, note })
  }

  for (const inv of invoice) {
    const total = lineTotalOf(inv)
    if (total === null) {
      unmatchedInvoice.push(inv)
      continue
    }

    if (inv.sku) {
      const bySku = free().find((l) => l.sku && normalizeName(l.sku) === normalizeName(inv.sku!))
      if (bySku) {
        assign(bySku, total, 'sku', inv)
        continue
      }
    }

    const name = normalizeName(inv.description)
    const sameName = free().filter((l) => normalizeName(l.productName) === name)

    if (sameName.length) {
      const exactQty = inv.quantity !== null ? sameName.find((l) => l.totalUnits === inv.quantity) : undefined
      if (exactQty) {
        assign(exactQty, total, 'name+qty', inv)
        continue
      }
      const sumUnits = sameName.reduce((a, l) => a + l.totalUnits, 0)
      if (inv.quantity !== null && sameName.length > 1 && sumUnits === inv.quantity) {
        let remaining = money(total)
        sameName.forEach((l, i) => {
          const share = i === sameName.length - 1 ? remaining : money((total * l.totalUnits) / sumUnits)
          remaining = money(remaining - share)
          assign(l, share, 'name-split', inv, `Invoice line covers ${sameName.length} pick lines; split by units.`)
        })
        continue
      }
      if (sameName.length === 1) {
        const l = sameName[0]
        const note = inv.quantity !== null && inv.quantity !== l.totalUnits ? `Invoice shows ${inv.quantity} units, pick list has ${l.totalUnits}. Check this one.` : undefined
        assign(l, total, 'name', inv, note)
        continue
      }
    }

    const invTokens = tokens(inv.description)
    let best: { line: PickLine; score: number } | null = null
    for (const l of free()) {
      let score = jaccard(invTokens, tokens(l.productName))
      if (inv.quantity !== null && l.totalUnits === inv.quantity) score += 0.1
      if (!best || score > best.score) best = { line: l, score }
    }
    if (best && best.score >= 0.6) {
      const qtyNote = inv.quantity !== null && best.line.totalUnits !== inv.quantity ? ` Invoice shows ${inv.quantity} units, pick list has ${best.line.totalUnits}.` : ''
      assign(best.line, total, 'fuzzy', inv, `Matched by similar name (${Math.round(best.score * 100)}%).${qtyNote}`)
      continue
    }

    unmatchedInvoice.push(inv)
  }

  return { assignments, unmatchedInvoice, unpricedLineIds: free().map((l) => l.id) }
}

/** Convert assignments into the lineTotals map the order state stores. */
export function assignmentsToLineTotals(assignments: LineAssignment[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of assignments) out[a.lineId] = a.total.toFixed(2)
  return out
}

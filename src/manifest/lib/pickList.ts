import { parseCsv } from './csv'
import { extractTags, parseUnitWeightG } from './metrc'
import type { PickLine } from '../types'

const COLS = {
  order: 'order number',
  brand: 'brand',
  category: 'category',
  productType: 'product type',
  productName: 'product name',
  sku: 'product sku',
  batchId: 'batch id',
  metrcPackageId: 'metrc package id',
  potency: 'potency',
  quantity: 'quantity',
  buyer: 'buyer',
  buyerAddress: 'buyer shipping address',
  buyerLicense: "buyer license's",
  note: 'note',
} as const

export interface ParsedPickList {
  lines: PickLine[]
  warnings: string[]
}

/**
 * "1 Case (20 Units)" -> { packages: 1, total: 20 }
 * "2 Cases (100 Units)" -> { packages: 2, total: 100 }
 * "4 Units" -> { packages: 1, total: 4 }
 */
export function parseQuantity(raw: string): { packages: number; total: number } | null {
  const m = raw.match(/(\d+)\s+(cases?|units?)(?:\s*\((\d+)\s+units?\))?/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const isCase = /^case/i.test(m[2])
  if (isCase) {
    const total = m[3] ? parseInt(m[3], 10) : n
    return { packages: n, total }
  }
  return { packages: 1, total: n }
}

function headerIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {}
  header.forEach((h, i) => {
    idx[h.trim().toLowerCase()] = i
  })
  return idx
}

export function parsePickList(text: string): ParsedPickList {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  const warnings: string[] = []
  if (rows.length < 2) return { lines: [], warnings: ['No data rows found in file.'] }

  const idx = headerIndex(rows[0])
  const need = [COLS.order, COLS.productName, COLS.batchId, COLS.quantity]
  const missing = need.filter((c) => idx[c] === undefined)
  if (missing.length) {
    return { lines: [], warnings: [`Not an Apex pick list. Missing columns: ${missing.join(', ')}`] }
  }
  const get = (row: string[], col: string) => (idx[col] === undefined ? '' : (row[idx[col]] ?? '').trim())

  const lines: PickLine[] = []
  rows.slice(1).forEach((row, i) => {
    const orderNumber = get(row, COLS.order)
    const productName = get(row, COLS.productName)
    if (!orderNumber && !productName) return

    const qty = parseQuantity(get(row, COLS.quantity))
    if (!qty) {
      warnings.push(`Row ${i + 1}: could not read quantity "${get(row, COLS.quantity)}"`)
      return
    }
    const lotLabel = get(row, COLS.batchId)
    const lotTags = extractTags(lotLabel)
    const recordedTags = Array.from(
      new Set([...extractTags(get(row, COLS.metrcPackageId)), ...extractTags(get(row, COLS.note))]),
    )
    const unitsPerPackage = qty.packages > 0 ? Math.round(qty.total / qty.packages) : qty.total
    if (unitsPerPackage * qty.packages !== qty.total) {
      warnings.push(`Row ${i + 1}: ${qty.total} units does not split evenly into ${qty.packages} packages`)
    }

    lines.push({
      id: `${orderNumber || 'order'}-${i + 1}`,
      orderNumber,
      brand: get(row, COLS.brand),
      category: get(row, COLS.category),
      productType: get(row, COLS.productType),
      productName,
      sku: get(row, COLS.sku),
      lotLabel,
      lotTag: lotTags[0] ?? null,
      packagesExpected: qty.packages,
      unitsPerPackage,
      totalUnits: qty.total,
      unitWeightG: parseUnitWeightG(productName),
      buyer: get(row, COLS.buyer),
      buyerLicense: get(row, COLS.buyerLicense),
      buyerAddress: get(row, COLS.buyerAddress),
      potency: get(row, COLS.potency),
      recordedTags,
    })
  })

  return { lines, warnings }
}

/** "Proper-4934" -> "4934" (Metrc invoice numbers on Proper's manifests drop the prefix). */
export function invoiceNumberFromOrder(orderNumber: string): string {
  const m = orderNumber.match(/(\d+)\s*$/)
  return m ? m[1] : orderNumber
}

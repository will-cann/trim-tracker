/**
 * Loads a pick list from the Apex PDF (or a photo of the printed sheet)
 * instead of the CSV export. Proper's lead prints the PDF, and it carries
 * potency and price that the CSV does not, so this is the preferred path;
 * the CSV parser in pickList.ts is unchanged.
 */
import { authHeaders } from './authToken'
import { parseUnitWeightG } from './metrc'
import { extractRecordedTags } from './pickList'
import { fileToDocumentBody, postDocument } from './documentUpload'
import type { PickLine } from '../types'
import type { PickListDocLine, PickListDocument } from '../../../shared/manifest/pickListDocument'

export const PICKLIST_ACCEPT = '.csv,.pdf,image/*,application/pdf,text/csv,text/plain'

export interface PickListFromDocument {
  lines: PickLine[]
  /** Dollar totals per line id, pre-filled from the PDF's prices (keyed like OrderState.lineTotals). */
  lineTotals: Record<string, string>
  warnings: string[]
}

function sanitizeId(s: string): string {
  return s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Keeps ranges and single tags as Apex records them so expandTagRanges can read them. */
function recordedTags(line: PickListDocLine): string[] {
  return extractRecordedTags(line.metrcTags.join('\n')).filter((t) => t !== line.lotTag)
}

function quantity(line: PickListDocLine, rowNo: number, warnings: string[]): { packages: number; total: number; perPackage: number } | null {
  const total = line.totalUnits ?? (line.packages !== null && line.unitsPerPackage !== null ? line.packages * line.unitsPerPackage : null)
  if (total === null || total <= 0) {
    if (line.packages && line.packages > 0) {
      warnings.push(`Line ${rowNo}: no unit count printed; assuming 1 unit per case`)
      return { packages: line.packages, total: line.packages, perPackage: 1 }
    }
    return null
  }
  // One case per line when the sheet does not say how many; the picker can still scan more.
  const packages = line.packages && line.packages > 0 ? line.packages : 1
  const perPackage = Math.round(total / packages)
  if (perPackage * packages !== total) warnings.push(`Line ${rowNo}: ${total} units does not split evenly into ${packages} packages`)
  return { packages, total, perPackage }
}

export function pickLinesFromDocument(doc: PickListDocument): PickListFromDocument {
  const warnings: string[] = []
  const lineTotals: Record<string, string> = {}
  const orderNumber = doc.orderNumber ?? ''
  const idBase = sanitizeId(orderNumber) || 'order'
  const lines: PickLine[] = []

  doc.lines.forEach((l, i) => {
    const rowNo = i + 1
    const qty = quantity(l, rowNo, warnings)
    if (!qty) {
      warnings.push(`Line ${rowNo} (${l.productName}): could not read a quantity, skipped`)
      return
    }
    const id = `${idBase}-${rowNo}`
    const parts = l.productName.split(/\s+-\s+/)
    const lotLabel = l.lotTag ? `${l.productName} #${l.lotTag}` : l.lotLabel ? `${l.productName} #${l.lotLabel}` : l.productName
    lines.push({
      id,
      orderNumber,
      brand: l.brand ?? (parts.length > 1 ? parts[0] : ''),
      category: l.category ?? (parts.length > 2 ? parts[1] : ''),
      productType: l.productType ?? l.category ?? (parts.length > 2 ? parts[1] : ''),
      productName: l.productName,
      sku: l.sku ?? '',
      lotLabel,
      lotTag: l.lotTag,
      packagesExpected: qty.packages,
      unitsPerPackage: qty.perPackage,
      totalUnits: qty.total,
      unitWeightG: parseUnitWeightG(l.productName),
      buyer: doc.buyer ?? '',
      buyerLicense: doc.buyerLicense ?? '',
      buyerAddress: doc.buyerAddress ?? '',
      potency: l.potency ?? '',
      recordedTags: recordedTags(l),
    })
    const total = l.lineTotal ?? (l.unitPrice !== null ? Math.round(l.unitPrice * qty.total * 100) / 100 : null)
    if (total !== null && total > 0) lineTotals[id] = total.toFixed(2)
  })

  if (!lines.length) {
    warnings.unshift(doc.notes ? `No pick list lines found. ${doc.notes}` : 'No pick list lines found in this document.')
  } else {
    if (!lines.some((l) => l.lotTag)) warnings.push('No lot tags were printed on this sheet; Metrc checks will match cases by recorded tags only.')
    if (!doc.buyerLicense) warnings.push('No buyer licence on the sheet. Fill in the recipient licence on the review screen.')
    if (doc.notes) warnings.push(doc.notes)
  }
  return { lines, lineTotals, warnings }
}

export type PickListFileResult = { ok: true; result: PickListFromDocument } | { ok: false; message: string }

export async function parsePickListFile(file: File): Promise<PickListFileResult> {
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const body = await fileToDocumentBody(file)
  const res = await postDocument<PickListDocument>('parse-pick-list', headers, body, 'Pick list')
  if (!res.ok) return res
  return { ok: true, result: pickLinesFromDocument(res.data) }
}

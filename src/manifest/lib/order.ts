import type { OrderState, PackageRow, PickLine, Scan, ScanSource } from '../types'
import { guessLicenseKind, normalizeTag } from './metrc'
import { invoiceNumberFromOrder } from './pickList'
import type { LicenseDefaults } from './storage'

export const DEFAULT_ROUTE = "See Proper's separate trip plan for detailed directions."
export const TRANSFER_TYPES = ['Unaffiliated Transfer', 'Affiliated Transfer', 'Wholesale Manifest'] as const

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function createOrderState(lines: PickLine[], sourceName: string, licenses: LicenseDefaults): OrderState {
  const licenseByProductType: Record<string, string> = {}
  for (const l of lines) {
    if (!(l.productType in licenseByProductType)) {
      licenseByProductType[l.productType] =
        guessLicenseKind(l.productType, l.category) === 'manufacturing' ? licenses.manufacturing : licenses.cultivation
    }
  }
  const first = lines[0]
  return {
    loadedAt: Date.now(),
    sourceName,
    lines,
    scans: {},
    licenseByProductType,
    lineTotals: {},
    header: {
      recipientLicense: first?.buyerLicense ?? '',
      invoiceNumber: first ? invoiceNumberFromOrder(first.orderNumber) : '',
      deliveryDate: todayIso(),
      transferType: TRANSFER_TYPES[0],
      plannedRoute: DEFAULT_ROUTE,
      paymentTermDays: '30',
    },
  }
}

export type LineStatus = 'empty' | 'partial' | 'complete' | 'over'

export function lineStatus(line: PickLine, scans: Scan[] | undefined): LineStatus {
  const n = scans?.length ?? 0
  if (n === 0) return 'empty'
  if (n < line.packagesExpected) return 'partial'
  if (n === line.packagesExpected) return 'complete'
  return 'over'
}

/** tag -> lineIds it was scanned on (for cross-line duplicate detection) */
export function tagIndex(state: OrderState): Map<string, string[]> {
  const idx = new Map<string, string[]>()
  for (const [lineId, scans] of Object.entries(state.scans)) {
    for (const s of scans) {
      const list = idx.get(s.tag) ?? []
      list.push(lineId)
      idx.set(s.tag, list)
    }
  }
  return idx
}

export type ScanFailReason = 'invalid' | 'duplicate-here' | 'duplicate-elsewhere' | 'is-lot-tag'

export type AddScanResult =
  | { ok: true; state: OrderState; warning?: string }
  | { ok: false; reason: ScanFailReason; detail?: string }

export function scanFailureMessage(reason: ScanFailReason | 'no-open-line', detail?: string): string {
  switch (reason) {
    case 'invalid':
      return 'Not a Metrc tag. Tags are 24 characters starting with 1A.'
    case 'duplicate-here':
      return 'Already scanned on this line.'
    case 'duplicate-elsewhere':
      return `Already scanned on another line${detail ? `: ${detail}` : ''}.`
    case 'is-lot-tag':
      return "That's the lot tag, not a case. Scan the case label."
    case 'no-open-line':
      return 'Every line is complete. Pick a line to add more, or review & export.'
  }
}

export function addScan(state: OrderState, lineId: string, raw: string, source: ScanSource): AddScanResult {
  const tag = normalizeTag(raw)
  if (!/^1A[0-9A-Z]{22}$/.test(tag)) return { ok: false, reason: 'invalid' }

  const line = state.lines.find((l) => l.id === lineId)
  if (!line) return { ok: false, reason: 'invalid' }
  if (line.lotTag === tag) return { ok: false, reason: 'is-lot-tag' }

  const here = state.scans[lineId] ?? []
  if (here.some((s) => s.tag === tag)) return { ok: false, reason: 'duplicate-here' }

  const elsewhere = tagIndex(state).get(tag)
  if (elsewhere?.length) {
    const other = state.lines.find((l) => l.id === elsewhere[0])
    return { ok: false, reason: 'duplicate-elsewhere', detail: other?.productName }
  }

  const next: OrderState = {
    ...state,
    scans: { ...state.scans, [lineId]: [...here, { tag, at: Date.now(), source }] },
  }
  const warning =
    here.length + 1 > line.packagesExpected
      ? `That's ${here.length + 1} packages on a line that expects ${line.packagesExpected}.`
      : undefined
  return { ok: true, state: next, warning }
}

export function removeScan(state: OrderState, lineId: string, tag: string): OrderState {
  return { ...state, scans: { ...state.scans, [lineId]: (state.scans[lineId] ?? []).filter((s) => s.tag !== tag) } }
}

export function clearLine(state: OrderState, lineId: string): OrderState {
  const scans = { ...state.scans }
  delete scans[lineId]
  return { ...state, scans }
}

/** Pull tags Apex already had in Note / Metrc Package ID into scans (source: recorded). */
export function importRecordedTags(state: OrderState, lineId?: string): { state: OrderState; added: number } {
  let s = state
  let added = 0
  for (const line of state.lines) {
    if (lineId && line.id !== lineId) continue
    for (const tag of line.recordedTags) {
      const r = addScan(s, line.id, tag, 'recorded')
      if (r.ok) {
        s = r.state
        added++
      }
    }
  }
  return { state: s, added }
}

export function buildPackageRows(state: OrderState): PackageRow[] {
  const rows: PackageRow[] = []
  for (const line of state.lines) {
    const scans = state.scans[line.id] ?? []
    const total = parseFloat(state.lineTotals[line.id] ?? '')
    const price = Number.isFinite(total) && scans.length > 0 ? Math.round((total / scans.length) * 100) / 100 : null
    for (const s of scans) {
      rows.push({
        lineId: line.id,
        originLicense: state.licenseByProductType[line.productType] ?? '',
        tag: s.tag,
        productName: line.productName,
        units: line.unitsPerPackage,
        grossWeightG: line.unitWeightG === null ? null : Math.round(line.unitWeightG * line.unitsPerPackage * 1000) / 1000,
        wholesalePrice: price,
      })
    }
  }
  return rows
}

export interface OrderSummary {
  expected: number
  scanned: number
  complete: number
  total: number
  issues: string[]
}

export function summarize(state: OrderState): OrderSummary {
  let expected = 0
  let scanned = 0
  let complete = 0
  const issues: string[] = []
  for (const l of state.lines) {
    const st = lineStatus(l, state.scans[l.id])
    expected += l.packagesExpected
    scanned += state.scans[l.id]?.length ?? 0
    if (st === 'complete') complete++
    if (st === 'partial' || st === 'empty') issues.push(`${l.productName}: ${state.scans[l.id]?.length ?? 0} of ${l.packagesExpected} scanned`)
    if (st === 'over') issues.push(`${l.productName}: ${state.scans[l.id]?.length} scanned, expected ${l.packagesExpected}`)
  }
  return { expected, scanned, complete, total: state.lines.length, issues }
}

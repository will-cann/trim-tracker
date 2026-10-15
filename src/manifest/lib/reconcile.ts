import type { T3PackageFacts } from '../../../shared/manifest/t3'
import { normalizeName } from './invoiceMatch'
import { shortTag } from './metrc'
import type { InvoiceLineRef, OrderState, PickLine } from '../types'

/**
 * Three-way reconciliation of each scanned case: what Metrc says is in the
 * package (via T3) against what Apex's pick list says was ordered, and what
 * the invoice says was billed. Pure functions; the Review screen renders them.
 */

export type Verdict = 'ok' | 'warn' | 'bad' | 'unknown'

export interface Check {
  verdict: Verdict
  text: string
}

export interface PackageFinding {
  tag: string
  lineId: string
  facts: T3PackageFacts | null
  eligibility: Check
  lot: Check
  quantity: Check
  product: Check
  lab: Check
  /** bad + warn messages, in display order */
  issues: string[]
  worst: Verdict
}

export interface LineFinding {
  line: PickLine
  packages: PackageFinding[]
  count: Check
  units: Check
  invoice: Check
  issues: string[]
  worst: Verdict
}

export interface Reconciliation {
  lines: LineFinding[]
  packagesScanned: number
  packagesChecked: number
  packagesClean: number
  bad: number
  warn: number
  /** Every scanned package was checked and nothing is bad or warn. */
  allClear: boolean
  /** Origin licence fixes suggested by Metrc: productType -> licence it actually found the packages on. */
  licenseFixes: Record<string, string>
}

const RANK: Record<Verdict, number> = { ok: 0, unknown: 1, warn: 2, bad: 3 }
const worstOf = (...vs: Verdict[]): Verdict => vs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok')

const GRAMS: Record<string, number> = { g: 1, gram: 1, grams: 1, mg: 0.001, kg: 1000, oz: 28.3495, lb: 453.592, lbs: 453.592 }
const COUNT_UNITS = new Set(['ea', 'each', 'unit', 'units', 'pc', 'pcs', 'count', ''])

function toGrams(qty: number, unit: string | null | undefined): number | null {
  const f = GRAMS[(unit ?? '').toLowerCase()]
  return f === undefined ? null : qty * f
}

const isCountUnit = (unit: string | null | undefined) => COUNT_UNITS.has((unit ?? '').toLowerCase())

/** "Pre-Roll - .5g" -> 0.5 ; "Eighths 3.5 g" -> 3.5 ; ignores mg potency figures. */
export function sizeGrams(name: string): number | null {
  const m = name.match(/(?:^|[\s\-(])(\d*\.?\d+)\s*(g|gram|grams)(?![a-z])/i)
  if (!m) return null
  const v = parseFloat(m[1])
  return Number.isFinite(v) && v > 0 ? v : null
}

function tokenSet(s: string): Set<string> {
  const out = new Set<string>()
  for (const t of normalizeName(s).split(' ')) {
    if (t.length < 2) continue
    // "pre-roll" vs "preroll", "0.5g" vs ".5g"
    out.add(t.replace(/^0+(?=\.)/, ''))
  }
  return out
}

/** Share of the Metrc item's tokens that also appear in the Apex name (Metrc names are usually the shorter side). */
export function nameOverlap(apexName: string, metrcName: string): number {
  const a = tokenSet(apexName.replace(/-/g, ' '))
  const b = tokenSet(metrcName.replace(/-/g, ' '))
  if (!a.size || !b.size) return 0
  const joinedA = Array.from(a).join('')
  let hits = 0
  for (const t of b) if (a.has(t) || (t.length >= 4 && joinedA.includes(t))) hits++
  return hits / b.size
}

// ── Per-package checks ────────────────────────────────────────────────────

function eligibilityCheck(f: T3PackageFacts, originLicense: string): Check {
  switch (f.state) {
    case 'eligible':
      return { verdict: 'ok', text: `Active on ${originLicense}` }
    case 'other_license':
      return { verdict: 'bad', text: `Lives on ${f.licenseNumber}, not ${originLicense}` }
    case 'active_not_eligible':
      return { verdict: 'bad', text: `Not transferable: ${f.reason ?? 'blocked in Metrc'}` }
    case 'not_found':
      return { verdict: 'bad', text: 'Not found in Metrc on any licence you can see' }
  }
}

function lotCheck(f: T3PackageFacts, line: PickLine): Check {
  if (!line.lotTag) return { verdict: 'unknown', text: 'Apex has no lot tag for this line' }
  const parents = f.sourcePackageLabels ?? []
  if (!parents.length) return { verdict: 'unknown', text: 'Metrc lists no parent package' }
  if (parents.includes(line.lotTag.toUpperCase())) return { verdict: 'ok', text: `From lot ${shortTag(line.lotTag, 8)}` }
  return { verdict: 'bad', text: `From lot ${parents.map((p) => shortTag(p, 8)).join(', ')}; Apex expects ${shortTag(line.lotTag, 8)}` }
}

function quantityCheck(f: T3PackageFacts, line: PickLine): Check {
  if (f.quantity === undefined || f.quantity === null) return { verdict: 'unknown', text: 'Metrc did not report a quantity' }
  const unit = f.unit ?? ''
  if (isCountUnit(unit)) {
    if (f.quantity === line.unitsPerPackage) return { verdict: 'ok', text: `${f.quantity} units, as picked` }
    return { verdict: 'bad', text: `Metrc has ${f.quantity} units; pick list case is ${line.unitsPerPackage}` }
  }
  const metrcG = toGrams(f.quantity, unit)
  const perUnitG = line.unitWeightG ?? (f.unitWeight != null ? toGrams(f.unitWeight, f.unitWeightUnit) : null)
  if (metrcG === null) return { verdict: 'unknown', text: `Metrc quantity is ${f.quantity} ${unit}; can't compare to units` }
  if (perUnitG === null) return { verdict: 'unknown', text: `Metrc has ${f.quantity} ${unit}; no unit weight on the product name to compare` }
  const expectedG = perUnitG * line.unitsPerPackage
  const off = Math.abs(metrcG - expectedG) / expectedG
  if (off <= 0.02) return { verdict: 'ok', text: `${f.quantity} ${unit} ≈ ${line.unitsPerPackage} × ${perUnitG} g` }
  return { verdict: 'bad', text: `Metrc has ${f.quantity} ${unit}; ${line.unitsPerPackage} × ${perUnitG} g should be ${Math.round(expectedG * 100) / 100} g` }
}

function productCheck(f: T3PackageFacts, line: PickLine): Check {
  if (!f.itemName) return { verdict: 'unknown', text: 'Metrc did not report an item name' }
  const apexSize = sizeGrams(line.productName)
  const metrcSize = sizeGrams(f.itemName) ?? (f.unitWeight != null ? toGrams(f.unitWeight, f.unitWeightUnit) : null)
  if (apexSize !== null && metrcSize !== null && Math.abs(apexSize - metrcSize) > 0.011) {
    return { verdict: 'bad', text: `Metrc item is ${f.itemName} (${metrcSize} g); Apex line is ${apexSize} g` }
  }
  const overlap = nameOverlap(line.productName, f.itemName)
  const strainHit = f.strainName ? normalizeName(line.productName).includes(normalizeName(f.strainName)) : false
  if (overlap >= 0.6 || (strainHit && overlap >= 0.3)) return { verdict: 'ok', text: f.itemName }
  if (overlap >= 0.35 || strainHit) return { verdict: 'warn', text: `Metrc item "${f.itemName}" only loosely matches "${line.productName}"` }
  return { verdict: 'bad', text: `Metrc item is "${f.itemName}", not "${line.productName}"` }
}

function labCheck(f: T3PackageFacts): Check {
  const s = f.labTestingState ?? ''
  if (!s) return { verdict: 'unknown', text: 'No lab testing state reported' }
  if (/^(TestPassed|RetestPassed|NotRequired|ProcessValidated)$/i.test(s)) return { verdict: 'ok', text: s }
  if (/fail/i.test(s)) return { verdict: 'bad', text: `Lab testing: ${s}` }
  return { verdict: 'warn', text: `Lab testing: ${s}` }
}

const UNCHECKED: Check = { verdict: 'unknown', text: 'Not checked yet' }

export function reconcilePackage(tag: string, line: PickLine, originLicense: string, facts: T3PackageFacts | null): PackageFinding {
  if (!facts) {
    return { tag, lineId: line.id, facts: null, eligibility: UNCHECKED, lot: UNCHECKED, quantity: UNCHECKED, product: UNCHECKED, lab: UNCHECKED, issues: [], worst: 'unknown' }
  }
  const eligibility = eligibilityCheck(facts, originLicense)
  // A tag Metrc can't find has nothing to compare; don't pile on.
  const found = facts.state !== 'not_found'
  const lot = found ? lotCheck(facts, line) : UNCHECKED
  const quantity = found ? quantityCheck(facts, line) : UNCHECKED
  const product = found ? productCheck(facts, line) : UNCHECKED
  const lab = found ? labCheck(facts) : UNCHECKED
  const checks = [eligibility, product, lot, quantity, lab]
  const issues = checks.filter((c) => c.verdict === 'bad' || c.verdict === 'warn').map((c) => c.text)
  return { tag, lineId: line.id, facts, eligibility, lot, quantity, product, lab, issues, worst: worstOf(...checks.map((c) => c.verdict)) }
}

// ── Per-line checks ───────────────────────────────────────────────────────

function countCheck(line: PickLine, scanned: number): Check {
  if (scanned === line.packagesExpected) return { verdict: 'ok', text: `${scanned} of ${line.packagesExpected} cases scanned` }
  if (scanned < line.packagesExpected) return { verdict: 'warn', text: `${scanned} of ${line.packagesExpected} cases scanned` }
  return { verdict: 'bad', text: `${scanned} cases scanned; pick list expects ${line.packagesExpected}` }
}

/** Sum of Metrc unit counts across checked, count-based packages; null if any is unknown. */
function metrcUnits(packages: PackageFinding[]): number | null {
  let sum = 0
  for (const p of packages) {
    const f = p.facts
    if (!f || f.state === 'not_found' || f.quantity == null || !isCountUnit(f.unit)) return null
    sum += f.quantity
  }
  return packages.length ? sum : null
}

function unitsCheck(line: PickLine, packages: PackageFinding[], scannedAll: boolean): Check {
  const sum = metrcUnits(packages)
  if (sum === null) return { verdict: 'unknown', text: packages.some((p) => p.facts) ? 'Metrc units not comparable for every case' : 'Not checked yet' }
  if (!scannedAll) return { verdict: 'unknown', text: `${sum} units in Metrc so far; pick list total is ${line.totalUnits}` }
  if (sum === line.totalUnits) return { verdict: 'ok', text: `${sum} units in Metrc = ${line.totalUnits} on the pick list` }
  return { verdict: 'bad', text: `${sum} units in Metrc; pick list total is ${line.totalUnits}` }
}

function invoiceCheck(line: PickLine, inv: InvoiceLineRef | undefined, metrcSum: number | null): Check {
  if (!inv) return { verdict: 'unknown', text: 'No invoice line matched' }
  if (inv.quantity === null) return { verdict: 'unknown', text: `Invoiced $${inv.total.toFixed(2)}; invoice shows no unit count` }
  const vsPick = inv.quantity === line.totalUnits
  const vsMetrc = metrcSum === null ? null : inv.quantity === metrcSum
  if (vsPick && vsMetrc !== false) return { verdict: 'ok', text: `Invoiced ${inv.quantity} units, $${inv.total.toFixed(2)}` }
  if (!vsPick) return { verdict: 'bad', text: `Invoice bills ${inv.quantity} units; pick list has ${line.totalUnits}` }
  return { verdict: 'bad', text: `Invoice bills ${inv.quantity} units; Metrc cases hold ${metrcSum}` }
}

export function reconcileOrder(order: OrderState): Reconciliation {
  const byTag = order.metrc?.byTag ?? {}
  const lines: LineFinding[] = []
  const licenseFixes: Record<string, string> = {}
  let packagesScanned = 0
  let packagesChecked = 0
  let packagesClean = 0
  let bad = 0
  let warn = 0

  for (const line of order.lines) {
    const scans = order.scans[line.id] ?? []
    const originLicense = order.licenseByProductType[line.productType] ?? ''
    const packages = scans.map((s) => reconcilePackage(s.tag, line, originLicense, byTag[s.tag] ?? null))
    for (const p of packages) {
      packagesScanned++
      if (p.facts) packagesChecked++
      if (p.facts && p.worst !== 'bad' && p.worst !== 'warn') packagesClean++
      if (p.worst === 'bad') bad++
      else if (p.worst === 'warn') warn++
      if (p.facts?.state === 'other_license' && p.facts.licenseNumber) licenseFixes[line.productType] = p.facts.licenseNumber
    }
    const count = countCheck(line, scans.length)
    const units = unitsCheck(line, packages, scans.length === line.packagesExpected)
    const invoice = invoiceCheck(line, order.invoiceLines?.[line.id], metrcUnits(packages))
    const lineChecks = [count, units, invoice]
    const issues = lineChecks.filter((c) => c.verdict === 'bad' || c.verdict === 'warn').map((c) => c.text)
    if (units.verdict === 'bad' || invoice.verdict === 'bad') bad++
    const worst = worstOf(...lineChecks.map((c) => c.verdict), ...packages.map((p) => p.worst))
    lines.push({ line, packages, count, units, invoice, issues, worst })
  }

  return {
    lines,
    packagesScanned,
    packagesChecked,
    packagesClean,
    bad,
    warn,
    allClear: packagesScanned > 0 && packagesChecked === packagesScanned && bad === 0 && warn === 0,
    licenseFixes,
  }
}

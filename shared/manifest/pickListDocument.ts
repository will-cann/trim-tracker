/**
 * Wire contract for netlify/functions/parse-pick-list.ts: what Claude reads
 * off the Apex invoice PDF (what Apex hands the lead; it doubles as the pick
 * list) or a photo of it, so the manifest picker can load it like a CSV. The
 * PDF carries potency and price, which the CSV export does not, so this is
 * the preferred input.
 */

export interface PickListDocLine {
  /** Product as printed, e.g. "Proper - Pre-Roll - 1g - Legend OG". */
  productName: string
  brand: string | null
  category: string | null
  productType: string | null
  sku: string | null
  /** Parent lot / source batch Metrc tag (24 chars starting 1A4), if printed. */
  lotTag: string | null
  /** Lot / batch text as printed when no full tag is present (e.g. "…108430"). */
  lotLabel: string | null
  /**
   * Case tags printed on the line, as text: full 24-char tags, full-tag
   * ranges, or the short suffix ranges Apex prints after the lot such as
   * "(#143967-143980)" or "(#291767-291905, 307867-307910)".
   */
  metrcTags: string[]
  /** Number of cases to pick; null when not printed. */
  packages: number | null
  /** Sellable units in total; null when not printed. */
  totalUnits: number | null
  /** Units per case when printed or derivable. */
  unitsPerPackage: number | null
  /** e.g. "THC 24.1%" as printed. */
  potency: string | null
  /** Per sellable unit, when printed. Apex prints per case instead; see casePrice. */
  unitPrice: number | null
  /** Per case, as Apex's Price column prints it (after any strike-through list price). */
  casePrice: number | null
  /** Final amount for the line after customer discounts. */
  lineTotal: number | null
}

export interface PickListDocument {
  orderNumber: string | null
  buyer: string | null
  buyerLicense: string | null
  buyerAddress: string | null
  lines: PickListDocLine[]
  /** Anything the reader wants the picker to know (unreadable rows, assumptions). */
  notes: string | null
}

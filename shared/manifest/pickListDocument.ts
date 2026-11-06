/**
 * Wire contract for netlify/functions/parse-pick-list.ts: what Claude reads
 * off an Apex pick-list / order PDF (or a photo of one) so the manifest picker
 * can load it like a CSV. The PDF carries potency and price, which the CSV
 * export does not, so this is the preferred input.
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
  /** Case tags printed on the line (full 24-char tags or ranges, as text). */
  metrcTags: string[]
  /** Number of cases to pick; null when not printed. */
  packages: number | null
  /** Sellable units in total; null when not printed. */
  totalUnits: number | null
  /** Units per case when printed or derivable. */
  unitsPerPackage: number | null
  /** e.g. "THC 24.1%" as printed. */
  potency: string | null
  unitPrice: number | null
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

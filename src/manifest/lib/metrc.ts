/** Metrc package/plant tags are 24 alphanumeric characters starting with "1A". */
const TAG_RE = /^1A[0-9A-Z]{22}$/

export function normalizeTag(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function isMetrcTag(raw: string): boolean {
  return TAG_RE.test(normalizeTag(raw))
}

export function extractTags(text: string): string[] {
  const found = text.toUpperCase().match(/1A[0-9A-Z]{22}/g) ?? []
  return Array.from(new Set(found))
}

/** "…B55000135918" -> "…135918" for dense mobile display. */
export function shortTag(tag: string, keep = 6): string {
  return tag.length > keep ? `…${tag.slice(-keep)}` : tag
}

/**
 * Per-unit weight in grams from an Apex product name, e.g.
 * "Proper - Pre-Roll - .5g - Legend OG" -> 0.5, "Eighths - 3.5g" -> 3.5.
 * Ignores milligram potency figures like "100mg".
 */
export function parseUnitWeightG(productName: string): number | null {
  const m = productName.match(/(?:^|[\s-])(\d*\.?\d+)\s*g(?![a-z])/i)
  if (!m) return null
  const v = parseFloat(m[1])
  return Number.isFinite(v) && v > 0 ? v : null
}

/**
 * Best-effort origin licence guess by product type. Proper ships whole-flower
 * products from the cultivation licence and infused/manufactured products from
 * the manufacturing licence. Editable in the review screen.
 */
export function guessLicenseKind(productType: string, category: string): 'cultivation' | 'manufacturing' {
  const t = `${productType} ${category}`.toLowerCase()
  if (/infused|edible|vape|cart|concentrate|rosin|hash|tincture|topical|beverage/.test(t)) return 'manufacturing'
  return 'cultivation'
}

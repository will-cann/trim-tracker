/**
 * Metrc package/plant tags are 24 alphanumeric characters starting with
 * "1A4" (every US Metrc state: MO 1A40C…, CO 1A401…, OK 1A40A…, CA 1A4FF…).
 * Requiring the "4" catches keyboard-wedge garbles like "1AC03…19540",
 * where characters 3–4 of a real tag landed at the end.
 */
export const TAG_PREFIX = '1A4'
const TAG_RE = /^1A4[0-9A-Z]{21}$/
export const TAG_HINT = `Tags are 24 characters starting with ${TAG_PREFIX}.`

export function normalizeTag(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function isMetrcTag(raw: string): boolean {
  return TAG_RE.test(normalizeTag(raw))
}

export function extractTags(text: string): string[] {
  const found = text.toUpperCase().match(/1A4[0-9A-Z]{21}/g) ?? []
  return Array.from(new Set(found))
}

/**
 * How many trailing characters a picker actually reads. Proper's vault picks
 * off the last digits of the lot number and settled on seven (Chris Wade,
 * Nov 2026): six always disambiguates today, seven leaves room to grow.
 */
export const TAG_SUFFIX_LEN = 7

/** "…B55000135918" -> "…0135918" for dense mobile display. */
export function shortTag(tag: string, keep = TAG_SUFFIX_LEN): string {
  return tag.length > keep ? `…${tag.slice(-keep)}` : tag
}

export interface TagParts {
  /** Everything before the suffix: the part nobody reads. */
  head: string
  /** Leading zeros inside the suffix, shown muted so the eye lands on the digits. */
  zeros: string
  /** The significant trailing digits the picker looks for (never empty). */
  digits: string
}

/** "1A40C030000038B000008955" -> { head: "1A40C030000038B00", zeros: "000", digits: "8955" }. */
export function splitTag(tag: string, keep = TAG_SUFFIX_LEN): TagParts {
  const t = tag.trim()
  const cut = Math.max(0, t.length - keep)
  const head = t.slice(0, cut)
  const suffix = t.slice(cut)
  const m = suffix.match(/^(0*)(.*)$/) as RegExpMatchArray
  const zeros = m[2] ? m[1] : m[1].slice(0, -1)
  const digits = m[2] || m[1].slice(-1)
  return { head, zeros, digits }
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

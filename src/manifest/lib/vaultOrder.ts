import { parseUnitWeightG } from './metrc'
import type { PickLine } from '../types'

/**
 * Proper's vault walk order (Jacob Modrusic, Oct 2026). A freshly loaded pick
 * list is sorted into this order so the picker walks the vault once, front to
 * back. Lines that match no stop keep their Apex order at the end.
 *
 * Each stop is matched against the line's brand, category, product type and
 * product name. Stops are checked in walk order and the first match wins, so a
 * stop must not swallow lines meant for a later, more specific one (e.g.
 * infused pre-rolls come before the plain pre-roll stops).
 */

interface LineFacts {
  brand: string
  /** brand + category + product type + product name, lowercased */
  text: string
  weightG: number | null
  isPreroll: boolean
  isInfused: boolean
  isVape: boolean
  isFlower: boolean
}

interface VaultStop {
  label: string
  match: (f: LineFacts) => boolean
}

const near = (w: number | null, g: number) => w !== null && Math.abs(w - g) < 0.01
const isBrand = (f: LineFacts, re: RegExp) => re.test(f.brand)
const isDailyDriver = (f: LineFacts) => isBrand(f, /daily driver/)
const isHoneybee = (f: LineFacts) => isBrand(f, /honey ?bee/)
const isGoodnight = (f: LineFacts) => isBrand(f, /good ?night/)
const isRatio = (f: LineFacts) => isBrand(f, /\bratio\b/)
/** Proper's own flower and pre-rolls (not Daily Driver, which has its own stops). */
const isProper = (f: LineFacts) => !isDailyDriver(f) && isBrand(f, /proper/)
const properFlower = (f: LineFacts, g: number) => isProper(f) && f.isFlower && !/reserve/.test(f.text) && near(f.weightG, g)
const ddFlower = (f: LineFacts, g: number) => isDailyDriver(f) && f.isFlower && near(f.weightG, g)
const plainPreroll = (f: LineFacts) => isProper(f) && f.isPreroll && !f.isInfused
const is5pk = (f: LineFacts) => /\b5\s*-?\s*(pk|pack|ct)\b/.test(f.text) || near(f.weightG, 2.5)

export const VAULT_ORDER: readonly VaultStop[] = [
  { label: 'Goodnight - Gumdrops', match: (f) => isGoodnight(f) && /gumdrop/.test(f.text) },
  { label: 'Honeybee - Chocolates', match: (f) => isHoneybee(f) && /chocolate/.test(f.text) },
  { label: 'Ratio - Mints', match: (f) => isRatio(f) && /\bmints?\b/.test(f.text) },
  { label: 'Infused Pre-rolls', match: (f) => f.isPreroll && f.isInfused },
  { label: 'Sauced/Sauce+ Vapes', match: (f) => f.isVape && /\bsauce/.test(f.text) },
  { label: 'Liquid Diamonds Carts', match: (f) => /liquid diamond/.test(f.text) },
  { label: 'Ratio Vape', match: (f) => isRatio(f) && f.isVape },
  { label: 'Rosin All in One Vapes', match: (f) => f.isVape && /rosin/.test(f.text) },
  { label: 'Goodnight - Vapes', match: (f) => isGoodnight(f) && f.isVape },
  { label: 'Honeybee - Queen Bee', match: (f) => /queen ?bee/.test(f.text) },
  { label: 'Honeybee - Gumdrops', match: (f) => isHoneybee(f) && /gumdrop/.test(f.text) },
  { label: 'Proper Reserve - Eighths - 3.5g', match: (f) => isProper(f) && f.isFlower && /reserve/.test(f.text) && near(f.weightG, 3.5) },
  { label: 'Proper - Eighths - 3.5g', match: (f) => properFlower(f, 3.5) },
  { label: 'Proper - Small Bud Quarters - 7g', match: (f) => properFlower(f, 7) },
  { label: 'Proper - Half Ounce - 14g', match: (f) => properFlower(f, 14) },
  { label: 'Proper - Ounce - 28g', match: (f) => properFlower(f, 28) },
  { label: 'Daily Driver - Eighths - 3.5g', match: (f) => ddFlower(f, 3.5) },
  { label: 'Daily Driver - Quarters - 7g', match: (f) => ddFlower(f, 7) },
  { label: 'Daily Driver - Half Ounce - 14g', match: (f) => ddFlower(f, 14) },
  { label: 'Daily Driver - Ounce - 28g', match: (f) => ddFlower(f, 28) },
  { label: 'Proper - Pre-rolls - 5pk', match: (f) => plainPreroll(f) && is5pk(f) },
  { label: 'Proper - Pre-rolls - .5g', match: (f) => plainPreroll(f) && near(f.weightG, 0.5) },
  { label: 'Proper - Pre-rolls - 1g', match: (f) => plainPreroll(f) && near(f.weightG, 1) },
]

function facts(line: PickLine): LineFacts {
  // Brand column first; fall back to the "Brand - ..." prefix of the product name.
  const brand = `${line.brand} ${line.productName.split(' - ')[0]}`.toLowerCase()
  const text = `${line.brand} ${line.category} ${line.productType} ${line.productName}`.toLowerCase()
  const isPreroll = /pre-?\s?rolls?\b|preroll/.test(text)
  const isVape = /\bvapes?\b|\bcarts?\b|cartridge|all[\s-]in[\s-]one|\baio\b|disposable/.test(text)
  return {
    brand,
    text,
    weightG: parseUnitWeightG(line.productName),
    isPreroll,
    isInfused: /infused/.test(text),
    isVape,
    isFlower: !isPreroll && !isVape && /flower|\bbud\b|eighth|quarter|half ounce|\bounce\b/.test(text),
  }
}

/** Index into VAULT_ORDER, or null when the line matches no stop. */
export function vaultStop(line: PickLine): number | null {
  const f = facts(line)
  const i = VAULT_ORDER.findIndex((s) => s.match(f))
  return i < 0 ? null : i
}

/** Lines in vault walk order; ties and unmatched lines keep their Apex order. */
export function sortByVaultOrder(lines: PickLine[]): PickLine[] {
  const rank = (l: PickLine) => vaultStop(l) ?? VAULT_ORDER.length
  return lines
    .map((line, i) => ({ line, i, r: rank(line) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.line)
}

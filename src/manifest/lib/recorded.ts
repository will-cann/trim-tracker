/**
 * What Apex recorded about the cases a line was packed into, and whether a
 * scanned tag is among them.
 *
 * Two shapes show up in Proper's exports:
 *  - full case tags (or full-tag ranges) in the Metrc Package ID / Note
 *    columns → `PickLine.recordedTags` (see pickList.ts `extractRecordedTags`);
 *  - short suffix ranges typed after the lot in the Batch ID,
 *    "#1A40C0300000B55000128505 (#143967-143980)" or several
 *    "(#291767-291905, 307867-307910)" → `PickLine.recordedRanges`.
 *
 * The suffix ranges are the whole run of case tags the lot was packed into
 * (50–250 tags for a one-case line), so they are a pool to check a scan
 * against, never something to import as scans. The case tags do not always
 * share the lot tag's prefix (an infused pre-roll's lot sits on the other
 * licence), so the ranges are matched on trailing digits only.
 */
import type { PickLine, TagSuffixRange } from '../types'

// A run of digits not glued to a tag (no alphanumeric before it), a dash, then
// the end: full digits or a shorthand that replaces the start's last digits.
const SUFFIX_RANGE_RE = /(?<![0-9A-Z])#?(\d{4,11})\s*(?:-|–|—|to|through|thru)\s*#?(\d{1,11})(?![0-9A-Z])/gi
const MAX_POOL = 5000

export function parseSuffixRanges(text: string): TagSuffixRange[] {
  const out: TagSuffixRange[] = []
  for (const m of text.toUpperCase().matchAll(SUFFIX_RANGE_RE)) {
    const from = m[1]
    const end = m[2]
    if (end.length > from.length) continue
    const to = end.length === from.length ? end : from.slice(0, from.length - end.length) + end
    const a = Number(from)
    const b = Number(to)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a >= MAX_POOL) continue
    if (!out.some((r) => r.from === from && r.to === to)) out.push({ from, to })
  }
  return out
}

export function tagInSuffixRanges(tag: string, ranges: TagSuffixRange[] | undefined): boolean {
  if (!ranges?.length) return false
  return ranges.some((r) => {
    const suffix = tag.slice(-r.from.length)
    if (!/^\d+$/.test(suffix)) return false
    const n = Number(suffix)
    return n >= Number(r.from) && n <= Number(r.to)
  })
}

/** Apex said something about which cases this line comes in. */
export function hasRecorded(line: PickLine): boolean {
  return line.recordedTags.length > 0 || (line.recordedRanges?.length ?? 0) > 0
}

/** The tag is one Apex recorded for the line, by full tag or by suffix range. */
export function lineRecordsTag(line: PickLine, tag: string): boolean {
  return line.recordedTags.includes(tag) || tagInSuffixRanges(tag, line.recordedRanges)
}

/** "…143967 to …143980, …307867 to …307910" */
export function describeRanges(ranges: TagSuffixRange[]): string {
  return ranges.map((r) => `…${r.from} to …${r.to}`).join(', ')
}

/** "…143967 to …143980" / "the 12 tags" for warnings and hints. */
export function describeRecorded(line: PickLine): string {
  const parts: string[] = []
  if (line.recordedTags.length) parts.push(`the ${line.recordedTags.length} tag${line.recordedTags.length === 1 ? '' : 's'}`)
  if (line.recordedRanges?.length) parts.push(describeRanges(line.recordedRanges))
  return parts.join(', ')
}

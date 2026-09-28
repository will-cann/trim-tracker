/**
 * Tolerant CSV tokenizer for Apex Trading exports.
 *
 * Apex's pick list export is not RFC 4180: product names contain unescaped
 * inner quotes (`"Proper - "Ecto Exclusive" - Mix #122"`), the Note column is
 * multi-line, and every record has a trailing space after the closing quote.
 *
 * Rule used here: inside a quoted field, a `"` only closes the field when it is
 * followed by optional spaces and then a comma, a line break, or end of input.
 * Every other `"` is literal. RFC-style `""` escapes are also honoured when the
 * pair is followed by a delimiter-compatible character.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let i = 0
  const n = text.length

  const isDelimAhead = (from: number): boolean => {
    let j = from
    while (j < n && text[j] === ' ') j++
    return j >= n || text[j] === ',' || text[j] === '\n' || text[j] === '\r'
  }

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }

  while (i < n) {
    const c = text[i]
    if (c === '"') {
      i++
      while (i < n) {
        const ch = text[i]
        if (ch === '"') {
          // RFC "" escape, unless the pair sits right before a delimiter
          // (Apex style: literal inner quote followed by the closing quote).
          if (text[i + 1] === '"' && !isDelimAhead(i + 2)) {
            field += '"'
            i += 2
            continue
          }
          if (isDelimAhead(i + 1)) {
            i++
            while (i < n && text[i] === ' ') i++
            break
          }
          field += ch
          i++
          continue
        }
        field += ch
        i++
      }
      continue
    }
    if (c === ',') {
      endField()
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      endRow()
      i++
      continue
    }
    field += c
    i++
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}

/** Serialise one CSV row with RFC 4180 quoting. */
export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells
    .map((v) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(',')
}

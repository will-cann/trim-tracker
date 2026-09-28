import { describe, it, expect } from 'vitest'
import { parsePickList, parseQuantity, invoiceNumberFromOrder } from '../lib/pickList'
import { parseCsv } from '../lib/csv'
import { isMetrcTag, parseUnitWeightG, guessLicenseKind } from '../lib/metrc'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'

describe('parseCsv (Apex quirks)', () => {
  it('keeps unescaped inner quotes inside a quoted field', () => {
    const rows = parseCsv('"a","x - "Inner" - y","c"\n')
    expect(rows).toEqual([['a', 'x - "Inner" - y', 'c']])
  })

  it('handles multi-line cells and trailing space after the closing quote', () => {
    const rows = parseCsv('"a","line1\nline2" \n"b","c" \n')
    expect(rows).toEqual([
      ['a', 'line1\nline2'],
      ['b', 'c'],
    ])
  })

  it('handles empty unquoted fields', () => {
    expect(parseCsv('"a",,"c",,\n')).toEqual([['a', '', 'c', '', '']])
  })

  it('honours RFC "" escapes', () => {
    expect(parseCsv('"say ""hi"" now","b"\n')).toEqual([['say "hi" now', 'b']])
  })
})

describe('parseQuantity', () => {
  it('reads cases with unit totals', () => {
    expect(parseQuantity(' 2 Cases (100 Units)')).toEqual({ packages: 2, total: 100 })
    expect(parseQuantity(' 1 Case (20 Units)')).toEqual({ packages: 1, total: 20 })
  })
  it('treats loose units as a single package', () => {
    expect(parseQuantity(' 4 Units')).toEqual({ packages: 1, total: 4 })
  })
  it('rejects garbage', () => {
    expect(parseQuantity('lots')).toBeNull()
  })
})

describe('metrc helpers', () => {
  it('validates 24-char tags', () => {
    expect(isMetrcTag('1A40C0300000B56000294261')).toBe(true)
    expect(isMetrcTag(' 1a40c0300000b56000294261 ')).toBe(true)
    expect(isMetrcTag('1A40C0300000B5600029426')).toBe(false)
    expect(isMetrcTag('ABCDEF')).toBe(false)
  })
  it('parses unit weight from product names', () => {
    expect(parseUnitWeightG('Proper - Pre-Roll - .5g - Legend of Luke')).toBe(0.5)
    expect(parseUnitWeightG('Daily Driver - Eighths - 3.5g - Dolato')).toBe(3.5)
    expect(parseUnitWeightG('Daily Driver - Infused Pre-Roll - 1g - Mix #32')).toBe(1)
    expect(parseUnitWeightG('Grön - Rosin Mega - 100mg - Peach Mango')).toBeNull()
  })
  it('guesses licence kind from product type', () => {
    expect(guessLicenseKind('Infused Pre-roll', 'Preroll')).toBe('manufacturing')
    expect(guessLicenseKind('Whole Flower', 'Preroll')).toBe('cultivation')
    expect(guessLicenseKind('Gummies', 'Edible')).toBe('manufacturing')
  })
})

describe('parsePickList on the real Proper-4934 export', () => {
  const { lines, warnings } = parsePickList(SAMPLE_PICKLIST_CSV)

  it('parses all 10 lines without warnings', () => {
    expect(warnings).toEqual([])
    expect(lines).toHaveLength(10)
  })

  it('reconciles to 16 packages and 528 units, matching the invoice', () => {
    expect(lines.reduce((s, l) => s + l.packagesExpected, 0)).toBe(16)
    expect(lines.reduce((s, l) => s + l.totalUnits, 0)).toBe(528)
  })

  it('extracts the lot tag from Batch ID and case tags from Note', () => {
    const ecto = lines[1]
    expect(ecto.productName).toBe('Proper - Live Resin Infused Pre-Roll - 1g - "Ecto Exclusive" - Mix #122')
    expect(ecto.lotTag).toBe('1A40C030000038B000009093')
    expect(ecto.recordedTags).toEqual(['1A40C0300000B56000294262'])

    const fullThrottle = lines[2]
    expect(fullThrottle.packagesExpected).toBe(2)
    expect(fullThrottle.unitsPerPackage).toBe(20)
    expect(fullThrottle.recordedTags).toEqual(['1A40C0300000B56000296314', '1A40C0300000B56000296315'])
  })

  it('carries destination and unit weight', () => {
    expect(lines[0].buyerLicense).toBe('DIS000104')
    expect(lines[0].buyer).toBe('Terrabis - Springfield')
    expect(lines[4].unitWeightG).toBe(0.5)
    expect(lines[3].unitWeightG).toBe(1)
  })

  it('recorded tags are unique across the whole order', () => {
    const all = lines.flatMap((l) => l.recordedTags)
    expect(new Set(all).size).toBe(16)
  })

  it('derives the Metrc invoice number', () => {
    expect(invoiceNumberFromOrder('Proper-4934')).toBe('4934')
  })
})

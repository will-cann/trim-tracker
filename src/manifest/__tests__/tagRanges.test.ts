import { describe, it, expect } from 'vitest'
import { expandTagRanges, extractRecordedTags, parsePickList } from '../lib/pickList'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'

const A = '1A40C0300000B56000146121'
const B = '1A40C0300000B56000146131'

describe('expandTagRanges', () => {
  it('expands a full-tag range inclusively', () => {
    const tags = expandTagRanges(`${A}-${B}`)
    expect(tags).toHaveLength(11)
    expect(tags[0]).toBe(A)
    expect(tags[10]).toBe(B)
    expect(tags[5]).toBe('1A40C0300000B56000146126')
  })

  it('accepts "to", en dashes and spaces', () => {
    expect(expandTagRanges(`${A} to ${B}`)).toHaveLength(11)
    expect(expandTagRanges(`${A} – ${B}`)).toHaveLength(11)
    expect(expandTagRanges(`${A}..${B}`)).toHaveLength(11)
  })

  it('expands the shorthand where the end replaces the last digits', () => {
    expect(expandTagRanges(`${A}-131`)).toHaveLength(11)
    expect(expandTagRanges(`${A}-31`)).toHaveLength(11)
    expect(expandTagRanges(`${A}-6124`)).toEqual([A, '1A40C0300000B56000146122', '1A40C0300000B56000146123', '1A40C0300000B56000146124'])
  })

  it('ignores ranges that run backwards, cross prefixes or are absurdly long', () => {
    expect(expandTagRanges(`${B}-${A}`)).toEqual([])
    expect(expandTagRanges(`${A}-1A40C0300000B55000146131`)).toEqual([])
    expect(expandTagRanges(`${A}-1A40C0300000B56999999999`)).toEqual([])
  })
})

describe('extractRecordedTags', () => {
  it('combines single tags and ranges without duplicates', () => {
    const tags = extractRecordedTags(`${A}\n${A}-${B}\n1A40C0300000B56000294261`)
    expect(tags).toHaveLength(12)
    expect(new Set(tags).size).toBe(12)
  })

  it('still reads the sample export the way it did (one tag per line in Note)', () => {
    const { lines } = parsePickList(SAMPLE_PICKLIST_CSV)
    expect(lines.reduce((n, l) => n + l.recordedTags.length, 0)).toBe(16)
  })

  it('reads a range typed into the Metrc Package ID column', () => {
    const csv = `"Order Number","Product Name","Batch ID","Metrc Package ID","Quantity"\n"Proper-1","Proper - Pre-Roll - 1g - Legend OG","Legend OG #1A40C030000038B000009173","${A}-${B}"," 11 Cases (550 Units)"`
    const { lines } = parsePickList(csv)
    expect(lines[0].recordedTags).toHaveLength(11)
    expect(lines[0].packagesExpected).toBe(11)
  })
})

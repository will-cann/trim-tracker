// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { WedgeInput } from '../components/desktop/WedgeInput'
import { isMetrcTag, extractTags } from '../lib/metrc'

const GOOD = '1A40C0300000B56000303195'
// Jacob's field report: characters 3–4 of the real tag landed at the end.
const GARBLED = '1AC0300000B5600030319540'

afterEach(cleanup)

/** Simulate a keyboard-wedge scanner: one `input` event per character, then Enter. */
function scan(el: HTMLInputElement, text: string, enter = true) {
  for (let i = 1; i <= text.length; i++) {
    el.value = text.slice(0, i)
    fireEvent.input(el)
  }
  if (enter) fireEvent.keyDown(el, { key: 'Enter' })
}

describe('tag validation (field report)', () => {
  it('accepts the real tag and rejects the reordered one', () => {
    expect(isMetrcTag(GOOD)).toBe(true)
    expect(isMetrcTag(GARBLED)).toBe(false)
    expect(extractTags(`note ${GARBLED} ${GOOD}`)).toEqual([GOOD])
  })
})

describe('WedgeInput', () => {
  it('submits once when the full tag arrives, before Enter, and clears itself', () => {
    const onScan = vi.fn()
    const { getByLabelText } = render(<WedgeInput onScan={onScan} capture={false} />)
    const el = getByLabelText('Barcode scanner input') as HTMLInputElement
    scan(el, GOOD)
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith(GOOD)
    expect(el.value).toBe('')
  })

  it('hands a garbled burst to onScan on Enter so the caller can show the error', () => {
    const onScan = vi.fn()
    const { getByLabelText } = render(<WedgeInput onScan={onScan} capture={false} />)
    const el = getByLabelText('Barcode scanner input') as HTMLInputElement
    scan(el, GARBLED)
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith(GARBLED)
    expect(el.value).toBe('')
  })

  it('handles two back-to-back scans independently', () => {
    const onScan = vi.fn()
    const { getByLabelText } = render(<WedgeInput onScan={onScan} capture={false} />)
    const el = getByLabelText('Barcode scanner input') as HTMLInputElement
    scan(el, GOOD)
    scan(el, '1A40C0300000B56000303196')
    expect(onScan.mock.calls.map((c) => c[0])).toEqual([GOOD, '1A40C0300000B56000303196'])
  })

  it('keeps the keyboard out of the way (no autocapitalize/autocorrect)', () => {
    const { getByLabelText } = render(<WedgeInput onScan={() => {}} capture={false} />)
    const el = getByLabelText('Barcode scanner input') as HTMLInputElement
    expect(el.getAttribute('autocapitalize')).toBe('none')
    expect(el.getAttribute('autocorrect')).toBe('off')
    expect(el.getAttribute('autocomplete')).toBe('off')
  })
})

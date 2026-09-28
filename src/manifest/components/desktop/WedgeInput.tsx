import { useEffect, useRef, useState } from 'react'
import { ScanBarcode } from 'lucide-react'
import { extractTags, isMetrcTag } from '../../lib/metrc'
import { isEditableTarget, WEDGE_SUFFIX_KEYS } from '../../lib/wedge'

interface Props {
  onScan: (raw: string) => void
  /** When true, keystrokes anywhere outside another field are pulled into this input. */
  capture?: boolean
}

/**
 * Always-ready input for a USB barcode scanner in keyboard-wedge mode.
 * The scanner "types" the tag and sends Enter; we submit on Enter/Tab or as
 * soon as a full 24-char Metrc tag is present. Keystrokes that land on the
 * page body (after the user clicked a row or button) are redirected here so
 * the picker never has to click back into the box.
 */
export function WedgeInput({ onScan, capture = true }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    if (!capture) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      if (e.key.length === 1 || WEDGE_SUFFIX_KEYS.has(e.key)) ref.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [capture])

  const submit = (raw: string) => {
    const tags = extractTags(raw)
    if (tags.length) tags.forEach(onScan)
    else if (raw.trim()) onScan(raw.trim())
    setValue('')
  }

  return (
    <div>
      <div className="relative">
        <ScanBarcode className={`absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 ${focused ? 'text-emerald-500' : 'text-gray-400'}`} />
        <input
          ref={ref}
          value={value}
          onChange={(e) => {
            const v = e.target.value
            setValue(v)
            const t = v.trim().toUpperCase()
            if (t.length >= 24 && isMetrcTag(t)) submit(t)
          }}
          onKeyDown={(e) => {
            if (WEDGE_SUFFIX_KEYS.has(e.key)) {
              e.preventDefault()
              submit(value)
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Scan a case tag"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Barcode scanner input"
          className={`w-full rounded-2xl border-2 bg-white pl-14 pr-4 h-16 font-mono text-xl tracking-wider uppercase text-gray-900 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none ${
            focused ? 'border-emerald-400 ring-4 ring-emerald-100' : 'border-gray-200'
          }`}
        />
      </div>
      <p className={`mt-2 text-sm flex items-center gap-2 ${focused ? 'text-emerald-700' : 'text-amber-700'}`}>
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${focused ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
        {focused ? 'Ready — pull the trigger.' : 'Scanning will resume automatically, or click the box.'}
      </p>
    </div>
  )
}

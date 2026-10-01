import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Keyboard, Trash2, Check, Download } from 'lucide-react'
import { Button, Card, Input, Notice, Pill, Screen, TopBar } from './ui'
import { Scanner } from './Scanner'
import { lineStatus } from '../lib/order'
import { extractTags, isMetrcTag, shortTag, TAG_HINT } from '../lib/metrc'
import type { OrderState, PickLine, ScanSource } from '../types'

interface Props {
  order: OrderState
  line: PickLine
  onScan: (raw: string, source: ScanSource) => { ok: boolean; message?: string; tone?: 'green' | 'amber' | 'red' }
  onRemove: (tag: string) => void
  onImportRecorded: () => void
  onNextLine: (() => void) | null
  onBack: () => void
}

interface Toast {
  tone: 'green' | 'amber' | 'red'
  text: string
}

export function ScanSheet({ order, line, onScan, onRemove, onImportRecorded, onNextLine, onBack }: Props) {
  const scans = order.scans[line.id] ?? []
  const status = lineStatus(line, scans)
  const [cameraOn, setCameraOn] = useState(true)
  // Uncontrolled on purpose: Bluetooth/USB scanners type ~24 keys a few ms
  // apart, and a controlled value re-render per keystroke can reorder them.
  const [hasText, setHasText] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (t: Toast) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  const handle = (raw: string, source: ScanSource) => {
    const r = onScan(raw, source)
    if (r.message) showToast({ tone: r.tone ?? (r.ok ? 'green' : 'red'), text: r.message })
  }

  const submitManual = () => {
    const el = inputRef.current
    if (!el) return
    const raw = el.value
    const tags = extractTags(raw)
    if (tags.length === 0) {
      if (raw.trim()) showToast({ tone: 'red', text: `Not a Metrc tag. ${TAG_HINT}` })
      return
    }
    el.value = ''
    setHasText(false)
    tags.forEach((t) => handle(t, 'manual'))
  }

  const recordedLeft = line.recordedTags.filter((t) => !scans.some((s) => s.tag === t))
  const done = status === 'complete'

  return (
    <Screen
      footer={
        <>
          <Button variant="secondary" onClick={onBack} className="px-4">
            Back
          </Button>
          {done && onNextLine ? (
            <Button block onClick={onNextLine}>
              <Check className="h-5 w-5" /> Next line
            </Button>
          ) : (
            <Button block variant={done ? 'primary' : 'secondary'} onClick={onBack}>
              {done ? 'Done' : 'Finish later'}
            </Button>
          )}
        </>
      }
    >
      <TopBar title={line.productName} subtitle={`${line.brand} · ${line.productType}${line.potency ? ` · ${line.potency}` : ''}`} onBack={onBack} />

      <Card className="p-4 flex items-center gap-4">
        <div
          className={`h-16 w-16 shrink-0 rounded-2xl flex flex-col items-center justify-center tabular-nums ${
            status === 'complete' ? 'bg-emerald-500 text-white' : status === 'over' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-800'
          }`}
        >
          <span className="text-display leading-none">{scans.length}</span>
          <span className="text-micro opacity-80">of {line.packagesExpected}</span>
        </div>
        <div className="min-w-0">
          <p className="text-subhead">
            Scan {line.packagesExpected} {line.packagesExpected === 1 ? 'package' : 'cases'}
          </p>
          <p className="text-sm text-gray-500">{line.unitsPerPackage} units each</p>
          {line.lotTag && (
            <p className="text-xs text-gray-500 mt-1">
              From lot <span className="font-bold text-gray-700 tabular-nums">{shortTag(line.lotTag, 8)}</span>
            </p>
          )}
        </div>
      </Card>

      {toast && <Notice tone={toast.tone}>{toast.text}</Notice>}

      {cameraOn ? <Scanner onScan={(t) => handle(t, 'camera')} /> : null}

      <div className="flex gap-2">
        <Button block variant="secondary" onClick={() => setCameraOn((v) => !v)}>
          {cameraOn ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          {cameraOn ? 'Hide camera' : 'Show camera'}
        </Button>
        <Button block variant="secondary" onClick={() => inputRef.current?.focus()}>
          <Keyboard className="h-5 w-5" /> Type tag
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submitManual()
        }}
        className="flex gap-2"
      >
        <Input
          ref={inputRef}
          defaultValue=""
          onInput={(e) => {
            const v = e.currentTarget.value
            setHasText(v.trim().length > 0)
            // Handheld scanners in keyboard mode type the whole tag in one burst
            const t = v.trim().toUpperCase()
            if (t.length >= 24 && isMetrcTag(t)) submitManual()
          }}
          placeholder="1A40C0300000B5…"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="done"
          className="font-mono tracking-wide uppercase"
        />
        <Button type="submit" variant="secondary" className="px-4" disabled={!hasText}>
          Add
        </Button>
      </form>

      {recordedLeft.length > 0 && (
        <Notice tone="blue">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Apex has {recordedLeft.length} tag{recordedLeft.length === 1 ? '' : 's'} recorded for this line.
            </span>
            <button type="button" onClick={onImportRecorded} className="font-bold underline">
              Use them
            </button>
          </div>
        </Notice>
      )}

      {scans.length > 0 && (
        <Card>
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-eyebrow uppercase text-gray-500">Scanned packages</span>
            {status === 'over' && <Pill tone="red">Over by {scans.length - line.packagesExpected}</Pill>}
          </div>
          {scans.map((s, i) => (
            <div key={s.tag} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0">
              <span className="w-6 text-center text-sm text-gray-400 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm tabular-nums text-gray-900 break-all">{s.tag}</p>
                <p className="text-micro text-gray-400 font-normal">
                  {new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {s.source}
                </p>
              </div>
              <button type="button" onClick={() => onRemove(s.tag)} aria-label={`Remove ${s.tag}`} className="h-10 w-10 inline-flex items-center justify-center rounded-full text-gray-400 active:bg-red-50 active:text-red-600">
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </Screen>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Check, Keyboard, Loader2, ScanSearch } from 'lucide-react'
import { Button, Card, Input, Notice, Screen, TopBar } from './ui'
import { Scanner } from './Scanner'
import { LotDigits } from './TagDigits'
import { lineStatus, summarize, tagIndex, type AddScanResult } from '../lib/order'
import { extractTags, isMetrcTag, normalizeTag, TAG_HINT } from '../lib/metrc'
import { parseLucidCode } from '../lib/lucidGreen'
import { describePackage, factsForLicense, matchByFacts, matchRecorded, queryLicenses, type LineMatch } from '../lib/scanFirst'
import { verifyPackages } from '../lib/t3api'
import type { T3Mode, T3PackageFacts } from '../../../shared/manifest/t3'
import type { OrderState, PickLine, ScanSource } from '../types'

interface Props {
  order: OrderState
  /** Adds the scan to a line; the caller owns the order state. */
  onAssign: (lineId: string, raw: string, source: ScanSource) => AddScanResult
  onFacts: (facts: T3PackageFacts, mode: T3Mode) => void
  onOpenLine: (lineId: string) => void
  onReview: () => void
  onBack: () => void
}

interface Toast {
  tone: 'green' | 'amber' | 'red'
  text: string
}

/** A scan the app could not place by itself; the picker picks the line. */
interface Pending {
  tag: string
  why: string
  lineIds: string[]
  facts?: T3PackageFacts
  mode?: T3Mode
}

/**
 * Scan-first mode: the camera stays open and every case scanned is routed
 * to its pick line — by the tags Apex recorded, else by asking Metrc what
 * the package is. Chris Wade (Proper, Nov 2026): pickers carry the paper PO
 * and would rather scan what's in front of them than find the line first.
 */
export function ScanAnySheet({ order, onAssign, onFacts, onOpenLine, onReview, onBack }: Props) {
  const [cameraOn, setCameraOn] = useState(true)
  const [hasText, setHasText] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [last, setLast] = useState<{ line: PickLine; tag: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The Metrc lookup is async; route against the order as it is when it lands.
  const orderRef = useRef(order)
  useEffect(() => {
    orderRef.current = order
  }, [order])

  const summary = summarize(order)
  const allDone = summary.expected > 0 && summary.complete === summary.total

  const showToast = (t: Toast) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  const openLines = (s: OrderState) =>
    s.lines.filter((l) => {
      const st = lineStatus(l, s.scans[l.id])
      return st === 'empty' || st === 'partial'
    })

  const assign = (lineId: string, tag: string, source: ScanSource, how: string) => {
    const r = onAssign(lineId, tag, source)
    const line = orderRef.current.lines.find((l) => l.id === lineId)
    if (!r.ok) {
      showToast({ tone: 'red', text: r.reason === 'duplicate-here' || r.reason === 'duplicate-elsewhere' ? `Already scanned${line ? ` on ${line.productName}` : ''}.` : 'Could not add that scan.' })
      return
    }
    const n = r.state.scans[lineId].length
    const l = r.state.lines.find((x) => x.id === lineId)!
    setLast({ line: l, tag })
    setPending(null)
    const complete = n === l.packagesExpected
    showToast({
      tone: r.warning ? 'amber' : 'green',
      text: r.warning ? `${how}. ${r.warning}` : `${how}. ${n} of ${l.packagesExpected}${complete ? ' — line complete' : ''}.`,
    })
  }

  const lookup = async (tag: string, source: ScanSource) => {
    const licenses = queryLicenses(orderRef.current)
    if (!licenses) {
      setPending({ tag, why: 'No origin licence on this order to look the tag up on.', lineIds: openLines(orderRef.current).map((l) => l.id) })
      return
    }
    setBusy(tag)
    const r = await verifyPackages({ licenseNumber: licenses.primary, tags: [tag], otherLicenses: licenses.others })
    setBusy(null)
    const state = orderRef.current
    if (!r.ok) {
      setPending({ tag, why: `Couldn't ask Metrc (${r.message}). Pick the line this case is for.`, lineIds: openLines(state).map((l) => l.id) })
      return
    }
    const facts = r.data.results[0]
    if (!facts) {
      setPending({ tag, why: 'Metrc returned nothing for this tag.', lineIds: openLines(state).map((l) => l.id) })
      return
    }
    const match: LineMatch = matchByFacts(state, facts)
    if (match.kind === 'line') {
      const line = state.lines.find((l) => l.id === match.lineId)!
      onFacts(factsForLicense(facts, state.licenseByProductType[line.productType] ?? ''), r.data.mode)
      assign(match.lineId, tag, source, match.how === 'lot' ? `Matched by lot …${(line.lotTag ?? '').slice(-7)}` : 'Matched by product name')
      return
    }
    if (match.kind === 'ambiguous') {
      setPending({ tag, why: `${describePackage(facts)}. More than one line fits — which is it?`, lineIds: match.lineIds, facts, mode: r.data.mode })
      return
    }
    setPending({
      tag,
      why:
        facts.state === 'not_found'
          ? `${describePackage(facts)}. If it's really on this order, pick its line.`
          : `Metrc says this is ${describePackage(facts)}, which matches no line on this pick list. Wrong case? If not, pick a line.`,
      lineIds: openLines(state).map((l) => l.id),
      facts,
      mode: r.data.mode,
    })
  }

  const handle = (raw: string, source: ScanSource) => {
    if (busy) {
      showToast({ tone: 'amber', text: 'Still checking the last case with Metrc…' })
      return
    }
    const lucid = parseLucidCode(raw)
    if (lucid) {
      showToast({ tone: 'red', text: lucid.kind === 'case' ? "That's the CaseID label on the front. Scan the blue Metrc barcode on the side of the case." : "That's a LucidID from a unit inside, not the case. Scan the blue Metrc barcode on the case." })
      return
    }
    const tag = normalizeTag(raw)
    if (!isMetrcTag(tag)) {
      showToast({ tone: 'red', text: `Not a Metrc tag. ${TAG_HINT}` })
      return
    }
    const state = orderRef.current
    const already = tagIndex(state).get(tag)
    if (already?.length) {
      const where = state.lines.find((l) => l.id === already[0])
      showToast({ tone: 'red', text: `Already scanned${where ? ` on ${where.productName}` : ''}.` })
      return
    }
    if (state.lines.some((l) => l.lotTag === tag)) {
      showToast({ tone: 'red', text: "That's a lot tag from the pick list, not a case. Scan the case label." })
      return
    }
    const recorded = matchRecorded(state, tag)
    if (recorded.kind === 'line') {
      assign(recorded.lineId, tag, source, 'Apex recorded this tag')
      return
    }
    if (recorded.kind === 'ambiguous') {
      setPending({ tag, why: 'Apex recorded this tag on more than one line — which is it?', lineIds: recorded.lineIds })
      return
    }
    void lookup(tag, source)
  }

  const submitManual = () => {
    const el = inputRef.current
    if (!el) return
    const raw = el.value
    const tags = extractTags(raw)
    if (tags.length === 0) {
      if (parseLucidCode(raw)) {
        el.value = ''
        setHasText(false)
        handle(raw.trim(), 'manual')
      } else if (raw.trim()) {
        showToast({ tone: 'red', text: `Not a Metrc tag. ${TAG_HINT}` })
      }
      return
    }
    el.value = ''
    setHasText(false)
    handle(tags[0], 'manual')
  }

  const choosePending = (lineId: string) => {
    if (!pending) return
    if (pending.facts && pending.mode) {
      const line = order.lines.find((l) => l.id === lineId)
      onFacts(factsForLicense(pending.facts, line ? order.licenseByProductType[line.productType] ?? '' : ''), pending.mode)
    }
    assign(lineId, pending.tag, 'camera', 'Added to the line you chose')
  }

  return (
    <Screen
      footer={
        <>
          <Button variant="secondary" onClick={onBack} className="px-4">
            Lines
          </Button>
          <Button block variant={allDone ? 'primary' : 'secondary'} onClick={onReview}>
            {allDone ? (
              <>
                <Check className="h-5 w-5" /> Review & export
              </>
            ) : (
              'Review'
            )}
          </Button>
        </>
      }
    >
      <TopBar title="Scan any case" subtitle={`${summary.scanned} of ${summary.expected} packages · ${summary.complete} of ${summary.total} lines done`} onBack={onBack} />

      {toast && <Notice tone={toast.tone}>{toast.text}</Notice>}
      {busy && (
        <Notice tone="blue">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Asking Metrc what …{busy.slice(-7)} is…
          </span>
        </Notice>
      )}

      {pending && (
        <Card className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ScanSearch className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-subhead">
                Which line is <span className="font-mono">…{pending.tag.slice(-7)}</span> for?
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{pending.why}</p>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
            {pending.lineIds.map((id) => {
              const line = order.lines.find((l) => l.id === id)
              if (!line) return null
              const n = order.scans[id]?.length ?? 0
              return (
                <button key={id} type="button" onClick={() => choosePending(id)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 active:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    {line.lotTag && (
                      <p className="flex items-baseline gap-2 leading-none">
                        <span className="text-eyebrow uppercase text-gray-400">Lot</span>
                        <LotDigits tag={line.lotTag} size="md" />
                      </p>
                    )}
                    <p className="text-sm font-bold text-gray-800 leading-snug">{line.productName}</p>
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums shrink-0">
                    {n} of {line.packagesExpected}
                  </span>
                </button>
              )
            })}
            {pending.lineIds.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">Every line is already complete.</p>}
          </div>
          <Button block variant="secondary" onClick={() => setPending(null)}>
            Skip this case
          </Button>
        </Card>
      )}

      {cameraOn && !pending ? <Scanner onScan={(t) => handle(t, 'camera')} /> : null}

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

      {last && (
        <Card className="p-4">
          <p className="text-eyebrow uppercase text-gray-500">Last case</p>
          <button type="button" onClick={() => onOpenLine(last.line.id)} className="mt-1 w-full text-left flex items-center gap-3">
            <div
              className={`w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center tabular-nums ${
                lineStatus(last.line, order.scans[last.line.id]) === 'complete' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              <span className="text-h2 leading-none">{order.scans[last.line.id]?.length ?? 0}</span>
              <span className="text-micro opacity-80">of {last.line.packagesExpected}</span>
            </div>
            <div className="min-w-0 flex-1">
              {last.line.lotTag && (
                <p className="flex items-baseline gap-2 leading-none">
                  <span className="text-eyebrow uppercase text-gray-400">Lot</span>
                  <LotDigits tag={last.line.lotTag} size="md" />
                </p>
              )}
              <p className="text-sm font-bold text-gray-800 leading-snug truncate">{last.line.productName}</p>
              <p className="text-xs text-gray-500 font-mono">…{last.tag.slice(-7)}</p>
            </div>
          </button>
        </Card>
      )}

      {!last && !pending && (
        <p className="text-center text-xs text-gray-500 px-4">
          Scan the blue Metrc barcode on any case. Tags Apex recorded route themselves; anything else is looked up in Metrc and matched to its lot.
        </p>
      )}
    </Screen>
  )
}

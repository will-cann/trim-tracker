import { ChevronRight, Check, AlertTriangle, Settings, RotateCcw, Download } from 'lucide-react'
import { Button, Card, Pill, Screen, TopBar, Notice } from './ui'
import { lineStatus, summarize, type LineStatus } from '../lib/order'
import { shortTag } from '../lib/metrc'
import type { OrderState, PickLine, Scan } from '../types'

interface Props {
  order: OrderState
  onOpenLine: (lineId: string) => void
  onReview: () => void
  onImportRecorded: () => void
  onReset: () => void
  onSettings: () => void
}

const STATUS_PILL: Record<LineStatus, { tone: 'gray' | 'amber' | 'green' | 'red'; label: string }> = {
  empty: { tone: 'gray', label: 'Not started' },
  partial: { tone: 'amber', label: 'In progress' },
  complete: { tone: 'green', label: 'Done' },
  over: { tone: 'red', label: 'Over' },
}

function LineRow({ line, scans, onOpen }: { line: PickLine; scans: Scan[] | undefined; onOpen: () => void }) {
  const scanned = scans?.length ?? 0
  const st = lineStatus(line, scans)
  const pill = STATUS_PILL[st]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-stretch gap-3 px-4 py-3 active:bg-gray-50 border-b border-gray-100 last:border-b-0"
    >
      <div
        className={`w-12 shrink-0 rounded-xl flex flex-col items-center justify-center tabular-nums ${
          st === 'complete'
            ? 'bg-emerald-500 text-white'
            : st === 'over'
              ? 'bg-red-500 text-white'
              : st === 'partial'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-700'
        }`}
      >
        {st === 'complete' ? (
          <Check className="h-6 w-6" />
        ) : (
          <>
            <span className="text-h2 leading-none">{scanned}</span>
            <span className="text-micro opacity-80">of {line.packagesExpected}</span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold text-gray-900 leading-snug">{line.productName}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {line.packagesExpected} × {line.unitsPerPackage} units
          {line.lotTag && <> · Lot {shortTag(line.lotTag)}</>}
          {line.potency && <> · {line.potency}</>}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <Pill tone={pill.tone}>{pill.label}</Pill>
          <Pill tone="blue">{line.productType}</Pill>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 self-center text-gray-300 shrink-0" />
    </button>
  )
}

export function PickListScreen({ order, onOpenLine, onReview, onImportRecorded, onReset, onSettings }: Props) {
  const s = summarize(order)
  const first = order.lines[0]
  const hasRecorded = order.lines.some((l) => l.recordedTags.length) && s.scanned === 0
  const pct = s.expected ? Math.round((s.scanned / s.expected) * 100) : 0

  return (
    <Screen
      footer={
        <>
          <Button variant="secondary" onClick={onReset} aria-label="Start over" className="px-3">
            <RotateCcw className="h-5 w-5" />
          </Button>
          <Button block onClick={onReview}>
            Review & export {s.scanned > 0 && <span className="opacity-80 font-normal">· {s.scanned} pkgs</span>}
          </Button>
        </>
      }
    >
      <TopBar
        title={first?.orderNumber ?? 'Pick list'}
        subtitle={first ? `${first.buyer} · ${first.buyerLicense}` : order.sourceName}
        right={
          <button type="button" onClick={onSettings} aria-label="Settings" className="h-10 w-10 inline-flex items-center justify-center rounded-full active:bg-gray-100 text-gray-600">
            <Settings className="h-5 w-5" />
          </button>
        }
      />

      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-eyebrow uppercase text-gray-500">Packages scanned</span>
          <span className="text-h1 tabular-nums">
            {s.scanned}
            <span className="text-gray-400 text-subhead"> / {s.expected}</span>
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {s.complete} of {s.total} lines done · Tap a line to scan its cases
        </p>
      </Card>

      {hasRecorded && (
        <Notice tone="blue">
          <div className="flex items-start gap-2">
            <Download className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              Apex already has case tags recorded on this pick list.
              <button type="button" onClick={onImportRecorded} className="ml-1 font-bold underline">
                Use them
              </button>{' '}
              or scan fresh.
            </div>
          </div>
        </Notice>
      )}

      {s.issues.length > 0 && s.scanned > 0 && (
        <Notice tone="amber">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {s.issues.length} line{s.issues.length === 1 ? '' : 's'} still need attention
          </div>
        </Notice>
      )}

      <Card>
        {order.lines.map((line) => (
          <LineRow key={line.id} line={line} scans={order.scans[line.id]} onOpen={() => onOpenLine(line.id)} />
        ))}
      </Card>
    </Screen>
  )
}

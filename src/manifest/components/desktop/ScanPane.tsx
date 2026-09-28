import { ArrowRight, Check, Download, Trash2, AlertTriangle, X } from 'lucide-react'
import { Button, Card, Pill } from '../ui'
import { WedgeInput } from './WedgeInput'
import { lineStatus } from '../../lib/order'
import { shortTag } from '../../lib/metrc'
import type { OrderState, PickLine } from '../../types'

export interface ScanEvent {
  tone: 'green' | 'amber' | 'red'
  title: string
  detail?: string
  at: number
}

interface Props {
  order: OrderState
  line: PickLine | null
  lastEvent: ScanEvent | null
  onScan: (raw: string) => void
  onRemove: (lineId: string, tag: string) => void
  onImportRecorded: (lineId: string) => void
  onNextLine: (() => void) | null
  onReview: () => void
}

const SOURCE_LABEL: Record<string, string> = { usb: 'scanner', manual: 'typed', camera: 'camera', recorded: 'from Apex' }

export function ScanPane({ order, line, lastEvent, onScan, onRemove, onImportRecorded, onNextLine, onReview }: Props) {
  const scans = line ? order.scans[line.id] ?? [] : []
  const status = line ? lineStatus(line, scans) : 'empty'
  const recordedLeft = line ? line.recordedTags.filter((t) => !scans.some((s) => s.tag === t)) : []
  const allDone = order.lines.every((l) => lineStatus(l, order.scans[l.id]) === 'complete')

  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="p-5">
        <WedgeInput onScan={onScan} />
      </Card>

      {lastEvent && (
        <div
          key={lastEvent.at}
          role="status"
          className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${
            lastEvent.tone === 'green'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : lastEvent.tone === 'amber'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {lastEvent.tone === 'green' ? <Check className="h-6 w-6 shrink-0" /> : lastEvent.tone === 'amber' ? <AlertTriangle className="h-6 w-6 shrink-0" /> : <X className="h-6 w-6 shrink-0" />}
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{lastEvent.title}</p>
            {lastEvent.detail && <p className="text-sm mt-0.5 opacity-90">{lastEvent.detail}</p>}
          </div>
        </div>
      )}

      {line ? (
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div
              className={`h-20 w-20 shrink-0 rounded-2xl flex flex-col items-center justify-center tabular-nums ${
                status === 'complete' ? 'bg-emerald-500 text-white' : status === 'over' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              <span className="text-display leading-none">{scans.length}</span>
              <span className="text-micro opacity-80">of {line.packagesExpected}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-eyebrow uppercase text-gray-500">Active line</p>
              <h2 className="text-h2 leading-tight">{line.productName}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {line.brand} · {line.productType}
                {line.potency ? ` · ${line.potency}` : ''} · {line.unitsPerPackage} units per {line.packagesExpected === 1 ? 'package' : 'case'}
              </p>
              {line.lotTag && (
                <p className="text-sm text-gray-600 mt-1">
                  Pull from lot <span className="font-mono font-bold tabular-nums">{line.lotTag}</span>
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {onNextLine && (
                <Button variant={status === 'complete' ? 'primary' : 'secondary'} onClick={onNextLine} className="min-h-10">
                  Next open line <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {recordedLeft.length > 0 && (
                <Button variant="secondary" onClick={() => onImportRecorded(line.id)} className="min-h-10">
                  <Download className="h-4 w-4" /> Use {recordedLeft.length} recorded
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-center text-gray-500">
          {allDone ? (
            <>
              <Check className="h-8 w-8 mx-auto text-emerald-500" />
              <p className="mt-2 font-bold text-gray-900">Every line is complete.</p>
              <Button onClick={onReview} className="mt-3">
                Review & export
              </Button>
            </>
          ) : (
            'Click a line to make it active.'
          )}
        </Card>
      )}

      {line && scans.length > 0 && (
        <Card className="flex-1 overflow-y-auto">
          <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-eyebrow uppercase text-gray-500">Scanned on this line</span>
            {status === 'over' && <Pill tone="red">Over by {scans.length - line.packagesExpected}</Pill>}
          </div>
          {[...scans].reverse().map((s, i) => (
            <div key={s.tag} className="flex items-center gap-4 px-5 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
              <span className="w-6 text-center text-sm text-gray-400 tabular-nums">{scans.length - i}</span>
              <p className="font-mono text-base tabular-nums text-gray-900 flex-1">
                <span className="text-gray-400">{s.tag.slice(0, 14)}</span>
                <span className="font-bold">{s.tag.slice(14)}</span>
              </p>
              <span className="text-xs text-gray-400 w-40 text-right">
                {new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {SOURCE_LABEL[s.source] ?? s.source}
              </span>
              <button
                type="button"
                onClick={() => onRemove(line.id, s.tag)}
                aria-label={`Remove ${shortTag(s.tag)}`}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

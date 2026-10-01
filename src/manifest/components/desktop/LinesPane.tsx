import { Check, Download } from 'lucide-react'
import { Card, Notice, Pill } from '../ui'
import { lineStatus, summarize, type LineStatus } from '../../lib/order'
import { shortTag } from '../../lib/metrc'
import type { OrderState } from '../../types'

interface Props {
  order: OrderState
  activeLineId: string | null
  onSelect: (lineId: string) => void
  onImportRecorded: () => void
}

const STATUS: Record<LineStatus, { tone: 'gray' | 'amber' | 'green' | 'red'; label: string }> = {
  empty: { tone: 'gray', label: 'Not started' },
  partial: { tone: 'amber', label: 'In progress' },
  complete: { tone: 'green', label: 'Done' },
  over: { tone: 'red', label: 'Over' },
}

export function LinesPane({ order, activeLineId, onSelect, onImportRecorded }: Props) {
  const s = summarize(order)
  const hasRecorded = order.lines.some((l) => l.recordedTags.length) && s.scanned === 0
  const pct = s.expected ? Math.round((s.scanned / s.expected) * 100) : 0

  return (
    <div className="h-full flex flex-col gap-3">
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
          {s.complete} of {s.total} lines done · Click a line to make it active, or just scan — tags Apex already recorded route themselves.
        </p>
      </Card>

      {hasRecorded && (
        <Notice tone="blue">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 shrink-0" />
            <span className="flex-1">Apex already has case tags recorded on this pick list.</span>
            <button type="button" onClick={onImportRecorded} className="font-bold underline">
              Use them
            </button>
          </div>
        </Notice>
      )}

      <Card className="flex-1 overflow-y-auto">
        {order.lines.map((line, i) => {
          const scans = order.scans[line.id]
          const n = scans?.length ?? 0
          const st = lineStatus(line, scans)
          const active = line.id === activeLineId
          return (
            <button
              key={line.id}
              type="button"
              onClick={() => onSelect(line.id)}
              aria-current={active ? 'true' : undefined}
              className={`w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0 transition-colors ${
                active ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-400' : 'hover:bg-gray-50'
              }`}
            >
              <span className="w-6 text-xs text-gray-400 tabular-nums text-right">{i + 1}</span>
              <div
                className={`w-11 h-11 shrink-0 rounded-lg flex flex-col items-center justify-center tabular-nums ${
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
                  <Check className="h-5 w-5" />
                ) : (
                  <>
                    <span className="text-base font-bold leading-none">{n}</span>
                    <span className="text-micro opacity-80">of {line.packagesExpected}</span>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 leading-snug truncate">{line.productName}</p>
                <p className="text-xs text-gray-500 truncate">
                  {line.packagesExpected} × {line.unitsPerPackage} units
                  {line.lotTag && <> · Lot {shortTag(line.lotTag)}</>}
                  {line.potency && <> · {line.potency}</>}
                </p>
              </div>
              <div className="hidden xl:flex flex-col items-end gap-1 shrink-0">
                <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
                <Pill tone="blue">{line.productType}</Pill>
              </div>
            </button>
          )
        })}
      </Card>
    </div>
  )
}

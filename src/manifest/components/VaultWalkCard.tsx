import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from 'lucide-react'
import { Button, Card } from './ui'
import { DEFAULT_WALK, moveStop, vaultStopLabel, type VaultWalk } from '../lib/vaultOrder'
import type { OrderState } from '../types'

interface Props {
  walk: VaultWalk
  order: OrderState | null
  onChange: (walk: VaultWalk) => void
}

/**
 * The order a pick list is sorted into — the route through the vault. Drag
 * a stop (mouse) or use the arrows (touch) to match how the room is laid
 * out today; the loaded pick list re-sorts as you go and scans stay with
 * their lines.
 */
export function VaultWalkCard({ walk, order, onChange }: Props) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const counts = new Map<string, number>()
  for (const line of order?.lines ?? []) {
    const label = vaultStopLabel(line)
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const unmatched = (order?.lines ?? []).filter((l) => vaultStopLabel(l) === null).length
  const isDefault = walk.length === DEFAULT_WALK.length && walk.every((l, i) => l === DEFAULT_WALK[i])

  const drop = (to: number) => {
    if (dragging !== null) onChange(moveStop(walk, dragging, to))
    setDragging(null)
    setOver(null)
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-subhead">Vault walk order</h2>
          <p className="text-xs text-gray-500">
            Pick lists are sorted into this order so one pass through the vault covers the whole order and the cart matches the manifest. Drag a stop or use the arrows; the loaded list re-sorts right away.
          </p>
        </div>
        {!isDefault && (
          <Button variant="ghost" className="min-h-10 px-3 text-sm shrink-0" onClick={() => onChange(DEFAULT_WALK)}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        )}
      </div>

      <ol className="rounded-xl border border-gray-200 divide-y divide-gray-100" aria-label="Vault stops in walk order">
        {walk.map((label, i) => {
          const n = counts.get(label) ?? 0
          return (
            <li
              key={label}
              draggable
              onDragStart={(e) => {
                setDragging(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', label)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (over !== i) setOver(i)
              }}
              onDragLeave={() => over === i && setOver(null)}
              onDrop={(e) => {
                e.preventDefault()
                drop(i)
              }}
              onDragEnd={() => {
                setDragging(null)
                setOver(null)
              }}
              className={`flex items-center gap-2 pl-2 pr-1 py-1.5 ${
                over === i && dragging !== null && dragging !== i ? 'bg-emerald-50' : dragging === i ? 'opacity-50' : n > 0 ? 'bg-white' : 'bg-gray-50/60'
              }`}
            >
              <GripVertical className="h-4 w-4 text-gray-300 shrink-0 cursor-grab" aria-hidden />
              <span className="w-5 text-xs text-gray-400 tabular-nums text-right shrink-0">{i + 1}</span>
              <span className={`flex-1 min-w-0 truncate text-sm ${n > 0 ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
              {n > 0 && <span className="text-micro text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 shrink-0">{n} line{n === 1 ? '' : 's'}</span>}
              <button
                type="button"
                aria-label={`Move ${label} up`}
                disabled={i === 0}
                onClick={() => onChange(moveStop(walk, i, i - 1))}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 disabled:opacity-30"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={`Move ${label} down`}
                disabled={i === walk.length - 1}
                onClick={() => onChange(moveStop(walk, i, i + 1))}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 disabled:opacity-30"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </li>
          )
        })}
      </ol>
      <p className="text-xs text-gray-500">
        Lines that match no stop go last in Apex order{unmatched > 0 ? ` (${unmatched} on the loaded list)` : ''}. Saved on this device.
      </p>
    </Card>
  )
}

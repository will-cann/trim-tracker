import { useState } from 'react'
import { ScanBarcode, FileOutput, Settings, RotateCcw } from 'lucide-react'
import { LayoutContext } from '../layoutContext'
import { LoadScreen } from '../LoadScreen'
import { ReviewScreen } from '../ReviewScreen'
import { SettingsScreen } from '../SettingsScreen'
import { LinesPane } from './LinesPane'
import { ScanPane, type ScanEvent } from './ScanPane'
import { importRecordedTags, removeScan, scanFailureMessage, summarize } from '../../lib/order'
import { firstOpenLine, wedgeScan } from '../../lib/wedge'
import { shortTag } from '../../lib/metrc'
import { beep } from '../../lib/beep'
import type { EmailSettings, LayoutPreference, LicenseDefaults } from '../../lib/storage'
import type { DestinationHeader, OrderState, PickLine, TransporterProfile } from '../../types'

interface Props {
  order: OrderState | null
  transporter: TransporterProfile
  licenses: LicenseDefaults
  email: EmailSettings
  layoutPref: LayoutPreference
  onLayoutPref: (p: LayoutPreference) => void
  setOrder: (s: OrderState) => void
  update: (fn: (s: OrderState) => OrderState) => void
  onTransporter: (t: Partial<TransporterProfile>) => void
  onLicenses: (l: Partial<LicenseDefaults>) => void
  onEmail: (e: Partial<EmailSettings>) => void
  onLoaded: (lines: PickLine[], sourceName: string) => void
  onReset: () => void
}

type Pane = 'scan' | 'review' | 'settings'

export function DesktopLayout(props: Props) {
  const { order, transporter, licenses, email, layoutPref, onLayoutPref, setOrder, update, onTransporter, onLicenses, onEmail, onLoaded, onReset } = props
  const [pane, setPane] = useState<Pane>('scan')
  const [activeLineId, setActiveLineId] = useState<string | null>(() => (order ? firstOpenLine(order)?.id ?? null : null))
  const [lastEvent, setLastEvent] = useState<ScanEvent | null>(null)

  // New order loaded → start on its first open line with a clean status banner.
  const [seenLoadedAt, setSeenLoadedAt] = useState(order?.loadedAt)
  if (order && order.loadedAt !== seenLoadedAt) {
    setSeenLoadedAt(order.loadedAt)
    setActiveLineId(firstOpenLine(order)?.id ?? order.lines[0]?.id ?? null)
    setLastEvent(null)
    setPane('scan')
  }

  if (!order) {
    return (
      <LayoutContext.Provider value="wide">
        {pane === 'settings' ? (
          <SettingsScreen
            transporter={transporter}
            licenses={licenses}
            email={email}
            layoutPref={layoutPref}
            hasOrder={false}
            onTransporter={onTransporter}
            onLicenses={onLicenses}
            onEmail={onEmail}
            onLayoutPref={onLayoutPref}
            onReset={onReset}
            onBack={() => setPane('scan')}
          />
        ) : (
          <LoadScreen onLoaded={onLoaded} onSettings={() => setPane('settings')} />
        )}
      </LayoutContext.Provider>
    )
  }

  const first = order.lines[0]
  const summary = summarize(order)
  const activeLine = order.lines.find((l) => l.id === activeLineId) ?? null
  const nextOpen = firstOpenLine(order, activeLineId)

  const handleScan = (raw: string) => {
    const r = wedgeScan(order, raw, activeLineId)
    if (!r.ok) {
      beep('error')
      const where = r.lineId ? order.lines.find((l) => l.id === r.lineId)?.productName : undefined
      setLastEvent({ tone: 'red', title: scanFailureMessage(r.reason, r.detail), detail: r.reason === 'invalid' ? `Read: ${raw}` : where ? `${shortTag(raw)} · ${where}` : shortTag(raw), at: Date.now() })
      return
    }
    setOrder(r.state)
    const line = r.state.lines.find((l) => l.id === r.lineId)!
    const lineScans = r.state.scans[line.id]
    const n = lineScans.length
    const tag = lineScans[n - 1].tag
    const parts: string[] = []
    if (r.routed === 'recorded' && r.lineId !== activeLineId) parts.push('Matched a tag Apex recorded for this line.')
    if (r.routed === 'first-open' && r.lineId !== activeLineId) parts.push('No line was active, so it went to the first open one.')
    if (r.lineComplete) {
      const next = firstOpenLine(r.state, line.id)
      setActiveLineId(next?.id ?? line.id)
      parts.push(next ? `Line complete — now on ${next.productName}.` : 'Line complete — every line is done.')
      beep(next ? 'ok' : 'done')
    } else {
      setActiveLineId(line.id)
      beep(r.warning ? 'error' : 'ok')
    }
    setLastEvent({
      tone: r.warning ? 'amber' : 'green',
      title: `${shortTag(tag)} · ${n} of ${line.packagesExpected} · ${line.productName}`,
      detail: [r.warning, ...parts].filter(Boolean).join(' '),
      at: Date.now(),
    })
  }

  const header = (
    <header className="h-16 shrink-0 bg-white border-b border-gray-200 px-4 flex items-center gap-4">
      <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg" />
      <div className="min-w-0">
        <h1 className="text-subhead leading-tight truncate">
          {first?.orderNumber ?? 'Pick list'} <span className="font-normal text-gray-500">· {first ? `${first.buyer} · ${first.buyerLicense}` : order.sourceName}</span>
        </h1>
        <p className="text-xs text-gray-500">
          {summary.scanned} of {summary.expected} packages · {summary.complete} of {summary.total} lines done
        </p>
      </div>
      <div className="flex-1" />
      <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        {(
          [
            ['scan', 'Scan', ScanBarcode],
            ['review', 'Review & export', FileOutput],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPane(key)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 h-9 text-sm font-bold transition-colors ${
              pane === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPane(pane === 'settings' ? 'scan' : 'settings')}
        aria-label="Settings"
        className={`h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100 ${pane === 'settings' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-600'}`}
      >
        <Settings className="h-5 w-5" />
      </button>
      <button type="button" onClick={onReset} aria-label="Start over" className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">
        <RotateCcw className="h-5 w-5" />
      </button>
    </header>
  )

  return (
    <div className="h-dvh flex flex-col bg-gray-100">
      {header}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(380px,5fr)_7fr] gap-3 p-3">
        <section className="min-h-0 overflow-y-auto">
          <LinesPane
            order={order}
            activeLineId={activeLineId}
            onSelect={(id) => {
              setActiveLineId(id)
              if (pane !== 'scan') setPane('scan')
            }}
            onImportRecorded={() => {
              const r = importRecordedTags(order)
              setOrder(r.state)
              const next = firstOpenLine(r.state)
              setActiveLineId(next?.id ?? null)
              setLastEvent({ tone: 'green', title: `Imported ${r.added} recorded tag${r.added === 1 ? '' : 's'} from Apex`, at: Date.now() })
            }}
          />
        </section>
        <section className="min-h-0 overflow-y-auto">
          {pane === 'scan' && (
            <ScanPane
              order={order}
              line={activeLine}
              lastEvent={lastEvent}
              onScan={handleScan}
              onRemove={(lineId, tag) => update((s) => removeScan(s, lineId, tag))}
              onImportRecorded={(lineId) => {
                const r = importRecordedTags(order, lineId)
                setOrder(r.state)
                setLastEvent({ tone: 'green', title: `Imported ${r.added} recorded tag${r.added === 1 ? '' : 's'} for this line`, at: Date.now() })
              }}
              onNextLine={nextOpen && nextOpen.id !== activeLineId ? () => setActiveLineId(nextOpen.id) : null}
              onReview={() => setPane('review')}
            />
          )}
          {pane === 'review' && (
            <LayoutContext.Provider value="embedded">
              <ReviewScreen
                order={order}
                transporter={transporter}
                licenses={licenses}
                email={email}
                onHeader={(h: Partial<DestinationHeader>) => update((s) => ({ ...s, header: { ...s.header, ...h } }))}
                onLicenseForType={(pt, lic) => update((s) => ({ ...s, licenseByProductType: { ...s.licenseByProductType, [pt]: lic } }))}
                onLineTotal={(id, v) => update((s) => ({ ...s, lineTotals: { ...s.lineTotals, [id]: v } }))}
                onEmail={onEmail}
                onEditTransporter={() => setPane('settings')}
                onBack={() => setPane('scan')}
              />
            </LayoutContext.Provider>
          )}
          {pane === 'settings' && (
            <LayoutContext.Provider value="embedded">
              <SettingsScreen
                transporter={transporter}
                licenses={licenses}
                email={email}
                layoutPref={layoutPref}
                hasOrder
                onTransporter={onTransporter}
                onLicenses={onLicenses}
                onEmail={onEmail}
                onLayoutPref={onLayoutPref}
                onReset={onReset}
                onBack={() => setPane('scan')}
              />
            </LayoutContext.Provider>
          )}
        </section>
      </div>
    </div>
  )
}

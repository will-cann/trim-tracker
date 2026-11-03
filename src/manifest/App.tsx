import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadScreen } from './components/LoadScreen'
import { PickListScreen } from './components/PickListScreen'
import { ScanSheet } from './components/ScanSheet'
import { ScanAnySheet } from './components/ScanAnySheet'
import { ReviewScreen } from './components/ReviewScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { DesktopLayout } from './components/desktop/DesktopLayout'
import { useLayoutMode } from './lib/layout'
import {
  addScan,
  createOrderState,
  importRecordedTags,
  lineStatus,
  removeScan,
  scanFailureMessage,
  type AddScanResult,
} from './lib/order'
import { mergeFacts } from './lib/scanFirst'
import {
  loadEmail,
  loadLayoutPreference,
  loadLicenses,
  loadOrder,
  loadTransporter,
  loadVaultWalk,
  saveEmail,
  saveLayoutPreference,
  saveLicenses,
  saveOrder,
  saveTransporter,
  saveVaultWalk,
  type EmailSettings,
  type LayoutPreference,
  type LicenseDefaults,
} from './lib/storage'
import { sortByVaultOrder, type VaultWalk } from './lib/vaultOrder'
import type { DestinationHeader, OrderState, PickLine, ScanSource, TransporterProfile } from './types'

type View =
  | { kind: 'load' }
  | { kind: 'pick' }
  | { kind: 'scan'; lineId: string }
  | { kind: 'scan-any' }
  | { kind: 'review' }
  | { kind: 'settings'; from: View }

export default function App() {
  const [order, setOrder] = useState<OrderState | null>(() => loadOrder())
  // Scan-first lookups resolve asynchronously; they add to the order as it is then.
  const orderRef = useRef(order)
  useEffect(() => {
    orderRef.current = order
  }, [order])
  const [transporter, setTransporter] = useState<TransporterProfile>(() => loadTransporter())
  const [licenses, setLicenses] = useState<LicenseDefaults>(() => loadLicenses())
  const [email, setEmail] = useState<EmailSettings>(() => loadEmail())
  const [layoutPref, setLayoutPref] = useState<LayoutPreference>(() => loadLayoutPreference())
  const [vaultWalk, setVaultWalk] = useState<VaultWalk>(() => loadVaultWalk())
  const [view, setView] = useState<View>(() => (loadOrder() ? { kind: 'pick' } : { kind: 'load' }))
  const layout = useLayoutMode(layoutPref)

  useEffect(() => saveOrder(order), [order])
  useEffect(() => saveTransporter(transporter), [transporter])
  useEffect(() => saveLicenses(licenses), [licenses])
  useEffect(() => saveEmail(email), [email])
  useEffect(() => saveLayoutPreference(layoutPref), [layoutPref])
  useEffect(() => saveVaultWalk(vaultWalk), [vaultWalk])
  const onEmail = (e: Partial<EmailSettings>) => setEmail((p) => ({ ...p, ...e }))
  // A new walk re-sorts the loaded list in place; scans are keyed by line id, so they stay put.
  const onVaultWalk = (w: VaultWalk) => {
    setVaultWalk(w)
    setOrder((s) => (s ? { ...s, lines: sortByVaultOrder(s.lines, w) } : s))
  }
  const onTransporter = (t: Partial<TransporterProfile>) => setTransporter((p) => ({ ...p, ...t }))
  const onLicenses = (l: Partial<LicenseDefaults>) => setLicenses((p) => ({ ...p, ...l }))

  const update = useCallback((fn: (s: OrderState) => OrderState) => {
    setOrder((s) => (s ? fn(s) : s))
  }, [])

  // Returns the outcome synchronously (for the toast) but applies it as a
  // functional update so a facts merge queued just before isn't lost.
  const assignScan = (lineId: string, raw: string, source: ScanSource): AddScanResult => {
    const current = orderRef.current
    if (!current) return { ok: false, reason: 'invalid' }
    const r = addScan(current, lineId, raw, source)
    if (r.ok) {
      orderRef.current = r.state
      setOrder((s) => {
        if (!s) return s
        const again = addScan(s, lineId, raw, source)
        return again.ok ? again.state : s
      })
    }
    return r
  }

  const onLoaded = (lines: PickLine[], sourceName: string) => {
    setOrder(createOrderState(lines, sourceName, licenses))
    setView({ kind: 'pick' })
  }

  const reset = () => {
    if (order && Object.values(order.scans).some((s) => s.length) && !window.confirm('Clear this order and all scans?')) return
    setOrder(null)
    setView({ kind: 'load' })
  }

  if (layout === 'laptop') {
    return (
      <DesktopLayout
        order={order}
        transporter={transporter}
        licenses={licenses}
        email={email}
        layoutPref={layoutPref}
        vaultWalk={vaultWalk}
        onLayoutPref={setLayoutPref}
        onVaultWalk={onVaultWalk}
        setOrder={setOrder}
        update={update}
        onTransporter={onTransporter}
        onLicenses={onLicenses}
        onEmail={onEmail}
        onLoaded={onLoaded}
        onReset={reset}
      />
    )
  }

  if (view.kind === 'settings') {
    return (
      <SettingsScreen
        transporter={transporter}
        licenses={licenses}
        email={email}
        layoutPref={layoutPref}
        vaultWalk={vaultWalk}
        order={order}
        onTransporter={onTransporter}
        onLicenses={onLicenses}
        onEmail={onEmail}
        onLayoutPref={setLayoutPref}
        onVaultWalk={onVaultWalk}
        onReset={reset}
        onBack={() => setView(order ? view.from : { kind: 'load' })}
      />
    )
  }

  if (!order || view.kind === 'load') {
    return <LoadScreen vaultWalk={vaultWalk} onLoaded={onLoaded} onSettings={() => setView({ kind: 'settings', from: { kind: 'load' } })} />
  }

  const scanLine = view.kind === 'scan' ? order.lines.find((l) => l.id === view.lineId) : undefined
  if (view.kind === 'scan' && scanLine) {
    const line = scanLine
    const idx = order.lines.indexOf(line)
    const nextIncomplete = order.lines.slice(idx + 1).concat(order.lines.slice(0, idx)).find((l) => lineStatus(l, order.scans[l.id]) !== 'complete')

    return (
      <ScanSheet
        order={order}
        line={line}
        onScan={(raw: string, source: ScanSource) => {
          const r = addScan(order, line.id, raw, source)
          if (!r.ok) return { ok: false, message: scanFailureMessage(r.reason, r.detail), tone: 'red' as const }
          setOrder(r.state)
          const n = r.state.scans[line.id].length
          return r.warning
            ? { ok: true, message: r.warning, tone: 'amber' as const }
            : { ok: true, message: n === line.packagesExpected ? `Line complete: ${n} of ${line.packagesExpected}` : `${n} of ${line.packagesExpected}`, tone: 'green' as const }
        }}
        onRemove={(tag) => update((s) => removeScan(s, line.id, tag))}
        onImportRecorded={() => update((s) => importRecordedTags(s, line.id).state)}
        onNextLine={nextIncomplete ? () => setView({ kind: 'scan', lineId: nextIncomplete.id }) : null}
        onBack={() => setView({ kind: 'pick' })}
      />
    )
  }

  if (view.kind === 'scan-any') {
    return (
      <ScanAnySheet
        order={order}
        onAssign={assignScan}
        onFacts={(facts, mode) => update((s) => mergeFacts(s, facts, mode))}
        onOpenLine={(lineId) => setView({ kind: 'scan', lineId })}
        onReview={() => setView({ kind: 'review' })}
        onBack={() => setView({ kind: 'pick' })}
      />
    )
  }

  if (view.kind === 'review') {
    return (
      <ReviewScreen
        order={order}
        transporter={transporter}
        licenses={licenses}
        email={email}
        onHeader={(h: Partial<DestinationHeader>) => update((s) => ({ ...s, header: { ...s.header, ...h } }))}
        onLicenseForType={(pt, lic) => update((s) => ({ ...s, licenseByProductType: { ...s.licenseByProductType, [pt]: lic } }))}
        onLineTotal={(id, v) => update((s) => ({ ...s, lineTotals: { ...s.lineTotals, [id]: v } }))}
        onLineTotals={(totals) => update((s) => ({ ...s, lineTotals: { ...s.lineTotals, ...totals } }))}
        onInvoiceLines={(lines) => update((s) => ({ ...s, invoiceLines: { ...s.invoiceLines, ...lines } }))}
        onMetrcSnapshot={(metrc) => update((s) => ({ ...s, metrc }))}
        onTransferRecorded={(license, record) => update((s) => ({ ...s, metrcTransfers: { ...s.metrcTransfers, [license]: { ...record, submittedAt: Date.now() } } }))}
        onEmail={onEmail}
        onEditTransporter={() => setView({ kind: 'settings', from: { kind: 'review' } })}
        onBack={() => setView({ kind: 'pick' })}
      />
    )
  }

  return (
    <PickListScreen
      order={order}
      onOpenLine={(lineId) => setView({ kind: 'scan', lineId })}
      onScanAny={() => setView({ kind: 'scan-any' })}
      onReview={() => setView({ kind: 'review' })}
      onImportRecorded={() => update((s) => importRecordedTags(s).state)}
      onReset={reset}
      onSettings={() => setView({ kind: 'settings', from: { kind: 'pick' } })}
    />
  )
}
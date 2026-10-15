import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, RefreshCw, ScanSearch, Send, ShieldCheck, X } from 'lucide-react'
import { Button, Card, Notice, Pill } from './ui'
import { cachedT3Status, createTransfer, MODE_LABEL, verifyPackages } from '../lib/t3api'
import { reconcileOrder, type Check as RCheck, type Reconciliation, type Verdict } from '../lib/reconcile'
import { shortTag } from '../lib/metrc'
import type { T3PackageFacts, T3Status, T3TransferResponse } from '../../../shared/manifest/t3'
import type { MetrcSnapshot, MetrcTransferRecord, OrderState, PackageRow, TransporterProfile } from '../types'

interface Props {
  order: OrderState
  rows: PackageRow[]
  transporter: TransporterProfile
  accessCode: string
  isSample: boolean
  onMetrcSnapshot: (snapshot: MetrcSnapshot) => void
  onLicenseForType: (productType: string, license: string) => void
  onTransferRecorded: (license: string, record: Omit<MetrcTransferRecord, 'submittedAt'>) => void
}

type StatusState = { kind: 'loading' } | { kind: 'ready'; status: T3Status } | { kind: 'error'; message: string }
type CheckState = { kind: 'idle' } | { kind: 'running' } | { kind: 'error'; message: string }
type TransferState =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'validated'; result: T3TransferResponse }
  | { kind: 'submitting'; result: T3TransferResponse }
  | { kind: 'error'; message: string; tags?: string[] }

const TONE: Record<Verdict, 'green' | 'amber' | 'red' | 'gray'> = { ok: 'green', warn: 'amber', bad: 'red', unknown: 'gray' }

function VerdictIcon({ v }: { v: Verdict }) {
  if (v === 'ok') return <Check className="h-4 w-4 text-emerald-600 shrink-0" />
  if (v === 'bad') return <X className="h-4 w-4 text-red-600 shrink-0" />
  if (v === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
  return <span className="h-4 w-4 inline-block rounded-full border border-gray-300 shrink-0" />
}

function CheckLine({ label, check }: { label: string; check: RCheck }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <VerdictIcon v={check.verdict} />
      <span className="text-gray-500 w-14 shrink-0">{label}</span>
      <span className={check.verdict === 'bad' ? 'text-red-700' : check.verdict === 'warn' ? 'text-amber-700' : 'text-gray-700'}>{check.text}</span>
    </div>
  )
}

function describeFacts(f: T3PackageFacts): string {
  const parts = [f.itemName, f.quantity != null ? `${f.quantity} ${f.unit ?? ''}`.trim() : null, f.locationName].filter(Boolean)
  return parts.join(' · ')
}

export function MetrcCard({ order, rows, transporter, accessCode, isSample, onMetrcSnapshot, onLicenseForType, onTransferRecorded }: Props) {
  const [status, setStatus] = useState<StatusState>({ kind: 'loading' })
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })
  const [showAll, setShowAll] = useState(false)
  const [transfers, setTransfers] = useState<Record<string, TransferState>>({})

  const loadStatus = (force = false) => {
    setStatus({ kind: 'loading' })
    void cachedT3Status(accessCode, force).then((r) => setStatus(r.ok ? { kind: 'ready', status: r.data } : { kind: 'error', message: r.message }))
  }
  useEffect(() => {
    let cancelled = false
    void cachedT3Status(accessCode).then((r) => {
      if (!cancelled) setStatus(r.ok ? { kind: 'ready', status: r.data } : { kind: 'error', message: r.message })
    })
    return () => {
      cancelled = true
    }
  }, [accessCode])

  const t3 = status.kind === 'ready' ? status.status : null
  const connected = Boolean(t3?.configured && t3.connected)
  const writesAllowed = t3?.mode === 'live' || t3?.mode === 'sandbox'

  const recon: Reconciliation = useMemo(() => reconcileOrder(order), [order])
  const licenses = useMemo(() => Array.from(new Set(rows.map((r) => r.originLicense).filter(Boolean))).sort(), [rows])
  const scannedTags = useMemo(() => Array.from(new Set(rows.map((r) => r.tag))), [rows])
  const snapshotStale = order.metrc ? scannedTags.some((t) => !order.metrc?.byTag[t]) : scannedTags.length > 0

  const runCheck = async () => {
    if (!connected || rows.length === 0) return
    setCheck({ kind: 'running' })
    const byTag: Record<string, T3PackageFacts> = {}
    let mode = t3?.mode ?? 'read-only'
    for (const license of licenses) {
      const tags = rows.filter((r) => r.originLicense === license).map((r) => r.tag)
      const r = await verifyPackages(accessCode, { licenseNumber: license, tags, otherLicenses: licenses.filter((l) => l !== license) })
      if (!r.ok) {
        setCheck({ kind: 'error', message: `${license}: ${r.message}` })
        return
      }
      mode = r.data.mode
      for (const f of r.data.results) byTag[f.tag] = f
    }
    onMetrcSnapshot({ checkedAt: Date.now(), mode, byTag })
    setCheck({ kind: 'idle' })
  }

  const setTransfer = (license: string, s: TransferState) => setTransfers((p) => ({ ...p, [license]: s }))

  const packagesFor = (license: string) =>
    rows.filter((r) => r.originLicense === license).map((r) => ({ tag: r.tag, grossWeightG: r.grossWeightG, wholesalePrice: r.wholesalePrice }))

  const validate = async (license: string) => {
    setTransfer(license, { kind: 'validating' })
    const r = await createTransfer(accessCode, { licenseNumber: license, header: order.header, transporter, packages: packagesFor(license), submit: false })
    setTransfer(license, r.ok ? { kind: 'validated', result: r.data } : { kind: 'error', message: r.message, tags: r.tags })
  }

  const submit = async (license: string, validated: T3TransferResponse) => {
    const n = validated.resolved.packageCount
    const where = t3?.mode === 'sandbox' ? 'the Metrc SANDBOX' : 'Metrc'
    if (!window.confirm(`Create this transfer in ${where}?\n\n${n} packages from ${license} → ${validated.resolved.recipient.facilityName} (${validated.resolved.recipient.licenseNumber})\n${validated.resolved.transferType.name}\n\nThis is the real thing: Metrc will issue a manifest.`)) return
    setTransfer(license, { kind: 'submitting', result: validated })
    const r = await createTransfer(accessCode, { licenseNumber: license, header: order.header, transporter, packages: packagesFor(license), submit: true })
    if (!r.ok) {
      setTransfer(license, { kind: 'error', message: r.message, tags: r.tags })
      return
    }
    onTransferRecorded(license, { manifestNumber: r.data.manifestNumber, transferId: r.data.transferId, mode: r.data.mode })
    setTransfer(license, { kind: 'validated', result: r.data })
  }

  const linesWithIssues = recon.lines.filter((l) => l.issues.length || l.packages.some((p) => p.issues.length))

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-subhead flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-gray-500" /> Metrc check
          </h2>
          <p className="text-xs text-gray-500">Compares what Metrc says is in each scanned case with the Apex pick list and invoice.</p>
        </div>
        {t3 && (
          <Pill tone={!t3.configured ? 'gray' : !t3.connected ? 'red' : t3.mode === 'live' ? 'green' : 'blue'}>
            {!t3.configured ? 'Not set up' : !t3.connected ? 'Offline' : MODE_LABEL[t3.mode]}
          </Pill>
        )}
      </div>

      {status.kind === 'loading' && (
        <p className="text-xs text-gray-400 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking T3 connection…
        </p>
      )}
      {status.kind === 'error' && (
        <Notice tone="amber">
          {status.message}
          {!accessCode && ' Add the access code under Settings → Email export.'}
        </Notice>
      )}
      {t3 && !t3.configured && (
        <Notice tone="blue">
          <p className="font-bold">Metrc lookups are not enabled on this server.</p>
          <p className="text-xs mt-1">Whoever runs the deploy sets T3_API_KEY (a Track & Trace Tools secret key). Until then, export the .t3csv files below as usual.</p>
        </Notice>
      )}
      {t3?.configured && !t3.connected && <Notice tone="red">{t3.error ?? 'T3 is configured but not responding.'}</Notice>}
      {t3?.connected && (
        <p className="text-xs text-gray-500">
          Signed in to {t3.hostname} as {t3.username}
          {t3.hasT3plus === false && <span className="text-amber-700"> · no T3+ subscription (Metrc data endpoints will fail)</span>}
          {t3.mode === 'read-only' && ' · read-only: transfers can be validated, not submitted'}
          {t3.mode === 'sandbox' && ' · sandbox: nothing here touches production Metrc'}
        </p>
      )}

      <Button block variant={snapshotStale ? 'primary' : 'secondary'} disabled={!connected || rows.length === 0 || check.kind === 'running'} onClick={runCheck}>
        {check.kind === 'running' ? <Loader2 className="h-5 w-5 animate-spin" /> : snapshotStale ? <ScanSearch className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
        {check.kind === 'running' ? 'Asking Metrc…' : order.metrc && !snapshotStale ? 'Re-check packages in Metrc' : `Check ${scannedTags.length} package${scannedTags.length === 1 ? '' : 's'} in Metrc`}
      </Button>
      {check.kind === 'error' && <Notice tone="red">{check.message}</Notice>}
      {order.metrc && snapshotStale && check.kind !== 'running' && <Notice tone="amber">New scans since the last Metrc check. Run it again before creating the transfer.</Notice>}

      {order.metrc && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">
              {recon.allClear ? 'All packages match Apex' : `${recon.packagesClean} of ${recon.packagesChecked} packages match`}
              {recon.bad > 0 && <span className="text-red-700"> · {recon.bad} problem{recon.bad === 1 ? '' : 's'}</span>}
              {recon.warn > 0 && <span className="text-amber-700"> · {recon.warn} to look at</span>}
            </p>
            <span className="text-micro text-gray-400">{new Date(order.metrc.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>

          {Object.entries(recon.licenseFixes).map(([productType, license]) => (
            <Notice key={productType} tone="amber">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs">
                  Metrc has the {productType} cases on <span className="font-mono">{license}</span>.
                </span>
                <button type="button" className="text-xs font-bold text-emerald-700 whitespace-nowrap" onClick={() => onLicenseForType(productType, license)}>
                  Use {license}
                </button>
              </div>
            </Notice>
          ))}

          {linesWithIssues.map((l) => (
            <div key={l.line.id} className="rounded-xl border border-gray-200 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <VerdictIcon v={l.worst} />
                <p className="text-sm font-bold text-gray-900 truncate">{l.line.productName}</p>
              </div>
              {l.issues.map((i) => (
                <p key={i} className="text-xs text-amber-700 pl-6">
                  {i}
                </p>
              ))}
              {l.packages
                .filter((p) => p.issues.length)
                .map((p) => (
                  <div key={p.tag} className="pl-6 space-y-0.5">
                    <p className="font-mono text-xs text-gray-700 tabular-nums">{shortTag(p.tag, 10)}</p>
                    {p.issues.map((i) => (
                      <p key={i} className={`text-xs ${p.worst === 'bad' ? 'text-red-700' : 'text-amber-700'}`}>
                        {i}
                      </p>
                    ))}
                  </div>
                ))}
            </div>
          ))}

          <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full flex items-center justify-between text-xs font-bold text-gray-600 py-1">
            {showAll ? 'Hide' : 'Show'} every package
            {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showAll &&
            recon.lines.map((l) => (
              <div key={l.line.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Pill tone={TONE[l.worst]}>{l.worst === 'ok' ? 'OK' : l.worst === 'unknown' ? 'Unchecked' : l.worst === 'warn' ? 'Check' : 'Problem'}</Pill>
                  <p className="text-xs font-bold text-gray-800 truncate">{l.line.productName}</p>
                </div>
                <div className="pl-1 space-y-0.5">
                  <CheckLine label="Cases" check={l.count} />
                  <CheckLine label="Units" check={l.units} />
                  <CheckLine label="Invoice" check={l.invoice} />
                </div>
                {l.packages.map((p) => (
                  <div key={p.tag} className="rounded-lg bg-gray-50 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs text-gray-800 tabular-nums">{shortTag(p.tag, 10)}</p>
                      {p.facts && <p className="text-xs text-gray-500 truncate">{describeFacts(p.facts)}</p>}
                    </div>
                    {p.facts ? (
                      <>
                        <CheckLine label="Status" check={p.eligibility} />
                        <CheckLine label="Product" check={p.product} />
                        <CheckLine label="Lot" check={p.lot} />
                        <CheckLine label="Qty" check={p.quantity} />
                        <CheckLine label="Lab" check={p.lab} />
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Not checked yet</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {connected && rows.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Create the transfer from here</h3>
            <p className="text-xs text-gray-500">
              One Metrc transfer per origin licence. Validate first: T3 loads the real Metrc form and checks every id without saving anything.
              {!writesAllowed && ' Submitting is off on this deploy (read-only).'}
            </p>
          </div>
          {isSample && <Notice tone="amber">Sample order: validation will report these cases as already shipped. Submitting is disabled.</Notice>}
          {licenses.map((license) => {
            const st = transfers[license] ?? { kind: 'idle' }
            const done = order.metrcTransfers?.[license]
            const n = rows.filter((r) => r.originLicense === license).length
            return (
              <div key={license} className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">
                    From {license} <span className="font-normal text-gray-500">· {n} packages</span>
                  </p>
                  {done && <Pill tone="green">Submitted</Pill>}
                </div>
                {done && (
                  <Notice tone="green">
                    <p className="font-bold">{done.manifestNumber ? `Manifest ${done.manifestNumber}` : 'Transfer created'}</p>
                    <p className="text-xs">
                      {new Date(done.submittedAt).toLocaleString()} · {MODE_LABEL[done.mode]}
                      {!done.manifestNumber && ' · manifest number not visible yet; see Metrc → Transfers → Outgoing'}
                    </p>
                  </Notice>
                )}
                {st.kind === 'error' && (
                  <Notice tone="red">
                    {st.message}
                    {st.tags?.length ? <p className="font-mono text-xs mt-1">{st.tags.slice(0, 4).map((t) => shortTag(t, 10)).join(', ')}{st.tags.length > 4 ? ` +${st.tags.length - 4}` : ''}</p> : null}
                  </Notice>
                )}
                {(st.kind === 'validated' || st.kind === 'submitting') && (
                  <Notice tone={st.result.submitted ? 'green' : 'blue'}>
                    <p className="font-bold">{st.result.submitted ? 'Metrc accepted it' : 'Metrc would accept this'}</p>
                    <p className="text-xs mt-1">
                      {st.result.resolved.packageCount} packages → {st.result.resolved.recipient.facilityName} ({st.result.resolved.recipient.licenseNumber}) · {st.result.resolved.transferType.name}
                      <br />
                      Transporter {st.result.resolved.transporter.facilityName} ({st.result.resolved.transporter.licenseNumber})
                      {st.result.resolved.totalGrossG > 0 && ` · ${st.result.resolved.totalGrossG} g`}
                      {st.result.resolved.totalWholesale > 0 && ` · $${st.result.resolved.totalWholesale.toFixed(2)}`}
                    </p>
                    {st.result.warnings.map((w) => (
                      <p key={w} className="text-xs mt-1 text-amber-700">
                        {w}
                      </p>
                    ))}
                  </Notice>
                )}
                <div className="flex gap-2">
                  <Button block variant="secondary" disabled={st.kind === 'validating' || st.kind === 'submitting' || !!done} onClick={() => validate(license)}>
                    {st.kind === 'validating' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                    {st.kind === 'validating' ? 'Validating…' : st.kind === 'validated' ? 'Validate again' : 'Validate in Metrc'}
                  </Button>
                  {writesAllowed && (
                    <Button
                      block
                      disabled={st.kind !== 'validated' || st.result.submitted || isSample || !!done || snapshotStale}
                      onClick={() => st.kind === 'validated' && submit(license, st.result)}
                    >
                      {st.kind === 'submitting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      {st.kind === 'submitting' ? 'Submitting…' : t3?.mode === 'sandbox' ? 'Submit to sandbox' : 'Submit to Metrc'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {status.kind === 'ready' && (
        <button type="button" onClick={() => loadStatus(true)} className="text-xs text-gray-400 flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Refresh connection
        </button>
      )}
    </Card>
  )
}

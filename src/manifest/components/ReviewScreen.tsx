import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Share2, Copy, Check, ChevronDown, ChevronUp, Truck, Mail, Loader2, FileText } from 'lucide-react'
import { Button, Card, Field, Input, Notice, Pill, Screen, Select, TopBar } from './ui'
import { buildPackageRows, summarize, TRANSFER_TYPES } from '../lib/order'
import { buildT3Files, formatMoney } from '../lib/t3csv'
import { copyText, saveTextFile } from '../lib/download'
import { EMAIL_RE, sendManifestEmail } from '../lib/email'
import { INVOICE_ACCEPT, parseInvoiceFile } from '../lib/invoice'
import { assignmentsToLineTotals, matchInvoiceLines, type MatchResult, type ParsedInvoice } from '../lib/invoiceMatch'
import { shortTag } from '../lib/metrc'
import type { EmailSettings, LicenseDefaults } from '../lib/storage'
import type { DestinationHeader, OrderState, TransporterProfile } from '../types'

interface Props {
  order: OrderState
  transporter: TransporterProfile
  licenses: LicenseDefaults
  email: EmailSettings
  onHeader: (h: Partial<DestinationHeader>) => void
  onLicenseForType: (productType: string, license: string) => void
  onLineTotal: (lineId: string, value: string) => void
  /** Bulk-apply totals (from an invoice); keeps existing values for lines not in the map. */
  onLineTotals: (totals: Record<string, string>) => void
  onEmail: (e: Partial<EmailSettings>) => void
  onEditTransporter: () => void
  onBack: () => void
}

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; to: string } | { kind: 'error'; message: string }
type InvoiceState = { kind: 'idle' } | { kind: 'reading' } | { kind: 'done'; invoice: ParsedInvoice; result: MatchResult } | { kind: 'error'; message: string }

export function ReviewScreen({ order, transporter, licenses, email, onHeader, onLicenseForType, onLineTotal, onLineTotals, onEmail, onEditTransporter, onBack }: Props) {
  const summary = summarize(order)
  const rows = useMemo(() => buildPackageRows(order), [order])
  const first = order.lines[0]
  const files = useMemo(
    () => buildT3Files(rows, order.header, transporter, first?.orderNumber ?? 'order'),
    [rows, order.header, transporter, first],
  )
  const [pricesOpen, setPricesOpen] = useState(false)
  const [status, setStatus] = useState<Record<string, string>>({})

  const productTypes = Object.keys(order.licenseByProductType)
  const missingTransporterFields = [
    [transporter.transporterLicense, 'transporter license'],
    [transporter.driverName, 'driver name'],
    [transporter.licensePlate, 'license plate'],
  ]
    .filter(([value]) => !value)
    .map(([, label]) => label)
  const transporterMissing = missingTransporterFields.length > 0
  const missingWeight = rows.filter((r) => r.grossWeightG === null).length
  const missingPrice = rows.filter((r) => r.wholesalePrice === null).length
  const isWholesale = order.header.transferType === 'Unaffiliated Transfer'

  const flag = (key: string, text: string) => {
    setStatus((s) => ({ ...s, [key]: text }))
    setTimeout(() => setStatus((s) => ({ ...s, [key]: '' })), 2000)
  }

  const [invoice, setInvoice] = useState<InvoiceState>({ kind: 'idle' })
  const invoiceFileRef = useRef<HTMLInputElement>(null)

  const onInvoiceFile = async (file: File | undefined) => {
    if (invoiceFileRef.current) invoiceFileRef.current.value = ''
    if (!file) return
    setInvoice({ kind: 'reading' })
    const r = await parseInvoiceFile(file, email.accessCode)
    if (!r.ok) {
      setInvoice({ kind: 'error', message: r.message })
      return
    }
    if (r.invoice.lines.length === 0) {
      setInvoice({ kind: 'error', message: r.invoice.notes ? `No line items found: ${r.invoice.notes}` : 'No line items found on that document.' })
      return
    }
    const result = matchInvoiceLines(order.lines, r.invoice.lines)
    onLineTotals(assignmentsToLineTotals(result.assignments))
    if (!order.header.invoiceNumber && r.invoice.invoiceNumber) onHeader({ invoiceNumber: r.invoice.invoiceNumber })
    setInvoice({ kind: 'done', invoice: r.invoice, result })
    setPricesOpen(true)
  }

  const [send, setSend] = useState<SendState>({ kind: 'idle' })
  const emailValid = EMAIL_RE.test(email.to.trim())
  const orderLabel = first?.orderNumber ?? 'order'

  const sendEmail = async () => {
    if (!emailValid || files.length === 0) return
    setSend({ kind: 'sending' })
    const note = [
      `Metrc transfer files for ${orderLabel}${first ? ` → ${first.buyer} (${order.header.recipientLicense})` : ''}.`,
      `${rows.length} packages across ${files.length} origin license${files.length === 1 ? '' : 's'}:`,
      ...files.map((f) => `  ${f.originLicense}: ${f.packageCount} packages${f.totalGrossG ? `, ${f.totalGrossG} g` : ''}${f.totalWholesale > 0 ? `, $${formatMoney(f.totalWholesale)}` : ''}`),
      summary.issues.length > 0 ? `Note: pick list not fully scanned (${summary.issues.length} issue${summary.issues.length === 1 ? '' : 's'}).` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const r = await sendManifestEmail({
      to: email.to.trim(),
      accessCode: email.accessCode,
      subject: `${orderLabel} transfer files (${files.map((f) => f.originLicense).join(', ')})`,
      note,
      files,
    })
    setSend(r.ok ? { kind: 'sent', to: r.to } : { kind: 'error', message: r.message })
  }

  return (
    <Screen
      footer={
        <>
          <Button variant="secondary" onClick={onBack} className="px-4">
            Back
          </Button>
          <Button
            block
            disabled={rows.length === 0}
            onClick={async () => {
              for (const f of files) await saveTextFile(f.filename, f.content)
              flag('all', 'Saved')
            }}
          >
            <Share2 className="h-5 w-5" />
            {status.all || `Export ${files.length} file${files.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <TopBar title="Review & export" subtitle={`${rows.length} packages · ${files.length} transfer${files.length === 1 ? '' : 's'}`} onBack={onBack} />

      {summary.issues.length > 0 && (
        <Notice tone="amber">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-bold">Pick list not fully scanned</p>
              {summary.issues.slice(0, 5).map((i) => (
                <p key={i} className="text-xs">
                  {i}
                </p>
              ))}
              {summary.issues.length > 5 && <p className="text-xs">…and {summary.issues.length - 5} more</p>}
            </div>
          </div>
        </Notice>
      )}

      <Card className="p-4 space-y-3">
        <h2 className="text-subhead">Destination</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recipient license">
            <Input value={order.header.recipientLicense} onChange={(e) => onHeader({ recipientLicense: e.target.value.toUpperCase() })} autoCapitalize="characters" />
          </Field>
          <Field label="Invoice #">
            <Input value={order.header.invoiceNumber} onChange={(e) => onHeader({ invoiceNumber: e.target.value })} inputMode="numeric" />
          </Field>
          <Field label="Delivery date">
            <Input type="date" value={order.header.deliveryDate} onChange={(e) => onHeader({ deliveryDate: e.target.value })} />
          </Field>
          <Field label="Payment terms (days)">
            <Input value={order.header.paymentTermDays} onChange={(e) => onHeader({ paymentTermDays: e.target.value })} inputMode="numeric" />
          </Field>
        </div>
        <Field label="Transfer type">
          <Select value={order.header.transferType} onChange={(e) => onHeader({ transferType: e.target.value })}>
            {TRANSFER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Planned route">
          <Input value={order.header.plannedRoute} onChange={(e) => onHeader({ plannedRoute: e.target.value })} />
        </Field>
        {first && (
          <p className="text-xs text-gray-500">
            {first.buyer} · {first.buyerAddress}
          </p>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-subhead flex items-center gap-2">
            <Truck className="h-5 w-5 text-gray-500" /> Transporter
          </h2>
          <button type="button" onClick={onEditTransporter} className="text-sm font-bold text-emerald-600">
            Edit
          </button>
        </div>
        {transporterMissing ? (
          <Notice tone="amber">
            Missing {missingTransporterFields.join(', ')}. Tap Edit to fill them in once; they're saved on this device.
          </Notice>
        ) : (
          <p className="text-sm text-gray-700">
            {transporter.transporterLicense} · {transporter.driverName} · {transporter.vehicleMake} {transporter.vehicleModel} {transporter.licensePlate}
          </p>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-subhead">Origin license by product type</h2>
        <p className="text-xs text-gray-500">Metrc needs one transfer per origin license. Whole flower usually ships from cultivation; infused from manufacturing.</p>
        {productTypes.map((pt) => (
          <Field key={pt} label={pt}>
            <Select value={order.licenseByProductType[pt]} onChange={(e) => onLicenseForType(pt, e.target.value)}>
              <option value={licenses.cultivation}>{licenses.cultivation} (cultivation)</option>
              <option value={licenses.manufacturing}>{licenses.manufacturing} (manufacturing)</option>
            </Select>
          </Field>
        ))}
      </Card>

      <Card className="p-4 space-y-3">
        <button type="button" onClick={() => setPricesOpen((v) => !v)} className="w-full flex items-center justify-between">
          <div className="text-left">
            <h2 className="text-subhead">Wholesale prices</h2>
            <p className="text-xs text-gray-500">
              {isWholesale ? 'Required for unaffiliated transfers. ' : 'Optional for this transfer type. '}
              Enter each line's invoice total; it's split evenly across that line's packages.
            </p>
          </div>
          {pricesOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronUp className="h-5 w-5 text-gray-400" />}
        </button>
        {isWholesale && missingPrice > 0 && !pricesOpen && <Pill tone="amber">{missingPrice} packages without a price</Pill>}

        <input ref={invoiceFileRef} type="file" accept={INVOICE_ACCEPT} className="hidden" onChange={(e) => void onInvoiceFile(e.target.files?.[0])} />
        <Button block variant="secondary" disabled={invoice.kind === 'reading'} onClick={() => invoiceFileRef.current?.click()}>
          {invoice.kind === 'reading' ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
          {invoice.kind === 'reading' ? 'Reading invoice…' : 'Attach invoice to fill prices'}
        </Button>
        <p className="text-xs text-gray-400 -mt-1">Apex invoice PDF, a photo of it, or a CSV export. Lines are matched by product name and quantity.</p>

        {invoice.kind === 'error' && <Notice tone="red">{invoice.message}</Notice>}
        {invoice.kind === 'done' && (
          <Notice tone={invoice.result.unmatchedInvoice.length || invoice.result.unpricedLineIds.length ? 'amber' : 'green'}>
            <p className="font-bold">
              Filled {invoice.result.assignments.length} of {order.lines.length} lines
              {invoice.invoice.invoiceNumber ? ` from invoice ${invoice.invoice.invoiceNumber}` : ''}.
            </p>
            {invoice.result.assignments
              .filter((a) => a.note)
              .slice(0, 4)
              .map((a) => (
                <p key={a.lineId} className="text-xs mt-1">
                  {order.lines.find((l) => l.id === a.lineId)?.productName}: {a.note}
                </p>
              ))}
            {invoice.result.unpricedLineIds.length > 0 && (
              <p className="text-xs mt-1">
                Still blank: {invoice.result.unpricedLineIds.map((id) => order.lines.find((l) => l.id === id)?.productName).filter(Boolean).slice(0, 3).join('; ')}
                {invoice.result.unpricedLineIds.length > 3 ? ` +${invoice.result.unpricedLineIds.length - 3} more` : ''}
              </p>
            )}
            {invoice.result.unmatchedInvoice.length > 0 && (
              <p className="text-xs mt-1">
                On the invoice but not the pick list: {invoice.result.unmatchedInvoice.slice(0, 3).map((i) => i.description).join('; ')}
                {invoice.result.unmatchedInvoice.length > 3 ? ` +${invoice.result.unmatchedInvoice.length - 3} more` : ''}
              </p>
            )}
            {invoice.invoice.total !== null && (
              <p className="text-xs mt-1">
                Invoice total ${formatMoney(invoice.invoice.total)} · filled ${formatMoney(invoice.result.assignments.reduce((a, x) => a + x.total, 0))}
              </p>
            )}
          </Notice>
        )}

        {pricesOpen &&
          order.lines.map((l) => (
            <Field key={l.id} label={l.productName}>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">$</span>
                <Input
                  value={order.lineTotals[l.id] ?? ''}
                  onChange={(e) => onLineTotal(l.id, e.target.value)}
                  inputMode="decimal"
                  placeholder="Line total"
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">÷ {order.scans[l.id]?.length ?? 0}</span>
              </div>
            </Field>
          ))}
      </Card>

      {files.map((f) => (
        <Card key={f.originLicense}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-subhead">From {f.originLicense}</p>
              <p className="text-xs text-gray-500">
                {f.packageCount} packages · {f.totalGrossG ? `${f.totalGrossG} g` : 'no weights'}
                {f.totalWholesale > 0 && ` · $${formatMoney(f.totalWholesale)}`}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="secondary"
                className="px-3 min-h-10"
                onClick={async () => flag(f.originLicense, (await copyText(f.content)) ? 'Copied' : 'Copy failed')}
              >
                {status[f.originLicense] === 'Copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                variant="secondary"
                className="px-3 min-h-10"
                onClick={async () => {
                  await saveTextFile(f.filename, f.content)
                  flag(f.originLicense, 'Saved')
                }}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {rows
            .filter((r) => r.originLicense === f.originLicense)
            .map((r) => (
              <div key={r.tag} className="px-4 py-2 border-b border-gray-100 last:border-b-0 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm tabular-nums text-gray-900">{shortTag(r.tag, 10)}</p>
                  <p className="text-xs text-gray-500 truncate">{r.productName}</p>
                </div>
                <div className="text-right text-xs text-gray-600 tabular-nums whitespace-nowrap">
                  <p>{r.units} ea</p>
                  <p>
                    {r.grossWeightG !== null ? `${r.grossWeightG} g` : '— g'}
                    {r.wholesalePrice !== null ? ` · $${formatMoney(r.wholesalePrice)}` : ''}
                  </p>
                </div>
              </div>
            ))}
        </Card>
      ))}

      {missingWeight > 0 && (
        <Notice tone="amber">
          {missingWeight} package{missingWeight === 1 ? '' : 's'} have no unit weight in the product name, so gross weight is left blank. Fill it in Metrc.
        </Notice>
      )}

      <Card className="p-4 space-y-3">
        <h2 className="text-subhead flex items-center gap-2">
          <Mail className="h-5 w-5 text-gray-500" /> Email the files
        </h2>
        <p className="text-xs text-gray-500">Sends {files.length === 1 ? 'the file' : `all ${files.length} files`} as attachments to whoever creates the transfer in Metrc.</p>
        <Field label="Send to">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="name@company.com"
            value={email.to}
            onChange={(e) => {
              onEmail({ to: e.target.value })
              if (send.kind !== 'idle') setSend({ kind: 'idle' })
            }}
          />
        </Field>
        {send.kind === 'sent' && (
          <Notice tone="green">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" /> Sent to {send.to}
            </span>
          </Notice>
        )}
        {send.kind === 'error' && <Notice tone="red">{send.message}</Notice>}
        <Button block variant={send.kind === 'sent' ? 'secondary' : 'primary'} disabled={!emailValid || files.length === 0 || send.kind === 'sending'} onClick={sendEmail}>
          {send.kind === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
          {send.kind === 'sending' ? 'Sending…' : send.kind === 'sent' ? 'Send again' : `Email ${files.length} file${files.length === 1 ? '' : 's'}`}
        </Button>
        {!email.accessCode && <p className="text-xs text-gray-400">No access code set. If sending fails, add it under Settings → Email export.</p>}
      </Card>

      <p className="text-xs text-gray-400 text-center px-4">
        Open Metrc → Transfers → New Transfer, then use T3's "Autofill T3 CSV" with each file. One file per origin license.
      </p>
    </Screen>
  )
}

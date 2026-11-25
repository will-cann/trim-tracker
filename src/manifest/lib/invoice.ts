import { authHeaders } from './authToken'
import type { ParsedInvoice } from './invoiceMatch'
import { fileToDocumentBody, postDocument } from './documentUpload'

export const INVOICE_ACCEPT = '.pdf,.csv,.txt,image/*,application/pdf,text/csv,text/plain'

export type InvoiceParseResult = { ok: true; invoice: ParsedInvoice } | { ok: false; message: string }

export async function parseInvoiceFile(file: File): Promise<InvoiceParseResult> {
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const body = await fileToDocumentBody(file)
  const res = await postDocument<ParsedInvoice>('parse-invoice', headers, body, 'Invoice')
  return res.ok ? { ok: true, invoice: res.data } : res
}

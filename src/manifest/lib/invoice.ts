import type { ParsedInvoice } from './invoiceMatch'

export const INVOICE_ACCEPT = '.pdf,.csv,.txt,image/*,application/pdf,text/csv,text/plain'

const IMAGE_MAX_EDGE = 2000
const IMAGE_QUALITY = 0.85
const TEXT_TYPES = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel'])

export type InvoiceParseResult = { ok: true; invoice: ParsedInvoice } | { ok: false; message: string }

function isTextFile(file: File): boolean {
  return TEXT_TYPES.has(file.type) || /\.(csv|txt)$/i.test(file.name)
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error)
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.readAsDataURL(blob)
  })
}

/** Phone photos are 3–8 MB; the function body cap is 6 MB, so shrink before upload. */
async function downscaleImage(file: File): Promise<{ blob: Blob; mediaType: string }> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return { blob: file, mediaType: file.type }
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 2_500_000) return { blob: file, mediaType: file.type }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', IMAGE_QUALITY))
    return blob ? { blob, mediaType: 'image/jpeg' } : { blob: file, mediaType: file.type }
  } catch {
    return { blob: file, mediaType: file.type }
  }
}

export async function parseInvoiceFile(file: File, accessCode: string): Promise<InvoiceParseResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessCode) headers['x-manifest-key'] = accessCode

  let body: Record<string, string>
  if (isTextFile(file)) {
    body = { fileName: file.name, text: await file.text() }
  } else if (file.type.startsWith('image/')) {
    const { blob, mediaType } = await downscaleImage(file)
    body = { fileName: file.name, mediaType, data: await toBase64(blob) }
  } else {
    body = { fileName: file.name, mediaType: file.type || 'application/pdf', data: await toBase64(file) }
  }

  let res: Response
  try {
    res = await fetch('/.netlify/functions/parse-invoice', { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    return { ok: false, message: 'No connection. Try again when you have signal.' }
  }

  let payload: (ParsedInvoice & { error?: string }) | { error?: string } = {}
  try {
    payload = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const fallback = res.status === 404 ? 'Invoice reading is not available on this server.' : `Could not read invoice (${res.status}).`
    return { ok: false, message: payload.error ?? fallback }
  }
  return { ok: true, invoice: payload as ParsedInvoice }
}

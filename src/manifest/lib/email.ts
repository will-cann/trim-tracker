import type { T3File } from './t3csv'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface SendEmailArgs {
  to: string
  accessCode: string
  subject: string
  note: string
  files: T3File[]
}

export type SendEmailResult = { ok: true; to: string } | { ok: false; message: string }

export async function sendManifestEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (args.accessCode) headers['x-manifest-key'] = args.accessCode

  let res: Response
  try {
    res = await fetch('/.netlify/functions/send-manifest-email', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: args.to,
        subject: args.subject,
        note: args.note,
        files: args.files.map((f) => ({ filename: f.filename, content: f.content })),
      }),
    })
  } catch {
    return { ok: false, message: 'No connection. Try again when you have signal.' }
  }

  let payload: { error?: string; detail?: string; to?: string } = {}
  try {
    payload = await res.json()
  } catch {
    /* non-JSON body (e.g. 404 from the dev server) */
  }

  if (!res.ok) {
    const fallback = res.status === 404 ? 'Email endpoint not available on this server.' : `Send failed (${res.status}).`
    return { ok: false, message: payload.error ?? fallback }
  }
  return { ok: true, to: payload.to ?? args.to }
}

import type {
  T3ErrorResponse,
  T3Status,
  T3TransferRequest,
  T3TransferResponse,
  T3VerifyRequest,
  T3VerifyResponse,
} from '../../../shared/manifest/t3'

/**
 * Client for the t3-* Netlify functions. The T3 secret key never reaches the
 * browser; these calls are gated by the same access code as email export.
 */

export type T3Result<T> = { ok: true; data: T } | { ok: false; message: string; code?: string; tags?: string[]; status: number }

async function call<T>(fn: string, accessCode: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T3Result<T>> {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessCode) headers['x-manifest-key'] = accessCode

  let res: Response
  try {
    res = await fetch(`/.netlify/functions/${fn}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    return { ok: false, message: 'No connection. Try again when you have signal.', status: 0 }
  }

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    /* non-JSON body (e.g. 404 from the dev server) */
  }

  if (!res.ok) {
    const err = (payload ?? {}) as Partial<T3ErrorResponse>
    const fallback = res.status === 404 ? 'Metrc lookups are not available on this server.' : `Request failed (${res.status}).`
    return { ok: false, message: err.error ?? fallback, code: err.code, tags: err.tags, status: res.status }
  }
  return { ok: true, data: payload as T }
}

export const fetchT3Status = (accessCode: string) => call<T3Status>('t3-status', accessCode, { method: 'GET' })

export const verifyPackages = (accessCode: string, body: T3VerifyRequest) =>
  call<T3VerifyResponse>('t3-verify-packages', accessCode, { method: 'POST', body })

export const createTransfer = (accessCode: string, body: T3TransferRequest) =>
  call<T3TransferResponse>('t3-create-transfer', accessCode, { method: 'POST', body })

// ── Status cache ─────────────────────────────────────────────────────────────
// Review and Settings both show connection state; one lookup per minute is plenty.

const STATUS_TTL_MS = 60_000
let statusCache: { key: string; at: number; promise: Promise<T3Result<T3Status>> } | null = null

export function cachedT3Status(accessCode: string, force = false): Promise<T3Result<T3Status>> {
  const now = Date.now()
  if (!force && statusCache && statusCache.key === accessCode && now - statusCache.at < STATUS_TTL_MS) return statusCache.promise
  const promise = fetchT3Status(accessCode)
  statusCache = { key: accessCode, at: now, promise }
  return promise
}

export const MODE_LABEL: Record<T3Status['mode'], string> = {
  'read-only': 'Read-only',
  sandbox: 'Sandbox',
  live: 'Live',
}

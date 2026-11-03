/**
 * Wire contract for the self-serve Metrc connection
 * (netlify/functions/metrc-connection.ts) shown in Settings → Metrc.
 *
 * A connection is a company's own Track & Trace Tools (T3) secret key, stored
 * encrypted server-side. It drives both the Metrc → NeuroCann sync
 * (./metrcSync.ts) and the manifest picker's Metrc checks (./t3.ts). The key
 * itself never comes back over the wire; only its last four characters do.
 */
import type { T3License, T3Mode } from './t3'

export type MetrcConnectionSource = 'connection' | 'env'

export type MetrcConnectionState = 'active' | 'paused'

export interface MetrcConnectionDetails {
  /** Last four characters of the stored key, e.g. "…a9f2". */
  keyHint: string
  mode: T3Mode
  status: MetrcConnectionState
  /** The Metrc login the key is bound to, as T3 reported it. */
  username: string | null
  /** e.g. mo.metrc.com */
  hostname: string | null
  hasT3plus: boolean | null
  subscriptionTier: string | null
  /** 'reports' (basic tier: report endpoints only) or 'full'. */
  apiAccessLevel: string | null
  /** Licences the login could see at the last verify. */
  licenses: T3License[]
  /** null = sync every licence; otherwise the licence numbers to sync. */
  syncLicenses: string[] | null
  lastVerifiedAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  createdAt: string
  createdByName: string | null
}

export interface MetrcConnectionStatus {
  /** NeuroCann can reach Metrc for this company, by either source. */
  connected: boolean
  /** Where the credentials come from when connected. */
  source: MetrcConnectionSource | null
  /** The server holds METRC_CONNECTION_KEY, so keys can be stored here. */
  selfServeAvailable: boolean
  /**
   * The server also holds a T3 organisation registration secret, so a director
   * can connect with a plain Metrc username and password: T3 registers that
   * login under NeuroCann's T3+ organisation and mints the key for us.
   */
  metrcLoginAvailable: boolean
  /** Signed-in user is a director or admin and may connect, change or remove the key. */
  canManage: boolean
  /** Present when source is 'connection'. */
  connection: MetrcConnectionDetails | null
  /** Present when source is 'env' (a per-customer deploy configured by NeuroCann). */
  env: { mode: T3Mode } | null
}

/**
 * A Metrc login, sent once so T3 can mint a secret key bound to it. NeuroCann
 * forwards it to T3 over TLS and keeps only the resulting key; T3 stores the
 * credentials encrypted on its side (that is how every T3 secret key works).
 */
export interface MetrcLogin {
  username: string
  password: string
  /** e.g. mo.metrc.com — see ./metrcHosts.ts */
  hostname: string
  /** Colorado only: the Metrc login email. */
  email?: string
  /** Michigan only: the seed of the Metrc multi-factor authenticator. */
  otpSeed?: string
}

/** Exactly one of `apiKey` or `metrcLogin`. */
export interface MetrcConnectRequest {
  /** The T3 secret key from api.trackandtrace.tools/v2/pages/secret-key. */
  apiKey?: string
  /** Or: have T3 mint the key from a Metrc login (needs `metrcLoginAvailable`). */
  metrcLogin?: MetrcLogin
  /** Defaults to read-only. */
  mode?: T3Mode
}

export interface MetrcConnectionPatch {
  mode?: T3Mode
  status?: MetrcConnectionState
  /** null clears the restriction (sync every licence). */
  syncLicenses?: string[] | null
  /** Ask T3 who the stored key belongs to again and refresh the licence list. */
  verify?: boolean
}

/** Connect / patch responses carry the refreshed status plus anything T3 warned about. */
export interface MetrcConnectionResponse extends MetrcConnectionStatus {
  warnings: string[]
}

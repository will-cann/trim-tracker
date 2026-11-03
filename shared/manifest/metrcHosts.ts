/**
 * Metrc state hosts a login can belong to. T3 wants the hostname the person
 * types into their browser (`mo.metrc.com`), so the UI offers these by state
 * and falls back to a free-text field for anything newer.
 */
export interface MetrcHost {
  hostname: string
  state: string
}

export const METRC_HOSTS: readonly MetrcHost[] = [
  { hostname: 'ak.metrc.com', state: 'Alaska' },
  { hostname: 'ca.metrc.com', state: 'California' },
  { hostname: 'co.metrc.com', state: 'Colorado' },
  { hostname: 'dc.metrc.com', state: 'District of Columbia' },
  { hostname: 'ky.metrc.com', state: 'Kentucky' },
  { hostname: 'la.metrc.com', state: 'Louisiana' },
  { hostname: 'ma.metrc.com', state: 'Massachusetts' },
  { hostname: 'md.metrc.com', state: 'Maryland' },
  { hostname: 'me.metrc.com', state: 'Maine' },
  { hostname: 'mi.metrc.com', state: 'Michigan' },
  { hostname: 'mn.metrc.com', state: 'Minnesota' },
  { hostname: 'mo.metrc.com', state: 'Missouri' },
  { hostname: 'ms.metrc.com', state: 'Mississippi' },
  { hostname: 'mt.metrc.com', state: 'Montana' },
  { hostname: 'nj.metrc.com', state: 'New Jersey' },
  { hostname: 'nv.metrc.com', state: 'Nevada' },
  { hostname: 'oh.metrc.com', state: 'Ohio' },
  { hostname: 'ok.metrc.com', state: 'Oklahoma' },
  { hostname: 'or.metrc.com', state: 'Oregon' },
  { hostname: 'ri.metrc.com', state: 'Rhode Island' },
  { hostname: 'sd.metrc.com', state: 'South Dakota' },
  { hostname: 'wv.metrc.com', state: 'West Virginia' },
] as const

/** Same rule T3 applies to `hostname`. */
export const METRC_HOST_RE = /^([a-z0-9-]+\.)*metrc\.com$/i

export const isMetrcHost = (hostname: string) => METRC_HOST_RE.test(hostname.trim())

/** Colorado logs in with an email as well; Michigan uses a TOTP authenticator. */
export const hostNeedsEmail = (hostname: string) => hostname.trim().toLowerCase() === 'co.metrc.com'
export const hostNeedsOtpSeed = (hostname: string) => hostname.trim().toLowerCase() === 'mi.metrc.com'

export interface MetrcLoginDraft {
  username: string
  password: string
  hostname: string
  email?: string
  otpSeed?: string
}

/** The message to show before sending a login to the server, or null when it is complete. */
export function metrcLoginProblem(d: MetrcLoginDraft): string | null {
  const hostname = d.hostname.trim()
  if (!hostname) return 'Choose the Metrc state you sign in to.'
  if (!isMetrcHost(hostname)) return 'Choose the Metrc state host you sign in to (for example mo.metrc.com).'
  if (!d.username.trim() || !d.password) return 'Enter the Metrc username and password.'
  if (hostNeedsEmail(hostname) && !d.email?.trim()) return 'Colorado Metrc logins also need the login email.'
  if (hostNeedsOtpSeed(hostname) && !d.otpSeed?.replace(/\s+/g, '')) return 'Michigan Metrc logins also need the authenticator (one-time password) seed.'
  return null
}

import type { MetrcConnectionStatus } from '../../../shared/manifest/metrcConnection'
import type { T3Result } from './t3api'

/**
 * The picker is only useful against the facility's own Metrc, so a company
 * without a connection is sent to connect one before it can pick. The server
 * answers 403 to every Metrc-backed call either way; this just puts the
 * explanation and the connect form in front of the person instead of a
 * failing "Check connection" button.
 *
 * Fail open on anything that isn't a definite "not connected": offline, a
 * server that predates the connection table, a sign-in hiccup. The functions
 * still refuse what they should; the picker shouldn't block on a flaky read.
 */
export type GateDecision = { kind: 'open'; status: MetrcConnectionStatus | null } | { kind: 'connect'; status: MetrcConnectionStatus }

export function decideGate(result: T3Result<MetrcConnectionStatus>): GateDecision {
  if (!result.ok) return { kind: 'open', status: null }
  return result.data.connected ? { kind: 'open', status: result.data } : { kind: 'connect', status: result.data }
}

export const T3_SECRET_KEY_URL = 'https://api.trackandtrace.tools/v2/pages/secret-key'
export const T3_DASHBOARD_URL = 'https://dash.trackandtrace.tools'

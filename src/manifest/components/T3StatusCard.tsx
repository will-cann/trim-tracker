import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button, Card, Notice, Pill } from './ui'
import { cachedT3Status, MODE_LABEL } from '../lib/t3api'
import type { T3Status } from '../../../shared/manifest/t3'

type State = { kind: 'loading' } | { kind: 'ready'; status: T3Status } | { kind: 'error'; message: string }

const MODE_HINT: Record<T3Status['mode'], string> = {
  'read-only': 'Reads real Metrc data. Transfers can be validated against Metrc but never submitted from here.',
  sandbox: "Every call is routed to Metrc's sandbox host. Nothing touches production inventory, and sandbox data is not the real facility's.",
  live: 'Reads real Metrc data and submits real transfers when you confirm.',
}

export function T3StatusCard({ accessCode }: { accessCode: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = (force: boolean) => {
    setState({ kind: 'loading' })
    void cachedT3Status(accessCode, force).then((r) => setState(r.ok ? { kind: 'ready', status: r.data } : { kind: 'error', message: r.message }))
  }
  useEffect(() => {
    let cancelled = false
    void cachedT3Status(accessCode).then((r) => {
      if (!cancelled) setState(r.ok ? { kind: 'ready', status: r.data } : { kind: 'error', message: r.message })
    })
    return () => {
      cancelled = true
    }
  }, [accessCode])

  const s = state.kind === 'ready' ? state.status : null

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-subhead">Metrc via T3</h2>
          <p className="text-xs text-gray-500">Server-side connection to metrc.com through Track & Trace Tools. The key lives on the server, not this device.</p>
        </div>
        {s && (
          <Pill tone={!s.configured ? 'gray' : !s.connected ? 'red' : s.mode === 'live' ? 'green' : 'blue'}>
            {!s.configured ? 'Not set up' : !s.connected ? 'Offline' : MODE_LABEL[s.mode]}
          </Pill>
        )}
      </div>

      {state.kind === 'loading' && (
        <p className="text-xs text-gray-400 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking…
        </p>
      )}
      {state.kind === 'error' && (
        <Notice tone="amber">
          {state.message}
          {!accessCode && ' Enter the access code below first.'}
        </Notice>
      )}

      {s && !s.configured && (
        <Notice tone="blue">
          <p className="text-xs">
            Not configured. On the server, set <span className="font-mono">T3_API_KEY</span> to a secret key from api.trackandtrace.tools/v2/pages/secret-key and{' '}
            <span className="font-mono">T3_MODE</span> to read-only, sandbox or live.
          </p>
        </Notice>
      )}
      {s?.configured && !s.connected && <Notice tone="red">{s.error ?? 'T3 is configured but not responding.'}</Notice>}

      {s?.connected && (
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-bold">{s.username}</span> on <span className="font-mono">{s.hostname}</span>
          </p>
          <p className="text-xs text-gray-500">
            T3+ {s.hasT3plus ? `active${s.subscriptionTier ? ` (${s.subscriptionTier})` : ''}` : 'missing'}
            {s.subscriptionStatus && s.subscriptionStatus !== 'active' ? ` · subscription ${s.subscriptionStatus}` : ''}
          </p>
          <p className="text-xs text-gray-500">{MODE_HINT[s.mode]}</p>
          {s.error && <Notice tone="amber">{s.error}</Notice>}
          {s.licenses && s.licenses.length > 0 && (
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {s.licenses.map((l) => (
                <div key={l.licenseNumber} className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-gray-900">{l.licenseNumber}</p>
                    <p className="text-xs text-gray-500 truncate">{l.licenseName}</p>
                  </div>
                  <Pill tone={l.canCreateTransfer === true ? 'green' : l.canCreateTransfer === false ? 'gray' : 'gray'}>
                    {l.canCreateTransfer === true ? 'can create transfers' : l.canCreateTransfer === false ? 'view only' : 'permissions unknown'}
                  </Pill>
                </div>
              ))}
            </div>
          )}
          {s.licenses && s.licenses.length === 0 && <Notice tone="amber">This Metrc login sees no licences.</Notice>}
        </div>
      )}

      <Button block variant="secondary" disabled={state.kind === 'loading'} onClick={() => load(true)}>
        <RefreshCw className="h-5 w-5" /> Check connection
      </Button>
    </Card>
  )
}

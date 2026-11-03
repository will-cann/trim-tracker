import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, ExternalLink, KeyRound, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { Button, Card, Field, Input, Notice, Select } from './ui'
import { DEPLOY_NAME, useManifestAuth } from '../lib/authContext'
import { decideGate, T3_DASHBOARD_URL, T3_SECRET_KEY_URL, type GateDecision } from '../lib/connectionGate'
import { connectMetrc, fetchMetrcConnection } from '../lib/t3api'
import type { MetrcConnectionStatus } from '../../../shared/manifest/metrcConnection'
import type { T3Mode } from '../../../shared/manifest/t3'

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

type State = { kind: 'checking' } | GateDecision

/**
 * Sits between sign-in and the picker. A company that can't reach Metrc
 * (no T3 key of its own and not allowlisted for a deploy key) sees how to
 * connect — and a director can paste the key right here, on the tablet,
 * without leaving for the main app's Settings.
 */
export function ConnectMetrcGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(DEV_BYPASS ? { kind: 'open', status: null } : { kind: 'checking' })

  const check = () => {
    setState({ kind: 'checking' })
    void fetchMetrcConnection().then((r) => setState(decideGate(r)))
  }

  useEffect(() => {
    if (DEV_BYPASS) return
    let cancelled = false
    void fetchMetrcConnection().then((r) => {
      if (!cancelled) setState(decideGate(r))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'open') return <>{children}</>

  return (
    <div className="min-h-dvh bg-gray-100 flex items-start sm:items-center justify-center px-4 py-6">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="text-center">
          <img src="/logo.png" alt="" className="h-12 w-12 mx-auto" />
          <h1 className="text-xl font-black text-gray-900 mt-2">Manifest Picker</h1>
          {DEPLOY_NAME && <p className="text-xs text-gray-500 mt-1">{DEPLOY_NAME}</p>}
        </div>
        {state.kind === 'checking' ? (
          <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your Metrc connection…
          </p>
        ) : (
          <ConnectPanel status={state.status} onRecheck={check} onConnected={(status) => setState({ kind: 'open', status })} />
        )}
      </Card>
    </div>
  )
}

function ConnectPanel({ status, onRecheck, onConnected }: { status: MetrcConnectionStatus; onRecheck: () => void; onConnected: (s: MetrcConnectionStatus) => void }) {
  const auth = useManifestAuth()
  const [apiKey, setApiKey] = useState('')
  const [mode, setMode] = useState<T3Mode>('read-only')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ status: MetrcConnectionStatus; warnings: string[] } | null>(null)

  const submit = async () => {
    const key = apiKey.trim()
    if (key.length < 16 || /\s/.test(key)) {
      setError('Paste the whole T3 secret key: one long string, no spaces.')
      return
    }
    setBusy(true)
    setError(null)
    const r = await connectMetrc({ apiKey: key, mode })
    setBusy(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setApiKey('')
    setDone({ status: r.data, warnings: r.data.warnings })
  }

  if (done) {
    const c = done.status.connection
    return (
      <div className="space-y-3">
        <Notice tone="green">
          <p className="font-bold flex items-center gap-2">
            <Check className="h-4 w-4" /> Metrc is connected
          </p>
          {c && (
            <p className="text-xs mt-1">
              {c.username ? `${c.username} on ${c.hostname ?? 'Metrc'}` : 'Key accepted'} · {c.licenses.length} licence{c.licenses.length === 1 ? '' : 's'} · {c.mode}
            </p>
          )}
        </Notice>
        {done.warnings.map((w) => (
          <Notice key={w} tone="amber">
            {w}
          </Notice>
        ))}
        <Button block onClick={() => onConnected(done.status)}>
          Start picking <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-subhead flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-emerald-600" /> Connect your Metrc first
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          The picker checks every case you scan against your facility's Metrc, through Track &amp; Trace Tools (T3). Your company isn't connected yet. It takes one key, once; it's stored encrypted on the server and never on this device.
        </p>
      </div>

      <ol className="space-y-2 text-sm text-gray-700">
        <li className="flex gap-2">
          <span className="font-bold text-gray-400 w-4 shrink-0">1</span>
          <span>
            Sign in to{' '}
            <a href={T3_DASHBOARD_URL} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 inline-flex items-center gap-1">
              T3 <ExternalLink className="h-3 w-3" />
            </a>{' '}
            with your <span className="font-bold">Metrc</span> username and password and make sure T3+ is active.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-bold text-gray-400 w-4 shrink-0">2</span>
          <span>
            Open{' '}
            <a href={T3_SECRET_KEY_URL} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 inline-flex items-center gap-1">
              Secret key <ExternalLink className="h-3 w-3" />
            </a>{' '}
            and generate one. It's tied to that Metrc login; changing the Metrc password invalidates it.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-bold text-gray-400 w-4 shrink-0">3</span>
          <span>Paste it below.</span>
        </li>
      </ol>

      {status.canManage ? (
        status.selfServeAvailable ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <Field label="T3 secret key">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the key"
                className="font-mono"
              />
            </Field>
            <Field label="What this picker may do in Metrc" hint="Read-only still validates transfers against Metrc; nothing is submitted. Switch to live later from Settings → Metrc in NeuroCann.">
              <Select value={mode} onChange={(e) => setMode(e.target.value as T3Mode)}>
                <option value="read-only">Read-only (recommended to start)</option>
                <option value="live">Live: create real transfers</option>
              </Select>
            </Field>
            {error && <Notice tone="red">{error}</Notice>}
            <Button block type="submit" disabled={busy || !apiKey.trim()}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
              {busy ? 'Checking the key with T3…' : 'Connect Metrc'}
            </Button>
          </form>
        ) : (
          <Notice tone="amber">This server can't store Metrc keys yet (METRC_CONNECTION_KEY is unset). Ask NeuroCann to enable self-serve connections.</Notice>
        )
      ) : (
        <Notice tone="blue">
          Only a director or admin can connect Metrc. Ask one to sign in here or in NeuroCann → Settings → Metrc, then check again.
        </Notice>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={onRecheck} className="text-sm font-bold text-gray-600 inline-flex items-center gap-1">
          <RefreshCw className="h-4 w-4" /> Check again
        </button>
        <button type="button" onClick={auth.logout} className="text-sm text-gray-500 inline-flex items-center gap-1">
          <LogOut className="h-4 w-4" /> {auth.email ? `Not ${auth.email}?` : 'Sign out'}
        </button>
      </div>
    </div>
  )
}

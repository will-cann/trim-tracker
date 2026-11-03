import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, ExternalLink, KeyRound, Loader2, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { Button, Card, Field, Input, Notice, Select } from './ui'
import { DEPLOY_NAME, useManifestAuth } from '../lib/authContext'
import { decideGate, T3_DASHBOARD_URL, T3_SECRET_KEY_URL, type GateDecision } from '../lib/connectionGate'
import { connectMetrc, fetchMetrcConnection } from '../lib/t3api'
import type { MetrcConnectionStatus, MetrcConnectRequest } from '../../../shared/manifest/metrcConnection'
import type { T3Mode } from '../../../shared/manifest/t3'
import { hostNeedsEmail, hostNeedsOtpSeed, METRC_HOSTS, metrcLoginProblem } from '../../../shared/manifest/metrcHosts'

type State = { kind: 'checking' } | GateDecision

/**
 * Sits between sign-in and the picker. A company that can't reach Metrc
 * (no T3 key of its own and not allowlisted for a deploy key) sees how to
 * connect — and a director can do it right here, on the tablet, without
 * leaving for the main app's Settings. Two ways in: their Metrc username and
 * password (T3 mints the key for us; the default when the server has a T3
 * organisation secret) or a T3 secret key they generated themselves.
 */
export function ConnectMetrcGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'checking' })

  const check = () => {
    setState({ kind: 'checking' })
    void fetchMetrcConnection().then((r) => setState(decideGate(r)))
  }

  useEffect(() => {
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

type Method = 'login' | 'key'

const OTHER_HOST = '__other__'

function ConnectPanel({ status, onRecheck, onConnected }: { status: MetrcConnectionStatus; onRecheck: () => void; onConnected: (s: MetrcConnectionStatus) => void }) {
  const auth = useManifestAuth()
  const [method, setMethod] = useState<Method>(status.metrcLoginAvailable ? 'login' : 'key')
  const [apiKey, setApiKey] = useState('')
  const [hostChoice, setHostChoice] = useState('')
  const [customHost, setCustomHost] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [otpSeed, setOtpSeed] = useState('')
  const [mode, setMode] = useState<T3Mode>('read-only')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ status: MetrcConnectionStatus; warnings: string[] } | null>(null)

  const hostname = hostChoice === OTHER_HOST ? customHost.trim().toLowerCase() : hostChoice
  const loginDraft = { username, password, hostname, email, otpSeed }
  const loginProblem = metrcLoginProblem(loginDraft)
  const keyTrimmed = apiKey.trim()
  const keyProblem = keyTrimmed.length < 16 || /\s/.test(keyTrimmed) ? 'Paste the whole T3 secret key: one long string, no spaces.' : null
  const canSubmit = method === 'login' ? !loginProblem : !keyProblem

  const submit = async () => {
    const problem = method === 'login' ? loginProblem : keyProblem
    if (problem) {
      setError(problem)
      return
    }
    const body: MetrcConnectRequest =
      method === 'login'
        ? {
            metrcLogin: {
              username: username.trim(),
              password,
              hostname,
              ...(hostNeedsEmail(hostname) ? { email: email.trim() } : {}),
              ...(hostNeedsOtpSeed(hostname) ? { otpSeed: otpSeed.replace(/\s+/g, '') } : {}),
            },
            mode,
          }
        : { apiKey: keyTrimmed, mode }
    setBusy(true)
    setError(null)
    const r = await connectMetrc(body)
    setBusy(false)
    // Whatever happened, the password does not stay in memory longer than the request.
    setPassword('')
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

  const showEmail = hostNeedsEmail(hostname)
  const showOtp = hostNeedsOtpSeed(hostname)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-subhead flex items-center gap-2">
          {method === 'login' ? <LogIn className="h-5 w-5 text-emerald-600" /> : <KeyRound className="h-5 w-5 text-emerald-600" />} Connect your Metrc first
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          The picker checks every case you scan against your facility's Metrc, through Track &amp; Trace Tools (T3). Your company isn't connected yet.{' '}
          {method === 'login'
            ? 'Sign in with your Metrc login once; T3 turns it into a key, which is stored encrypted on the server and never on this device.'
            : "It takes one key, once; it's stored encrypted on the server and never on this device."}
        </p>
      </div>

      {method === 'login' ? (
        <Notice tone="blue">
          Your Metrc username and password go straight to T3 over an encrypted connection, the same as signing in at dash.trackandtrace.tools. T3 keeps them encrypted and hands NeuroCann a key; NeuroCann never stores your password. Your T3 access is covered by NeuroCann's subscription.
        </Notice>
      ) : (
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
      )}

      {status.canManage ? (
        status.selfServeAvailable ? (
          <form
            className="space-y-3"
            aria-label={method === 'login' ? 'Sign in with Metrc' : 'Connect with a T3 secret key'}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {method === 'login' ? (
              <>
                <Field label="Metrc state">
                  <Select
                    value={hostChoice}
                    onChange={(e) => {
                      setHostChoice(e.target.value)
                      setError(null)
                    }}
                  >
                    <option value="">Choose your state…</option>
                    {METRC_HOSTS.map((h) => (
                      <option key={h.hostname} value={h.hostname}>
                        {h.state} ({h.hostname})
                      </option>
                    ))}
                    <option value={OTHER_HOST}>Other Metrc host…</option>
                  </Select>
                </Field>
                {hostChoice === OTHER_HOST && (
                  <Field label="Metrc hostname">
                    <Input value={customHost} onChange={(e) => setCustomHost(e.target.value)} placeholder="xx.metrc.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="font-mono" />
                  </Field>
                )}
                <Field label="Metrc username">
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} />
                </Field>
                <Field label="Metrc password">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </Field>
                {showEmail && (
                  <Field label="Metrc login email" hint="Colorado asks for this as well.">
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="email" />
                  </Field>
                )}
                {showOtp && (
                  <Field label="Authenticator seed" hint="Michigan: the secret your authenticator app was set up with, not today's 6-digit code.">
                    <Input value={otpSeed} onChange={(e) => setOtpSeed(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} className="font-mono" />
                  </Field>
                )}
              </>
            ) : (
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
            )}
            <Field label="What this picker may do in Metrc" hint="Read-only still validates transfers against Metrc; nothing is submitted. Switch to live later from Settings → Metrc in NeuroCann.">
              <Select value={mode} onChange={(e) => setMode(e.target.value as T3Mode)}>
                <option value="read-only">Read-only (recommended to start)</option>
                <option value="live">Live: create real transfers</option>
              </Select>
            </Field>
            {error && <Notice tone="red">{error}</Notice>}
            <Button block type="submit" disabled={busy || !canSubmit}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : method === 'login' ? <LogIn className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
              {busy ? (method === 'login' ? 'Signing in to Metrc through T3…' : 'Checking the key with T3…') : method === 'login' ? 'Sign in with Metrc' : 'Connect Metrc'}
            </Button>
            {status.metrcLoginAvailable && (
              <button
                type="button"
                className="block w-full text-center text-sm font-bold text-emerald-700"
                onClick={() => {
                  setMethod(method === 'login' ? 'key' : 'login')
                  setError(null)
                }}
              >
                {method === 'login' ? 'Have a T3 secret key already? Paste it instead' : 'Sign in with your Metrc login instead'}
              </button>
            )}
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

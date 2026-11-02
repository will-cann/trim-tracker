import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Pause, Play, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { MetrcConnectionResponse, MetrcConnectionStatus } from '../../../shared/manifest/metrcConnection';
import type { T3Mode } from '../../../shared/manifest/t3';

/**
 * Settings → Metrc: connect a facility's own Track & Trace Tools (T3) key, see
 * what it is bound to, and manage it. The key is sent once and never shown
 * again; the server keeps it encrypted and only uses it for Metrc calls.
 *
 * Three shapes: not connected (how to get a key + the form), connected with a
 * stored key (the card, licences, mode, pause / re-check / replace / remove),
 * and connected by the deploy's own configuration (read-only summary).
 */

interface Props {
    status: MetrcConnectionStatus;
    /** Called with the refreshed status after any change, so the sync panel can follow. */
    onChange: (next: MetrcConnectionStatus) => void;
}

const T3_DASH = 'https://dash.trackandtrace.tools';
const T3_KEY_PAGE = 'https://api.trackandtrace.tools/v2/pages/secret-key';

const MODE_LABEL: Record<T3Mode, string> = { 'read-only': 'Read-only', sandbox: 'Sandbox', live: 'Transfers allowed' };
const MODE_HELP: Record<T3Mode, string> = {
    'read-only': 'NeuroCann reads Metrc and validates transfers, and never writes. Recommended to start.',
    sandbox: "Every call goes to Metrc's sandbox host; nothing touches production inventory.",
    live: 'The manifest picker may submit a transfer to Metrc after a director confirms it. Reads are unchanged.',
};

const ago = (iso: string | null | undefined): string => {
    if (!iso) return 'never';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
};

const fmtExact = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '');

type Tone = 'ok' | 'error' | 'warn';
const Message: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
    <div className={`sync-message ${tone === 'error' ? 'sync-message--error' : tone === 'warn' ? 'sync-message--warn' : 'sync-message--ok'}`} role={tone === 'error' ? 'alert' : 'status'}>
        {children}
    </div>
);

export const MetrcConnectionSection: React.FC<Props> = ({ status, onChange }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [replacing, setReplacing] = useState(false);

    const apply = (res: MetrcConnectionResponse, okText?: string) => {
        const { warnings: w, ...next } = res;
        setWarnings(w);
        onChange(next);
        if (okText) setMessage({ tone: 'ok', text: okText });
    };

    const run = async (label: string, action: () => Promise<MetrcConnectionResponse>, okText?: string) => {
        setBusy(label);
        setMessage(null);
        try {
            apply(await action(), okText);
            return true;
        } catch (err) {
            setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
            return false;
        } finally {
            setBusy(null);
        }
    };

    const conn = status.connection;

    return (
        <div className="metrc-connection">
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Metrc</h3>
                    <p className="settings-section-desc">
                        Connect your Metrc license through Track &amp; Trace Tools (T3). NeuroCann mirrors items, strains, locations, packages,
                        plant batches, harvests and plants every 15 minutes, keeps your notes and health flags as yours, and writes nothing
                        back unless you allow it.
                    </p>
                </div>
                {status.connected && (
                    <span className="sync-status" style={{ color: '#3BB570' }}>
                        <CheckCircle2 size={14} /> Connected
                    </span>
                )}
            </div>

            {message && <Message tone={message.tone}>{message.text}</Message>}
            {warnings.map(w => (
                <Message key={w} tone="warn"><AlertTriangle size={14} className="inline-block mr-1 -mt-0.5" />{w}</Message>
            ))}

            {status.source === 'env' && status.env && (
                <section className="sync-panel">
                    <div className="sync-panel-head">
                        <h4 className="sync-panel-title"><ShieldCheck size={14} className="inline-block mr-1 -mt-0.5" />Connected by NeuroCann for this deploy</h4>
                        <span className="sync-panel-meta">{MODE_LABEL[status.env.mode]} · {MODE_HELP[status.env.mode]}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                        This site carries your facility&apos;s T3 key in its own configuration, so there is nothing to connect here. To change the
                        mode or rotate the key, contact NeuroCann.
                    </p>
                </section>
            )}

            {conn && !replacing && (
                <ConnectedCard
                    status={status}
                    busy={busy}
                    onVerify={() => run('verify', () => apiService.updateMetrcConnection({ verify: true }), 'Checked with T3.')}
                    onMode={mode => run('mode', () => apiService.updateMetrcConnection({ mode }), mode === 'read-only' ? 'Connection is read-only again.' : `${MODE_LABEL[mode]}.`)}
                    onPause={() => run('pause', () => apiService.updateMetrcConnection({ status: conn.status === 'paused' ? 'active' : 'paused' }), conn.status === 'paused' ? 'Scheduled sync resumed.' : 'Scheduled sync paused. Sync now and dry runs still work.')}
                    onLicenses={syncLicenses => run('licenses', () => apiService.updateMetrcConnection({ syncLicenses }), syncLicenses === null ? 'Syncing every license.' : `Syncing ${syncLicenses.length} license${syncLicenses.length === 1 ? '' : 's'}.`)}
                    onReplace={() => { setReplacing(true); setMessage(null); }}
                    onDisconnect={async () => {
                        if (!window.confirm('Remove the Metrc connection? Everything already synced stays in NeuroCann; it just stops updating. You can connect again any time.')) return;
                        await run('disconnect', () => apiService.disconnectMetrc(), 'Metrc disconnected.');
                    }}
                />
            )}

            {status.source !== 'env' && (!conn || replacing) && (
                <ConnectForm
                    status={status}
                    replacing={replacing}
                    busy={busy === 'connect'}
                    onCancel={() => setReplacing(false)}
                    onSubmit={async (apiKey, mode) => {
                        const ok = await run(
                            'connect',
                            () => apiService.connectMetrc({ apiKey, mode }),
                            replacing ? 'Key replaced and checked with T3.' : 'Connected. Start with a dry run below to see what Metrc would change, then Sync now.',
                        );
                        if (ok) setReplacing(false);
                        return ok;
                    }}
                />
            )}
        </div>
    );
};

// ── Not connected: how to get a key, and the form ──────────────────────────

const STEPS: Array<{ title: string; body: React.ReactNode }> = [
    {
        title: 'Sign in to Track & Trace Tools with a Metrc login for your facility',
        body: (
            <>
                Create an account at <a href={T3_DASH} target="_blank" rel="noreferrer" className="underline">dash.trackandtrace.tools</a> and link the Metrc login.
                Use a view-only Metrc employee if you can: a T3 key can do everything that login can do in Metrc, so give it as little as possible.
            </>
        ),
    },
    {
        title: 'Add T3+',
        body: 'The Metrc data endpoints (packages, plants, harvests) need an active T3+ subscription with full API access. The free tier only exposes reports.',
    },
    {
        title: 'Generate a secret key and paste it here',
        body: (
            <>
                Open <a href={T3_KEY_PAGE} target="_blank" rel="noreferrer" className="underline">api.trackandtrace.tools/v2/pages/secret-key</a>, create a key and copy the whole value.
                The key is bound to that Metrc username and password; changing the password in Metrc invalidates it.
            </>
        ),
    },
];

const ConnectForm: React.FC<{
    status: MetrcConnectionStatus;
    replacing: boolean;
    busy: boolean;
    onCancel: () => void;
    onSubmit: (apiKey: string, mode: T3Mode) => Promise<boolean>;
}> = ({ status, replacing, busy, onCancel, onSubmit }) => {
    const [apiKey, setApiKey] = useState('');
    const [show, setShow] = useState(false);
    const [mode, setMode] = useState<T3Mode>(status.connection?.mode ?? 'read-only');
    const trimmed = apiKey.trim();
    const valid = trimmed.length >= 16 && !/\s/.test(trimmed);

    if (!status.selfServeAvailable) {
        return (
            <div className="settings-empty">
                <KeyRound size={18} className="inline-block mb-1" />
                <div>This server cannot store Metrc keys yet. Ask NeuroCann to enable self-serve connections, or we can set your facility up directly.</div>
            </div>
        );
    }
    if (!status.canManage) {
        return (
            <div className="settings-empty">
                <KeyRound size={18} className="inline-block mb-1" />
                <div>A director or admin connects Metrc for the company. Once connected, everyone here sees the synced data.</div>
            </div>
        );
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!valid || busy) return;
        const ok = await onSubmit(trimmed, mode);
        if (ok) setApiKey('');
    };

    return (
        <>
            {!replacing && (
                <ol className="metrc-steps">
                    {STEPS.map((s, i) => (
                        <li key={s.title} className="metrc-step">
                            <span className="metrc-step-num">{i + 1}</span>
                            <div>
                                <div className="text-sm font-semibold text-[#1A1A1A]">{s.title}</div>
                                <p className="text-xs text-[#595959] leading-relaxed mt-0.5">{s.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            <form className="settings-add-form" onSubmit={submit} aria-label={replacing ? 'Replace Metrc key' : 'Connect Metrc'}>
                <label htmlFor="metrc-key" className="block text-sm font-semibold text-[#1A1A1A] mb-1">
                    {replacing ? 'New T3 secret key' : 'T3 secret key'}
                </label>
                <div className="flex gap-2 mb-1">
                    <input
                        id="metrc-key"
                        type={show ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="Paste the key from api.trackandtrace.tools"
                        autoComplete="off"
                        spellCheck={false}
                        className="field-input flex-1 font-mono text-xs"
                        disabled={busy}
                    />
                    <button type="button" onClick={() => setShow(v => !v)} className="btn-cancel text-sm px-3 py-1.5" title={show ? 'Hide key' : 'Show key'} aria-label={show ? 'Hide key' : 'Show key'}>
                        {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                </div>
                <p className="text-xs text-[#959595] mb-3">Sent once over TLS and stored encrypted. It is never shown again, and it never reaches the browser after this.</p>

                <fieldset className="mb-3">
                    <legend className="text-sm font-semibold text-[#1A1A1A] mb-1">What NeuroCann may do with it</legend>
                    {(['read-only', 'live'] as T3Mode[]).map(m => (
                        <label key={m} className="flex items-start gap-2 text-sm text-[#1A1A1A] mb-1.5 cursor-pointer select-none">
                            <input type="radio" name="metrc-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-0.5" disabled={busy} />
                            <span>
                                <span className="font-medium">{MODE_LABEL[m]}</span>
                                <span className="block text-xs text-[#595959]">{MODE_HELP[m]}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>

                <div className="flex items-center gap-2">
                    <button type="submit" disabled={!valid || busy} className="btn-primary text-sm px-3 py-1.5">
                        {busy ? <><Loader2 size={14} className="animate-spin" /> Checking with T3…</> : replacing ? 'Replace key' : 'Connect Metrc'}
                    </button>
                    {replacing && <button type="button" onClick={onCancel} className="btn-cancel text-sm px-3 py-1.5" disabled={busy}>Cancel</button>}
                    {!busy && !replacing && (
                        <span className="text-xs text-[#959595]">We check the key with T3 before saving. Nothing syncs until you run it.</span>
                    )}
                </div>
            </form>
        </>
    );
};

// ── Connected with a stored key ────────────────────────────────────────────

const ConnectedCard: React.FC<{
    status: MetrcConnectionStatus;
    busy: string | null;
    onVerify: () => void;
    onMode: (mode: T3Mode) => void;
    onPause: () => void;
    onLicenses: (syncLicenses: string[] | null) => void;
    onReplace: () => void;
    onDisconnect: () => void;
}> = ({ status, busy, onVerify, onMode, onPause, onLicenses, onReplace, onDisconnect }) => {
    const c = status.connection!;
    const canManage = status.canManage;
    const anyBusy = busy !== null;
    const selected = new Set(c.syncLicenses ?? c.licenses.map(l => l.licenseNumber));
    const stale = !status.connected;

    const toggleLicense = (license: string) => {
        const next = new Set(selected);
        if (next.has(license)) next.delete(license); else next.add(license);
        if (next.size === 0) return;
        const all = c.licenses.every(l => next.has(l.licenseNumber));
        onLicenses(all ? null : [...next]);
    };

    return (
        <section className="sync-panel">
            <div className="sync-panel-head">
                <h4 className="sync-panel-title">
                    {stale ? <AlertTriangle size={14} className="inline-block mr-1 -mt-0.5" style={{ color: '#DF5B59' }} /> : <KeyRound size={14} className="inline-block mr-1 -mt-0.5" />}
                    {c.username ? <><span className="font-bold">{c.username}</span>{c.hostname ? <> on <span className="font-mono">{c.hostname}</span></> : null}</> : 'Metrc connection'}
                </h4>
                <span className="sync-panel-meta">
                    key <span className="font-mono">…{c.keyHint}</span>
                    {' · '}added {ago(c.createdAt)}{c.createdByName ? ` by ${c.createdByName}` : ''}
                    {' · '}<span title={fmtExact(c.lastVerifiedAt)}>checked {ago(c.lastVerifiedAt)}</span>
                    {' · '}<span title={fmtExact(c.lastSyncedAt)}>last sync {ago(c.lastSyncedAt)}</span>
                </span>
            </div>

            {stale && <Message tone="error">The stored key can no longer be read on this server. Replace it to reconnect.</Message>}
            {c.lastError && !stale && (
                <Message tone="error"><span title={fmtExact(c.lastErrorAt)}>{c.lastError}</span></Message>
            )}
            {c.hasT3plus === false && (
                <Message tone="warn">No active T3+ subscription on this account. The sync needs T3+ to read Metrc data.</Message>
            )}
            {c.status === 'paused' && (
                <Message tone="warn">Scheduled sync is paused. Sync now and dry runs still work.</Message>
            )}

            <div className="metrc-conn-grid">
                <div>
                    <div className="metrc-conn-label">Subscription</div>
                    <div className="text-sm text-[#1A1A1A]">
                        {c.hasT3plus === null ? 'Unknown' : c.hasT3plus ? `T3+ active${c.subscriptionTier ? ` (${c.subscriptionTier})` : ''}` : 'T3+ missing'}
                        {c.apiAccessLevel ? <span className="text-[#959595]"> · API access {c.apiAccessLevel}</span> : null}
                    </div>
                </div>
                <div>
                    <div className="metrc-conn-label">Mode</div>
                    {canManage ? (
                        <select
                            aria-label="Connection mode"
                            value={c.mode}
                            onChange={e => onMode(e.target.value as T3Mode)}
                            disabled={anyBusy}
                            className="field-input text-sm py-1"
                        >
                            <option value="read-only">{MODE_LABEL['read-only']}</option>
                            <option value="live">{MODE_LABEL.live}</option>
                            {c.mode === 'sandbox' && <option value="sandbox">{MODE_LABEL.sandbox}</option>}
                        </select>
                    ) : (
                        <div className="text-sm text-[#1A1A1A]">{MODE_LABEL[c.mode]}</div>
                    )}
                    <p className="text-xs text-[#959595] mt-1">{MODE_HELP[c.mode]}</p>
                </div>
            </div>

            <div className="mt-3">
                <div className="metrc-conn-label">Licenses {c.licenses.length ? `(${c.licenses.length})` : ''}</div>
                {c.licenses.length === 0 ? (
                    <p className="text-sm text-[#959595]">The Metrc login sees no licenses. Check it is an employee on the facility in Metrc, then re-check.</p>
                ) : (
                    <ul className="metrc-license-list">
                        {c.licenses.map(l => {
                            const on = selected.has(l.licenseNumber);
                            return (
                                <li key={l.licenseNumber} className="metrc-license">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            disabled={!canManage || anyBusy || (on && selected.size === 1)}
                                            onChange={() => toggleLicense(l.licenseNumber)}
                                            aria-label={`Sync ${l.licenseNumber}`}
                                        />
                                        <span className="license-number">{l.licenseNumber}</span>
                                        <span className="text-sm text-[#1A1A1A]">{l.licenseName}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {c.licenses.length > 1 && canManage && (
                    <p className="text-xs text-[#959595] mt-1">Untick a license to leave it out of the sync.</p>
                )}
            </div>

            {canManage && (
                <div className="flex flex-wrap gap-2 mt-4">
                    <button onClick={onVerify} className="btn-cancel text-sm px-3 py-1.5" disabled={anyBusy} title="Ask T3 who this key belongs to and refresh the license list.">
                        {busy === 'verify' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Re-check
                    </button>
                    <button onClick={onPause} className="btn-cancel text-sm px-3 py-1.5" disabled={anyBusy}>
                        {busy === 'pause' ? <Loader2 size={14} className="animate-spin" /> : c.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                        {c.status === 'paused' ? ' Resume schedule' : ' Pause schedule'}
                    </button>
                    <button onClick={onReplace} className="btn-cancel text-sm px-3 py-1.5" disabled={anyBusy}>
                        <KeyRound size={14} /> Replace key
                    </button>
                    <button onClick={onDisconnect} className="btn-cancel text-sm px-3 py-1.5 ml-auto" disabled={anyBusy} style={{ color: '#DF5B59' }}>
                        {busy === 'disconnect' ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />} Disconnect
                    </button>
                </div>
            )}
        </section>
    );
};

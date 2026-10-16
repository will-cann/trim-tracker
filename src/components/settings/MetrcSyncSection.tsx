import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Loader2, RefreshCw, Search, SkipForward } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { MetrcSyncList, MetrcSyncListCounts, MetrcSyncRun, MetrcSyncStatus } from '../../../shared/manifest/metrcSync';

/**
 * Settings → Metrc Sync. Shown only on a deploy that syncs Metrc into this
 * company (see docs/metrc-sync.md): what NeuroCann holds from Metrc, the last
 * run's counts per list and licence, each list's cursor, run history, and
 * Sync now / Dry run for directors and admins.
 */

interface Props {
    initialStatus: MetrcSyncStatus;
}

const LIST_ORDER: MetrcSyncList[] = [
    'items', 'strains', 'locations',
    'packages/active', 'packages/intransit', 'packages/inactive',
    'plantbatches/active', 'plantbatches/inactive',
    'harvests/active', 'harvests/inactive',
    'plants/vegetative', 'plants/flowering', 'plants/inactive',
];

const LIST_LABEL: Record<MetrcSyncList, string> = {
    items: 'Items',
    strains: 'Strains',
    locations: 'Locations',
    'packages/active': 'Active packages',
    'packages/intransit': 'In-transit packages',
    'packages/inactive': 'Finished packages',
    'plantbatches/active': 'Plant batches',
    'plantbatches/inactive': 'Finished batches',
    'harvests/active': 'Harvests',
    'harvests/inactive': 'Finished harvests',
    'plants/vegetative': 'Veg plants',
    'plants/flowering': 'Flowering plants',
    'plants/inactive': 'Harvested/destroyed plants',
};

const listLabel = (list: string) => LIST_LABEL[list as MetrcSyncList] ?? list;

const RUN_LABEL: Record<MetrcSyncRun['status'], string> = {
    queued: 'Queued',
    running: 'Running',
    succeeded: 'Succeeded',
    partial: 'Partial',
    failed: 'Failed',
    skipped: 'Skipped',
};

const RUN_COLOR: Record<MetrcSyncRun['status'], string> = {
    queued: '#959595',
    running: '#1C9EFF',
    succeeded: '#3BB570',
    partial: '#E0863A',
    failed: '#DF5B59',
    skipped: '#959595',
};

const POLL_MS = 5000;

const fmtTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const fmtExact = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString() : '';

/** "just now", "16 min ago", "3 h ago", "2 d ago". */
const ago = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
};

const duration = (run: MetrcSyncRun) => {
    if (!run.startedAt) return null;
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
    const s = Math.max(0, Math.round((end - new Date(run.startedAt).getTime()) / 1000));
    return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
};

const isActive = (run: MetrcSyncRun | null) => run?.status === 'queued' || run?.status === 'running';

const StatusIcon: React.FC<{ status: MetrcSyncRun['status']; size?: number }> = ({ status, size = 14 }) => {
    const color = RUN_COLOR[status];
    if (status === 'queued' || status === 'running') return <Loader2 size={size} className="animate-spin" style={{ color }} />;
    if (status === 'succeeded') return <CheckCircle2 size={size} style={{ color }} />;
    if (status === 'skipped') return <SkipForward size={size} style={{ color }} />;
    return <AlertTriangle size={size} style={{ color }} />;
};

const RunStatus: React.FC<{ run: MetrcSyncRun }> = ({ run }) => (
    <span className="sync-status" style={{ color: RUN_COLOR[run.status] }}>
        <StatusIcon status={run.status} />
        {RUN_LABEL[run.status]}
        {run.dryRun && <span className="sync-tag">dry run</span>}
    </span>
);

const runTotals = (run: MetrcSyncRun) => {
    const out = { fetched: 0, inserted: 0, updated: 0, failed: 0 };
    for (const lists of Object.values(run.counts)) {
        for (const c of Object.values(lists)) {
            if (!c) continue;
            out.fetched += c.fetched;
            out.inserted += c.inserted;
            out.updated += c.updated;
            out.failed += c.failed ?? 0;
        }
    }
    return out;
};

export const MetrcSyncSection: React.FC<Props> = ({ initialStatus }) => {
    const [status, setStatus] = useState<MetrcSyncStatus>(initialStatus);
    const [refreshing, setRefreshing] = useState(false);
    const [starting, setStarting] = useState<'sync' | 'dry' | null>(null);
    const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const [openRunId, setOpenRunId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setRefreshing(true);
        const next = await apiService.getMetrcSyncStatus();
        if (next) setStatus(next);
        setRefreshing(false);
    }, []);

    // Poll while a run is queued or running so the counts move.
    useEffect(() => {
        if (!isActive(status.lastRun)) return;
        const t = setInterval(() => { void reload(); }, POLL_MS);
        return () => clearInterval(t);
    }, [status.lastRun, reload]);

    const start = async (dryRun: boolean) => {
        setStarting(dryRun ? 'dry' : 'sync');
        setMessage(null);
        try {
            await apiService.startMetrcSync(dryRun);
            setMessage({ tone: 'ok', text: dryRun ? 'Dry run started. Nothing will be written; the report appears below when it finishes.' : 'Sync started.' });
            await reload();
        } catch (err) {
            setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not start sync.' });
        } finally {
            setStarting(null);
        }
    };

    const last = status.lastRun;
    const busy = isActive(last) || starting !== null;
    const licenses = Array.from(new Set([
        ...status.lists.map(l => l.license),
        ...Object.keys(last?.counts ?? {}),
    ])).sort();
    const lastSuccess = status.recentRuns.find(r => !r.dryRun && (r.status === 'succeeded' || r.status === 'partial'));
    const t = status.totals;

    return (
        <div className="metrc-sync">
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Metrc Sync</h3>
                    <p className="settings-section-desc">
                        Mirrored from Metrc through T3 every 15 minutes ({status.mode === 'read-only' ? 'read-only' : status.mode} connection).
                        Metrc owns what it tracks; plant health, notes and tasks stay here.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => void reload()} className="btn-cancel text-sm px-3 py-1.5" disabled={refreshing} title="Refresh">
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    {status.canRun && (
                        <>
                            <button onClick={() => void start(true)} className="btn-cancel text-sm px-3 py-1.5" disabled={busy} title="Pull from Metrc and report what would change, without writing anything.">
                                {starting === 'dry' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Dry run
                            </button>
                            <button onClick={() => void start(false)} className="btn-new-batch text-sm px-3 py-1.5" disabled={busy}>
                                {starting === 'sync' || isActive(last) ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />} Sync now
                            </button>
                        </>
                    )}
                </div>
            </div>

            {message && (
                <div className={`sync-message ${message.tone === 'error' ? 'sync-message--error' : 'sync-message--ok'}`}>
                    {message.text}
                </div>
            )}

            {/* What NeuroCann holds from Metrc, and when it last moved */}
            <div className="summary-strip">
                <div className="summary-strip-stats">
                    <span className="summary-strip-label">From Metrc</span>
                    <Stat value={t.packages} label="packages" />
                    <Stat value={t.plants} label="plants" />
                    <Stat value={t.plantBatches} label="batches" />
                    <Stat value={t.harvests} label="harvests" />
                    <Stat value={t.items} label="items" />
                    <Stat value={t.strains} label="strains" />
                    <Stat value={t.rooms} label="rooms" />
                </div>
                <div className="summary-strip-attention">
                    <span className="summary-strip-label">Last sync</span>
                    {lastSuccess ? (
                        <span className="summary-strip-chip" title={fmtExact(lastSuccess.finishedAt ?? lastSuccess.startedAt)}>
                            <span className="data-table-dot" style={{ background: RUN_COLOR[lastSuccess.status] }} />
                            <span className="font-semibold">{ago(lastSuccess.finishedAt ?? lastSuccess.startedAt)}</span>
                            <span className="text-gray-500">{RUN_LABEL[lastSuccess.status].toLowerCase()} · {lastSuccess.trigger === 'manual' ? 'manual' : 'scheduled'}</span>
                        </span>
                    ) : (
                        <span className="text-xs text-gray-500">never</span>
                    )}
                </div>
            </div>

            {/* Last run */}
            {!last ? (
                <div className="settings-empty">
                    No sync has run yet. {status.canRun ? 'Start with a dry run to see what Metrc would change, then Sync now.' : 'A director or admin can start one.'}
                </div>
            ) : (
                <section className="sync-panel">
                    <div className="sync-panel-head">
                        <RunStatus run={last} />
                        <span className="sync-panel-meta" title={fmtExact(last.startedAt ?? last.queuedAt)}>
                            {last.trigger === 'manual' ? `started by ${last.startedByName ?? 'a user'}` : 'scheduled'}
                            {' · '}{fmtTime(last.startedAt ?? last.queuedAt)} ({ago(last.startedAt ?? last.queuedAt)})
                            {duration(last) ? ` · ${duration(last)}` : ''}
                        </span>
                        <RunTotals run={last} />
                    </div>
                    {last.error && <p className="sync-error-text">{last.error}</p>}
                    <RunCounts run={last} licenses={licenses} />
                    {last.errors.length > 0 && (
                        <ul className="sync-error-list">
                            {last.errors.map((e, i) => (
                                <li key={i}>
                                    {e.license && <span className="sync-error-where">{e.license}</span>}
                                    {e.list && <span className="sync-error-where">{listLabel(e.list)}</span>}
                                    {e.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    {last.report && (
                        <div className="sync-report">
                            <p>
                                <span className="font-bold tabular-nums">{last.report.tagMatches}</span> Metrc package{last.report.tagMatches === 1 ? '' : 's'} match{last.report.tagMatches === 1 ? 'es' : ''} a tag entered by hand here
                                {last.report.conflicts.length > 0 ? `; ${last.report.conflicts.length}${last.report.conflictsTruncated ? '+' : ''} would change:` : '.'}
                            </p>
                            {last.report.conflicts.length > 0 && (
                                <table className="sync-table">
                                    <thead>
                                        <tr>
                                            <th className="sync-th">Tag</th>
                                            <th className="sync-th">Licence</th>
                                            <th className="sync-th">Metrc would set</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {last.report.conflicts.map(c => (
                                            <tr key={c.label} className="sync-row">
                                                <td className="sync-td"><span className="license-number">{c.label}</span></td>
                                                <td className="sync-td sync-muted">{c.license}</td>
                                                <td className="sync-td sync-wrap">{c.changes.join(' · ')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </section>
            )}

            {/* Per-list cursors */}
            {status.lists.length > 0 && (
                <section className="sync-panel">
                    <div className="sync-panel-head">
                        <h4 className="sync-panel-title">Cursors</h4>
                        <span className="sync-panel-meta">When each list last pulled cleanly. A list that errored keeps its cursor, so nothing is skipped.</span>
                    </div>
                    <CursorMatrix status={status} licenses={licenses} />
                </section>
            )}

            {/* History */}
            {status.recentRuns.length > 1 && (
                <section className="sync-panel">
                    <div className="sync-panel-head">
                        <h4 className="sync-panel-title">Recent runs</h4>
                        <span className="sync-panel-meta">Click a run with errors to see them.</span>
                    </div>
                    <table className="sync-table">
                        <thead>
                            <tr>
                                <th className="sync-th">When</th>
                                <th className="sync-th">Result</th>
                                <th className="sync-th">Trigger</th>
                                <th className="sync-th sync-num">Took</th>
                                <th className="sync-th sync-num">Fetched</th>
                                <th className="sync-th sync-num">New</th>
                                <th className="sync-th sync-num">Updated</th>
                                <th className="sync-th sync-num">Failed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {status.recentRuns.slice(1).map(run => {
                                const tot = runTotals(run);
                                const hasErrors = run.errors.length > 0 || Boolean(run.error);
                                const open = openRunId === run.id;
                                return (
                                    <React.Fragment key={run.id}>
                                        <tr
                                            className={`sync-row ${hasErrors ? 'sync-row--clickable' : ''}`}
                                            onClick={() => hasErrors && setOpenRunId(open ? null : run.id)}
                                            title={hasErrors ? (open ? 'Hide errors' : 'Show errors') : undefined}
                                        >
                                            <td className="sync-td" title={fmtExact(run.startedAt ?? run.queuedAt)}>{fmtTime(run.startedAt ?? run.queuedAt)}</td>
                                            <td className="sync-td"><RunStatus run={run} /></td>
                                            <td className="sync-td sync-muted">{run.trigger === 'manual' ? run.startedByName ?? 'manual' : 'schedule'}</td>
                                            <td className="sync-td sync-num sync-muted">{duration(run) ?? '—'}</td>
                                            <td className="sync-td sync-num">{tot.fetched ? tot.fetched.toLocaleString() : <span className="sync-muted">—</span>}</td>
                                            <td className="sync-td sync-num">{tot.inserted ? tot.inserted.toLocaleString() : <span className="sync-muted">0</span>}</td>
                                            <td className="sync-td sync-num">{tot.updated ? tot.updated.toLocaleString() : <span className="sync-muted">0</span>}</td>
                                            <td className="sync-td sync-num">
                                                {tot.failed || run.errors.length
                                                    ? <span className="sync-fail">{tot.failed || run.errors.length}</span>
                                                    : <span className="sync-muted">0</span>}
                                            </td>
                                        </tr>
                                        {open && hasErrors && (
                                            <tr className="sync-row">
                                                <td colSpan={8} className="sync-td">
                                                    <ul className="sync-error-list sync-error-list--inline">
                                                        {run.error && <li>{run.error}</li>}
                                                        {run.errors.map((e, i) => (
                                                            <li key={i}>
                                                                {e.license && <span className="sync-error-where">{e.license}</span>}
                                                                {e.list && <span className="sync-error-where">{listLabel(e.list)}</span>}
                                                                {e.message}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
};

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
    <span className="summary-strip-stat">
        <span className="summary-strip-stat-value tabular-nums" style={value === 0 ? { color: '#959595' } : undefined}>{value.toLocaleString()}</span>
        <span className="summary-strip-stat-label">{label}</span>
    </span>
);

const RunTotals: React.FC<{ run: MetrcSyncRun }> = ({ run }) => {
    const tot = runTotals(run);
    if (!tot.fetched) return null;
    return (
        <span className="sync-panel-totals tabular-nums">
            <span><b>{tot.fetched.toLocaleString()}</b> fetched</span>
            <span><b>{tot.inserted.toLocaleString()}</b> new</span>
            <span><b>{tot.updated.toLocaleString()}</b> updated</span>
            {tot.failed > 0 && <span className="sync-fail"><b>{tot.failed.toLocaleString()}</b> failed</span>}
            {run.dryRun && <span className="sync-muted">nothing written</span>}
        </span>
    );
};

/** Lists down, licences across: "changed / fetched" per cell. */
const RunCounts: React.FC<{ run: MetrcSyncRun; licenses: string[] }> = ({ run, licenses }) => {
    const shown = licenses.filter(l => run.counts[l]);
    if (!shown.length) return null;
    const lists = LIST_ORDER.filter(list => shown.some(l => run.counts[l]?.[list]));
    const extra = Object.keys(run.counts[shown[0]] ?? {}).filter(l => !LIST_ORDER.includes(l as MetrcSyncList));
    const rows = [...lists, ...extra];
    return (
        <table className="sync-table sync-matrix">
            <thead>
                <tr>
                    <th className="sync-th">List</th>
                    {shown.map(license => <th key={license} className="sync-th sync-num"><span className="license-number">{license}</span></th>)}
                </tr>
            </thead>
            <tbody>
                {rows.map(list => (
                    <tr key={list} className="sync-row">
                        <td className="sync-td">{listLabel(list)}</td>
                        {shown.map(license => <CountCell key={license} c={run.counts[license]?.[list as MetrcSyncList]} dryRun={run.dryRun} />)}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const CountCell: React.FC<{ c: MetrcSyncListCounts | undefined; dryRun: boolean }> = ({ c, dryRun }) => {
    if (!c) return <td className="sync-td sync-num sync-muted" title="Not reached, or not on this licence">—</td>;
    const changed = c.inserted + c.updated;
    const title = `${c.fetched} fetched · ${c.inserted} new · ${c.updated} updated · ${c.unchanged} unchanged`
        + (c.failed ? ` · ${c.failed} rejected by the database (see errors)` : '')
        + (dryRun ? ' (dry run: nothing written)' : '');
    return (
        <td className="sync-td sync-num tabular-nums" title={title}>
            <span className={changed ? 'font-bold' : 'sync-muted'}>{changed.toLocaleString()}</span>
            <span className="sync-muted"> / {c.fetched.toLocaleString()}</span>
            {c.failed ? <span className="sync-fail"> · {c.failed} failed</span> : null}
        </td>
    );
};

/** Lists down, licences across: when each list last pulled cleanly, and any standing error. */
const CursorMatrix: React.FC<{ status: MetrcSyncStatus; licenses: string[] }> = ({ status, licenses }) => {
    const byKey = new Map(status.lists.map(l => [`${l.license}\u0000${l.list}`, l]));
    const lists = [
        ...LIST_ORDER.filter(list => status.lists.some(l => l.list === list)),
        ...Array.from(new Set(status.lists.map(l => l.list))).filter(l => !LIST_ORDER.includes(l as MetrcSyncList)),
    ];
    const shown = licenses.filter(lic => status.lists.some(l => l.license === lic));
    return (
        <table className="sync-table sync-matrix">
            <thead>
                <tr>
                    <th className="sync-th">List</th>
                    {shown.map(license => <th key={license} className="sync-th"><span className="license-number">{license}</span></th>)}
                </tr>
            </thead>
            <tbody>
                {lists.map(list => (
                    <tr key={list} className="sync-row">
                        <td className="sync-td">{listLabel(list)}</td>
                        {shown.map(license => {
                            const s = byKey.get(`${license}\u0000${list}`);
                            if (!s) return <td key={license} className="sync-td sync-muted">—</td>;
                            const errored = Boolean(s.lastError);
                            const title = [
                                s.lastSuccessAt ? `Last success ${fmtExact(s.lastSuccessAt)}` : 'Never succeeded',
                                s.cursor ? `Next pull takes changes since ${fmtExact(s.cursor)}` : 'Next pull is a full pull',
                                s.lastError ? `Error ${fmtExact(s.lastErrorAt)}: ${s.lastError}` : '',
                            ].filter(Boolean).join('\n');
                            return (
                                <td key={license} className="sync-td" title={title}>
                                    <span className="sync-cursor">
                                        <span className="data-table-dot" style={{ background: errored ? '#DF5B59' : s.lastSuccessAt ? '#3BB570' : '#C0C0C0' }} />
                                        <span className={errored ? 'sync-fail' : undefined}>{ago(s.lastSuccessAt)}</span>
                                        {!s.cursor && <span className="sync-tag">full pull</span>}
                                    </span>
                                    {s.lastError && <div className="sync-cursor-error">{s.lastError}</div>}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

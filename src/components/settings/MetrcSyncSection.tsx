import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Loader2, RefreshCw, Search } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { MetrcSyncList, MetrcSyncRun, MetrcSyncStatus } from '../../../shared/manifest/metrcSync';

/**
 * Settings → Metrc Sync. Shown only on a deploy that syncs Metrc into this
 * company (see docs/metrc-sync.md): last run, per-licence counts, errors,
 * each list's cursor, and Sync now / Dry run for directors and admins.
 */

interface Props {
    initialStatus: MetrcSyncStatus;
}

const LIST_LABEL: Record<MetrcSyncList, string> = {
    items: 'Items',
    strains: 'Strains',
    locations: 'Locations',
    'packages/active': 'Active packages',
    'packages/intransit': 'In-transit packages',
    'packages/inactive': 'Finished packages',
};

const RUN_LABEL: Record<MetrcSyncRun['status'], string> = {
    queued: 'Queued',
    running: 'Running',
    succeeded: 'Succeeded',
    partial: 'Partial',
    failed: 'Failed',
    skipped: 'Skipped',
};

const POLL_MS = 5000;

const fmtTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const duration = (run: MetrcSyncRun) => {
    if (!run.startedAt) return null;
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
    const s = Math.max(0, Math.round((end - new Date(run.startedAt).getTime()) / 1000));
    return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
};

const isActive = (run: MetrcSyncRun | null) => run?.status === 'queued' || run?.status === 'running';

const runTone = (status: MetrcSyncRun['status']) =>
    status === 'succeeded' ? 'text-[var(--color-flower)]'
        : status === 'failed' ? 'text-[var(--color-waste)]'
            : status === 'partial' ? 'text-[#FA9E52]'
                : 'text-[var(--color-dolphin)]';

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

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Metrc Sync</h3>
                    <p className="settings-section-desc">
                        Items, strains, locations and packages are mirrored from Metrc through T3 every 15 minutes
                        ({status.mode === 'read-only' ? 'read-only' : status.mode} connection). Metrc owns what it tracks; plant health, notes and tasks stay here.
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
                <div className={`settings-add-form ${message.tone === 'error' ? '!border-[var(--color-waste)]' : '!border-[#3BB570] !bg-[rgba(59,181,112,0.06)]'}`}>
                    <p className="text-sm">{message.text}</p>
                </div>
            )}

            {/* Totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {([['Packages', status.totals.packages], ['Items', status.totals.items], ['Strains', status.totals.strains], ['Rooms', status.totals.rooms]] as const).map(([label, n]) => (
                    <div key={label} className="settings-add-form !mb-0">
                        <div className="text-xs text-[var(--color-dolphin)]">{label} from Metrc</div>
                        <div className="text-xl font-semibold tabular-nums">{n.toLocaleString()}</div>
                    </div>
                ))}
            </div>

            {/* Last run */}
            {!last ? (
                <div className="settings-empty">
                    No sync has run yet. {status.canRun ? 'Start with a dry run to see what Metrc would change, then Sync now.' : 'A director or admin can start one.'}
                </div>
            ) : (
                <div className="settings-add-form">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-sm">
                            {isActive(last) ? <Loader2 size={16} className="animate-spin text-[var(--color-dolphin)]" />
                                : last.status === 'succeeded' ? <CheckCircle2 size={16} className="text-[var(--color-flower)]" />
                                    : <AlertTriangle size={16} className={runTone(last.status)} />}
                            <span className={`font-semibold ${runTone(last.status)}`}>{RUN_LABEL[last.status]}</span>
                            {last.dryRun && <span className="text-xs text-[var(--color-dolphin)]">dry run</span>}
                            <span className="text-xs text-[var(--color-dolphin)]">
                                {last.trigger === 'manual' ? `started by ${last.startedByName ?? 'a user'}` : 'scheduled'} · {fmtTime(last.startedAt ?? last.queuedAt)}
                                {duration(last) ? ` · ${duration(last)}` : ''}
                            </span>
                        </div>
                    </div>
                    {last.error && <p className="text-sm text-[var(--color-waste)] mt-2">{last.error}</p>}
                    <RunCounts run={last} licenses={licenses} />
                    {last.errors.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-[var(--color-waste)]">
                            {last.errors.map((e, i) => (
                                <li key={i}>{e.license ? `${e.license} · ` : ''}{e.list ? `${LIST_LABEL[e.list as MetrcSyncList] ?? e.list}: ` : ''}{e.message}</li>
                            ))}
                        </ul>
                    )}
                    {last.report && (
                        <div className="mt-3 text-sm">
                            <p>
                                <span className="font-medium">{last.report.tagMatches}</span> Metrc package{last.report.tagMatches === 1 ? '' : 's'} match{last.report.tagMatches === 1 ? 'es' : ''} a tag entered by hand here
                                {last.report.conflicts.length > 0 ? `; ${last.report.conflicts.length}${last.report.conflictsTruncated ? '+' : ''} would change:` : '.'}
                            </p>
                            {last.report.conflicts.length > 0 && (
                                <div className="settings-table-wrap mt-2">
                                    <table className="strain-table">
                                        <thead>
                                            <tr>
                                                <th className="strain-th">Tag</th>
                                                <th className="strain-th">Licence</th>
                                                <th className="strain-th">Metrc would set</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {last.report.conflicts.map(c => (
                                                <tr key={c.label} className="strain-row">
                                                    <td className="strain-cell-name"><span className="license-number">{c.label}</span></td>
                                                    <td className="strain-cell-notes">{c.license}</td>
                                                    <td className="strain-cell-notes text-xs">{c.changes.join(' · ')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Per-list state */}
            {status.lists.length > 0 && (
                <div className="settings-table-wrap">
                    <table className="strain-table">
                        <thead>
                            <tr>
                                <th className="strain-th strain-th-name">Licence</th>
                                <th className="strain-th">List</th>
                                <th className="strain-th strain-th-days">Last success</th>
                                <th className="strain-th strain-th-days">Pulls changes since</th>
                                <th className="strain-th strain-th-notes">Last error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {status.lists.map(l => (
                                <tr key={`${l.license}-${l.list}`} className="strain-row">
                                    <td className="strain-cell-name"><span className="license-number">{l.license}</span></td>
                                    <td className="strain-cell-notes">{LIST_LABEL[l.list as MetrcSyncList] ?? l.list}</td>
                                    <td className="strain-cell-days text-xs">{fmtTime(l.lastSuccessAt)}</td>
                                    <td className="strain-cell-days text-xs">{l.cursor ? fmtTime(l.cursor) : 'full pull'}</td>
                                    <td className="strain-cell-notes text-xs text-[var(--color-waste)]">{l.lastError ?? ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* History */}
            {status.recentRuns.length > 1 && (
                <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-2">Recent runs</h4>
                    <div className="settings-table-wrap">
                        <table className="strain-table">
                            <thead>
                                <tr>
                                    <th className="strain-th strain-th-days">When</th>
                                    <th className="strain-th">Result</th>
                                    <th className="strain-th">Trigger</th>
                                    <th className="strain-th strain-th-notes">Packages written</th>
                                </tr>
                            </thead>
                            <tbody>
                                {status.recentRuns.slice(1).map(run => {
                                    const written = sumPackages(run);
                                    return (
                                        <React.Fragment key={run.id}>
                                            <tr className="strain-row" style={{ cursor: run.errors.length ? 'pointer' : undefined }} onClick={() => setOpenRunId(openRunId === run.id ? null : run.id)}>
                                                <td className="strain-cell-days text-xs">{fmtTime(run.startedAt ?? run.queuedAt)}</td>
                                                <td className={`strain-cell-notes text-xs font-medium ${runTone(run.status)}`}>{RUN_LABEL[run.status]}{run.dryRun ? ' (dry run)' : ''}</td>
                                                <td className="strain-cell-notes text-xs">{run.trigger === 'manual' ? run.startedByName ?? 'manual' : 'schedule'}</td>
                                                <td className="strain-cell-notes text-xs tabular-nums">{written === null ? '—' : `${written.inserted} new · ${written.updated} updated · ${written.unchanged} unchanged`}{run.errors.length ? ` · ${run.errors.length} error${run.errors.length === 1 ? '' : 's'}` : ''}</td>
                                            </tr>
                                            {openRunId === run.id && (run.errors.length > 0 || run.error) && (
                                                <tr className="strain-row">
                                                    <td colSpan={4} className="strain-cell-notes text-xs text-[var(--color-waste)]">
                                                        {run.error && <div>{run.error}</div>}
                                                        {run.errors.map((e, i) => <div key={i}>{e.license ? `${e.license} · ` : ''}{e.list ?? ''}: {e.message}</div>)}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

function sumPackages(run: MetrcSyncRun) {
    let any = false;
    const out = { inserted: 0, updated: 0, unchanged: 0 };
    for (const lists of Object.values(run.counts)) {
        for (const [list, c] of Object.entries(lists)) {
            if (!list.startsWith('packages/') || !c) continue;
            any = true;
            out.inserted += c.inserted;
            out.updated += c.updated;
            out.unchanged += c.unchanged;
        }
    }
    return any ? out : null;
}

const RunCounts: React.FC<{ run: MetrcSyncRun; licenses: string[] }> = ({ run, licenses }) => {
    const shown = licenses.filter(l => run.counts[l]);
    if (!shown.length) return null;
    return (
        <div className="settings-table-wrap mt-3">
            <table className="strain-table">
                <thead>
                    <tr>
                        <th className="strain-th strain-th-name">Licence</th>
                        {(Object.keys(LIST_LABEL) as MetrcSyncList[]).map(list => (
                            <th key={list} className="strain-th text-xs">{LIST_LABEL[list]}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {shown.map(license => (
                        <tr key={license} className="strain-row">
                            <td className="strain-cell-name"><span className="license-number">{license}</span></td>
                            {(Object.keys(LIST_LABEL) as MetrcSyncList[]).map(list => {
                                const c = run.counts[license]?.[list];
                                return (
                                    <td key={list} className="strain-cell-notes text-xs tabular-nums" title={c ? `${c.fetched} fetched · ${c.inserted} new · ${c.updated} updated · ${c.unchanged} unchanged${run.dryRun ? ' (dry run: nothing written)' : ''}` : 'not reached'}>
                                        {c ? `${c.inserted + c.updated}/${c.fetched}` : '—'}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

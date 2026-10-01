import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Plus, ShieldOff, Trash2 } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import { apiService } from '../../services/apiService';
import { useAuth } from '../../contexts/authContext';
import type { ApiKey, ApiKeyScope, CreatedApiKey } from '../../types/definitions';

type ClientId = 'claude-code' | 'claude-desktop' | 'cursor' | 'other' | 'curl';

const CLIENT_TABS: { id: ClientId; label: string }[] = [
    { id: 'claude-code', label: 'Claude Code' },
    { id: 'claude-desktop', label: 'Claude Desktop' },
    { id: 'cursor', label: 'Cursor' },
    { id: 'other', label: 'Other (stdio bridge)' },
    { id: 'curl', label: 'curl' },
];

function mcpUrl(): string {
    return `${window.location.origin}/mcp`;
}

function snippetFor(client: ClientId, key: string): string {
    const url = mcpUrl();
    switch (client) {
        case 'claude-code':
            return `claude mcp add --transport http neurocann ${url} \\\n  --header "Authorization: Bearer ${key}"`;
        case 'claude-desktop':
            return JSON.stringify({
                mcpServers: {
                    neurocann: {
                        command: 'npx',
                        args: ['-y', 'mcp-remote', url, '--header', `Authorization:Bearer ${key}`],
                    },
                },
            }, null, 2);
        case 'cursor':
            return JSON.stringify({
                mcpServers: {
                    neurocann: { url, headers: { Authorization: `Bearer ${key}` } },
                },
            }, null, 2);
        case 'other':
            return [
                `# Any client that only speaks stdio MCP (Windsurf, Zed, LM Studio, custom agents):`,
                `npx -y mcp-remote ${url} --header "Authorization:Bearer ${key}"`,
                ``,
                `# Clients that accept a streamable-HTTP URL + headers can connect directly:`,
                `#   URL:    ${url}`,
                `#   Header: Authorization: Bearer ${key}`,
            ].join('\n');
        case 'curl':
            return `curl -X POST ${url} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
    }
}

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard unavailable (insecure context) — user can select the text manually.
        }
    };
    return (
        <button type="button" onClick={copy} className="btn-cancel text-xs px-2 py-1 inline-flex items-center gap-1" title="Copy">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {label ?? (copied ? 'Copied' : 'Copy')}
        </button>
    );
};

export const LlmPluginSection: React.FC = () => {
    const { user } = useAuth();
    const canManage = user?.role === 'admin' || user?.role === 'director';

    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newWrite, setNewWrite] = useState(false);
    const [saving, setSaving] = useState(false);

    const [created, setCreated] = useState<CreatedApiKey | null>(null);
    const [clientTab, setClientTab] = useState<ClientId>('claude-code');

    const load = useCallback(async () => {
        try {
            setKeys(await apiService.getApiKeys());
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Failed to load API keys');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (canManage) load(); else setLoading(false);
    }, [canManage, load]);

    const handleCreate = async () => {
        const name = newName.trim();
        if (!name || saving) return;
        setSaving(true);
        try {
            const scopes: ApiKeyScope[] = newWrite ? ['read', 'write'] : ['read'];
            const result = await apiService.createApiKey(name, scopes);
            setCreated(result);
            setNewName('');
            setNewWrite(false);
            setIsAdding(false);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Failed to create API key');
        } finally {
            setSaving(false);
        }
    };

    const handleRevoke = async (key: ApiKey) => {
        if (!window.confirm(`Revoke "${key.name}"? Any LLM client using it will lose access immediately.`)) return;
        await apiService.revokeApiKey(key.id);
        if (created?.id === key.id) setCreated(null);
        await load();
    };

    const activeKeys = keys.filter(k => !k.revokedAt);
    const revokedKeys = keys.filter(k => k.revokedAt);
    const placeholderKey = 'nck_YOUR_KEY';

    if (!canManage) {
        return (
            <div>
                <div className="settings-section-header">
                    <div>
                        <h3 className="settings-section-title">LLM Plugin</h3>
                        <p className="settings-section-desc">Connect Claude, ChatGPT or Cursor to this facility.</p>
                    </div>
                </div>
                <div className="settings-empty">
                    <ShieldOff size={18} className="inline-block mb-1" />
                    <div>Only admins and directors can create plugin API keys. Ask a director to set one up for you.</div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">LLM Plugin</h3>
                    <p className="settings-section-desc">
                        NeuroCann exposes an MCP server at <code className="text-[#1A1A1A]">{mcpUrl()}</code>. Any MCP-capable
                        assistant (Claude, Cursor, and others) can read your plants, harvests, inventory and tasks — and, with write access, create tasks.
                    </p>
                </div>
                {!isAdding && (
                    <button onClick={() => setIsAdding(true)} className="btn-new-batch text-sm px-3 py-1.5 whitespace-nowrap">
                        <Plus size={14} /> New Key
                    </button>
                )}
            </div>

            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

            {isAdding && (
                <div className="settings-add-form">
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Key name (e.g. Holland's Claude Desktop)"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="field-input flex-1"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#1A1A1A] mb-3 cursor-pointer select-none">
                        <input type="checkbox" checked={newWrite} onChange={e => setNewWrite(e.target.checked)} />
                        Allow writes (create and complete tasks). Read-only keys can never change data.
                    </label>
                    <div className="flex gap-2">
                        <button onClick={handleCreate} disabled={saving || !newName.trim()} className="btn-primary text-sm px-3 py-1.5">
                            {saving ? 'Creating…' : 'Create Key'}
                        </button>
                        <button onClick={() => { setIsAdding(false); setNewName(''); setNewWrite(false); }} className="btn-cancel text-sm px-3 py-1.5">Cancel</button>
                    </div>
                </div>
            )}

            {created && (
                <div className="settings-add-form !border-[#3BB570] !bg-[rgba(59,181,112,0.06)]">
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                            <div className="text-sm font-semibold text-[#1A1A1A]">Key created: {created.name}</div>
                            <div className="text-xs text-[#959595]">Copy it now — for security it will not be shown again.</div>
                        </div>
                        <button onClick={() => setCreated(null)} className="btn-cancel text-xs px-2 py-1">Done</button>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                        <code className="field-input flex-1 text-xs break-all select-all">{created.key}</code>
                        <CopyButton text={created.key} />
                    </div>
                </div>
            )}

            {loading ? (
                <CenteredSpinner label="Loading keys…" height="py-12" />
            ) : activeKeys.length === 0 ? (
                <div className="settings-empty">
                    No active plugin keys yet.{' '}
                    <button onClick={() => setIsAdding(true)} className="settings-empty-action">
                        Create a key to connect an assistant
                    </button>
                </div>
            ) : (
                <div className="settings-table-wrap">
                    <table className="strain-table">
                        <thead>
                            <tr>
                                <th className="strain-th strain-th-name">Name</th>
                                <th className="strain-th">Key</th>
                                <th className="strain-th">Access</th>
                                <th className="strain-th strain-th-days">Last used</th>
                                <th className="strain-th" style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeKeys.map(k => (
                                <tr key={k.id} className="strain-row">
                                    <td className="strain-cell-name">
                                        <span className="font-semibold text-[#1A1A1A]">{k.name}</span>
                                        {k.createdBy && <div className="text-xs text-[#959595]">by {k.createdBy}</div>}
                                    </td>
                                    <td className="strain-cell-notes"><code className="text-xs tabular-nums">{k.keyPrefix}…</code></td>
                                    <td className="strain-cell-notes">
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${k.scopes.includes('write') ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                                            {k.scopes.includes('write') ? 'Read & write' : 'Read only'}
                                        </span>
                                    </td>
                                    <td className="strain-cell-days">
                                        <span className="text-sm text-[#959595]">
                                            {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}
                                        </span>
                                    </td>
                                    <td className="strain-cell-action">
                                        <button onClick={() => handleRevoke(k)} className="strain-delete-btn" title="Revoke key">
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {revokedKeys.length > 0 && (
                <p className="mt-2 text-xs text-[#959595]">{revokedKeys.length} revoked key{revokedKeys.length === 1 ? '' : 's'} hidden.</p>
            )}

            <div className="mt-6">
                <h4 className="text-sm font-semibold text-[#1A1A1A] mb-1">Connect an assistant</h4>
                <p className="text-xs text-[#959595] mb-2">
                    {created ? 'Snippets below include your new key.' : 'Replace nck_YOUR_KEY with a key from the table above.'}
                </p>
                <div className="flex flex-wrap gap-1 mb-2">
                    {CLIENT_TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setClientTab(t.id)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${clientTab === t.id ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-[#1A1A1A] border-[#EBEBEB] hover:border-[#959595]'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="relative">
                    <pre className="settings-add-form !mb-0 text-xs overflow-x-auto whitespace-pre font-mono text-[#1A1A1A]">
                        {snippetFor(clientTab, created?.key ?? placeholderKey)}
                    </pre>
                    <div className="absolute top-2 right-2">
                        <CopyButton text={snippetFor(clientTab, created?.key ?? placeholderKey)} />
                    </div>
                </div>
                <p className="text-xs text-[#959595] mt-2">
                    Tools available: facility overview, rooms, strains, plants, harvests, packages, extraction runs, tasks, and ad-hoc reports.
                    Write keys add <code>create_task</code> and <code>update_task_status</code>.
                </p>
            </div>
        </div>
    );
};

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowRight, ArrowLeft, Mail } from 'lucide-react';
import type { ContactThread, ContactMessage } from '../../types/definitions';
import { apiService, ContactThreadsUnavailableError } from '../../services/apiService';

interface Props {
    threads: ContactThread[];
}

export const formatRelative = (iso: string | null | undefined): string => {
    if (!iso) return 'never';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
};

const formatAbsolute = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const isUnreadThread = (t: ContactThread): boolean => !!t.lastInboundAt;

const ThreadRow: React.FC<{ thread: ContactThread }> = ({ thread }) => {
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState<ContactMessage[] | null>(thread.messages ?? null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleToggle = async () => {
        const next = !expanded;
        setExpanded(next);
        if (next && !messages) {
            setLoading(true);
            setError(null);
            try {
                const detail = await apiService.getContactThread(thread.id);
                setMessages((detail?.messages ?? []) as ContactMessage[]);
            } catch (e) {
                if (e instanceof ContactThreadsUnavailableError) {
                    setError('Messaging not enabled yet');
                } else {
                    setError('Failed to load messages');
                }
            } finally {
                setLoading(false);
            }
        }
    };

    const unread = isUnreadThread(thread);

    return (
        <div
            style={{
                border: '1px solid #F1F1F1',
                borderRadius: 8,
                background: '#fff',
                overflow: 'hidden',
            }}
        >
            <button
                onClick={handleToggle}
                style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                {expanded ? <ChevronDown size={14} color="#737373" /> : <ChevronRight size={14} color="#737373" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                            style={{
                                fontSize: '0.875rem',
                                fontWeight: 700,
                                color: '#1A1A1A',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {thread.subject || '(no subject)'}
                        </span>
                        {unread && (
                            <span
                                style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    background: '#DC8B47',
                                    color: '#fff',
                                    borderRadius: 6,
                                    padding: '1px 7px',
                                }}
                            >
                                Unread
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: 2 }}>
                        {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}
                        <span style={{ margin: '0 6px', color: '#D1D1D1' }}>·</span>
                        {formatRelative(thread.lastActivityAt)}
                    </div>
                </div>
            </button>

            {expanded && (
                <div style={{ borderTop: '1px solid #F1F1F1', padding: '12px 14px', background: '#FAFAFA' }}>
                    {loading && <div style={{ fontSize: '0.8125rem', color: '#737373' }}>Loading messages...</div>}
                    {error && <div style={{ fontSize: '0.8125rem', color: '#DF5B59' }}>{error}</div>}
                    {!loading && !error && messages && messages.length === 0 && (
                        <div style={{ fontSize: '0.8125rem', color: '#737373' }}>No messages in this thread yet.</div>
                    )}
                    {!loading && !error && messages && messages.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {messages.map(m => (
                                <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            width: 22,
                                            height: 22,
                                            borderRadius: 11,
                                            background: m.direction === 'outbound' ? '#3BB570' : '#DC8B47',
                                            color: '#fff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: 2,
                                        }}
                                        title={m.direction}
                                    >
                                        {m.direction === 'outbound' ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.75rem', color: '#737373', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, color: '#1A1A1A' }}>
                                                {m.fromAddress || (m.direction === 'outbound' ? 'us' : 'unknown')}
                                            </span>
                                            <span>{formatAbsolute(m.createdAt)}</span>
                                        </div>
                                        <div
                                            style={{
                                                marginTop: 4,
                                                fontSize: '0.8125rem',
                                                color: '#1A1A1A',
                                                whiteSpace: 'pre-wrap',
                                                fontFamily: m.direction === 'inbound'
                                                    ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                                                    : 'inherit',
                                                background: m.direction === 'inbound' ? '#F4F4F4' : 'transparent',
                                                padding: m.direction === 'inbound' ? '8px 10px' : 0,
                                                borderRadius: m.direction === 'inbound' ? 6 : 0,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            {m.bodyText || <span style={{ color: '#959595' }}>(empty body)</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const ContactThreadTimeline: React.FC<Props> = ({ threads }) => {
    if (threads.length === 0) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '16px 14px',
                    border: '1px dashed #E8E8E8',
                    borderRadius: 8,
                    color: '#737373',
                    fontSize: '0.8125rem',
                }}
            >
                <Mail size={15} color="#959595" />
                No email threads yet with this vendor.
            </div>
        );
    }

    const sorted = [...threads].sort(
        (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map(t => (
                <ThreadRow key={t.id} thread={t} />
            ))}
        </div>
    );
};

export const useVendorThreads = (vendorId: string | null) => {
    const [threads, setThreads] = useState<ContactThread[]>([]);
    const [loading, setLoading] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!vendorId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setUnavailable(false);
        apiService.getContactThreads(vendorId)
            .then(data => {
                if (cancelled) return;
                setThreads((data || []) as ContactThread[]);
            })
            .catch(e => {
                if (cancelled) return;
                if (e instanceof ContactThreadsUnavailableError) {
                    setUnavailable(true);
                    setThreads([]);
                } else {
                    setError(e instanceof Error ? e.message : 'Unknown error');
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [vendorId]);

    return { threads, loading, unavailable, error };
};

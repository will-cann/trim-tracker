import React, { useState } from 'react';
import { ChevronDown, Clock, MapPin, Scissors, AlertTriangle } from 'lucide-react';
import type { HarvestBin, BinCureLog } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { BinCureLog as BinCureLogTimeline } from './BinCureLog';
import { TypeChip } from '../ui';

interface BinCardProps {
    bin: HarvestBin;
    onUpdate: (bin: HarvestBin) => void;
    onSendToTrim?: (binId: string) => void;
    compact?: boolean;
}

const formatWeight = (g: number | null) => {
    if (!g) return '—';
    if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    return `${g.toLocaleString(undefined, { maximumFractionDigits: 0 })} g`;
};

const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
};

const getNextActionInfo = (bin: HarvestBin) => {
    if (bin.status !== 'curing') return null;
    if (!bin.nextActionAt) return { label: 'No schedule set', overdue: false };
    const next = new Date(bin.nextActionAt);
    const now = new Date();
    const diffMs = next.getTime() - now.getTime();
    if (diffMs < 0) {
        const overdueMins = Math.abs(Math.floor(diffMs / 60000));
        if (overdueMins < 60) return { label: `Overdue ${overdueMins}m`, overdue: true };
        const overdueHrs = Math.floor(overdueMins / 60);
        return { label: `Overdue ${overdueHrs}h`, overdue: true };
    }
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return { label: `Burp in ${mins}m`, overdue: false };
    const hrs = Math.floor(mins / 60);
    return { label: `Burp in ${hrs}h`, overdue: false };
};

const getCuringDays = (bin: HarvestBin) => {
    const start = new Date(bin.buckedAt);
    const now = new Date();
    return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const BinCard: React.FC<BinCardProps> = ({ bin, onUpdate, onSendToTrim, compact }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [cureLogs, setCureLogs] = useState<BinCureLog[]>([]);
    const [logsLoaded, setLogsLoaded] = useState(false);
    const [loading, setLoading] = useState(false);

    const nextAction = getNextActionInfo(bin);
    const curingDays = getCuringDays(bin);

    const handleExpand = async () => {
        const next = !isExpanded;
        setIsExpanded(next);
        if (next && !logsLoaded && bin.status === 'curing') {
            const logs = await apiService.getBinCureLogs(bin.id);
            setCureLogs(logs);
            setLogsLoaded(true);
        }
    };

    const handleMarkReady = async () => {
        setLoading(true);
        try {
            const updated = await apiService.updateBin(bin.id, { status: 'ready' });
            onUpdate(updated);
        } finally {
            setLoading(false);
        }
    };

    const handleSendToTrim = async () => {
        if (onSendToTrim) {
            onSendToTrim(bin.id);
        }
    };

    const handleCureLogged = (log: BinCureLog) => {
        setCureLogs(prev => [log, ...prev]);
    };

    if (compact) {
        return (
            <div className="trim-card" style={{ cursor: 'pointer' }} onClick={handleSendToTrim}>
                <div className="trim-card-header" style={{ padding: '0.75rem 1rem' }}>
                    <div className="trim-card-top">
                        <div className="trim-card-title">
                            <h3 style={{ fontSize: '0.875rem', margin: 0 }}>
                                BIN-{String(bin.binNumber).padStart(3, '0')}
                            </h3>
                            <div className="trim-card-subtitle">
                                <span>{bin.strain}</span>
                                <span style={{ color: '#959595' }}>{formatWeight(bin.weight)}</span>
                            </div>
                        </div>
                        <TypeChip palette="binStatus" value={bin.status} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`trim-card${isExpanded ? ' expanded' : ''}`}>
            <div className="trim-card-header" onClick={handleExpand}>
                <div className="trim-card-top">
                    <div className="trim-card-title">
                        <h3 style={{ margin: 0 }}>
                            BIN-{String(bin.binNumber).padStart(3, '0')}
                            <span style={{ fontWeight: 400, color: '#959595', marginLeft: 8 }}>
                                {bin.strain}
                            </span>
                        </h3>
                        <div className="trim-card-subtitle">
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {formatWeight(bin.weight)}
                            </span>
                            {bin.location && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#959595' }}>
                                    <MapPin size={12} /> {bin.location}
                                </span>
                            )}
                            {bin.status === 'curing' && (
                                <span style={{ color: '#959595' }}>Day {curingDays}</span>
                            )}
                            {nextAction && (
                                <span style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    color: nextAction.overdue ? 'var(--color-waste)' : 'var(--color-shake)',
                                    fontWeight: nextAction.overdue ? 600 : 400,
                                }}>
                                    {nextAction.overdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
                                    {nextAction.label}
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TypeChip palette="binStatus" value={bin.status} />
                        <ChevronDown size={16} className="expand-icon" />
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="trim-card-body">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Info row */}
                        <div style={{ display: 'flex', gap: 24, fontSize: '0.813rem', color: '#737373' }}>
                            <span>Harvest: {bin.harvestBatchId || '—'}</span>
                            {bin.licenseNumber && <span>License: {bin.licenseNumber}</span>}
                            <span>Bucked: {formatRelativeTime(bin.buckedAt)}</span>
                            {bin.readyAt && <span>Ready: {formatRelativeTime(bin.readyAt)}</span>}
                        </div>

                        {/* Cure log timeline (only for curing bins) */}
                        {bin.status === 'curing' && (
                            <BinCureLogTimeline
                                binId={bin.id}
                                logs={cureLogs}
                                onLogged={handleCureLogged}
                            />
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            {bin.status === 'curing' && (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleMarkReady}
                                    disabled={loading}
                                    style={{ fontSize: '0.813rem' }}
                                >
                                    <Scissors size={14} />
                                    Mark Ready for Trim
                                </button>
                            )}
                            {bin.status === 'ready' && onSendToTrim && (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSendToTrim}
                                    disabled={loading}
                                    style={{ fontSize: '0.813rem' }}
                                >
                                    <Scissors size={14} />
                                    Send to Trim
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

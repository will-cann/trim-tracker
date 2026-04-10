import React, { useState, useRef } from 'react';
import {
    ArrowRight, FileText, Scissors, Sprout, ClipboardList,
    Leaf, Radio, ChevronDown, type LucideIcon, Thermometer,
    MoveRight, Package, User, Scale, ArrowRightLeft, Trash2,
    MessageSquare, Check, Shield, Dna, DoorOpen,
} from 'lucide-react';
import { VoicePill } from './VoicePill';
import { AMBIENT_ENABLED } from '../lib/featureFlags';
import type { ConversationSummary, SpeechMode } from '../types/definitions';

// ── Setup status for first-run checklist ──
export interface FacilitySetupStatus {
    hasLicenses: boolean;
    hasStrains: boolean;
    hasRooms: boolean;
    loading: boolean;
}

const SetupChecklist: React.FC<{
    setup: FacilitySetupStatus;
    onNavigateToSettings: () => void;
}> = ({ setup, onNavigateToSettings }) => {
    const [collapsed, setCollapsed] = useState(false);

    if (setup.loading) return null;

    const steps = [
        { key: 'license', label: 'Add a facility license', desc: 'Required for harvests, sessions, and compliance', done: setup.hasLicenses, icon: Shield },
        { key: 'strain', label: 'Add your strains', desc: 'Needed for tracking harvests and plant batches', done: setup.hasStrains, icon: Dna },
        { key: 'room', label: 'Set up a room', desc: 'Used for plant map and room assignments', done: setup.hasRooms, icon: DoorOpen },
    ];

    const doneCount = steps.filter(s => s.done).length;
    if (doneCount === 3) return null; // All done — hide checklist

    return (
        <div style={{
            width: '100%',
            maxWidth: 520,
            margin: '0 auto 24px',
        }}>
            <button
                onClick={() => setCollapsed(!collapsed)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 16px',
                    background: '#FAFAFA',
                    border: '1px solid #E8E8E8',
                    borderRadius: collapsed ? 10 : '10px 10px 0 0',
                    cursor: 'pointer',
                    transition: 'border-radius 0.15s ease',
                }}
            >
                {/* Progress ring */}
                <svg width="24" height="24" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="#E8E8E8" strokeWidth="2.5" />
                    <circle
                        cx="12" cy="12" r="10" fill="none"
                        stroke="#3BB570" strokeWidth="2.5"
                        strokeDasharray={`${(doneCount / 3) * 62.83} 62.83`}
                        strokeLinecap="round"
                        transform="rotate(-90 12 12)"
                        style={{ transition: 'stroke-dasharray 0.3s ease' }}
                    />
                    <text x="12" y="12" textAnchor="middle" dominantBaseline="central"
                        style={{ fontSize: '8px', fontWeight: 700, fill: '#1A1A1A' }}>
                        {doneCount}/3
                    </text>
                </svg>
                <span style={{ flex: 1, textAlign: 'left', fontSize: '0.8125rem', fontWeight: 600, color: '#1A1A1A' }}>
                    Set up your facility
                </span>
                <ChevronDown size={14} color="#959595" style={{
                    transform: collapsed ? 'none' : 'rotate(180deg)',
                    transition: 'transform 0.15s ease',
                }} />
            </button>

            {!collapsed && (
                <div style={{
                    border: '1px solid #E8E8E8',
                    borderTop: 'none',
                    borderRadius: '0 0 10px 10px',
                    overflow: 'hidden',
                }}>
                    {steps.map((step, idx) => {
                        const Icon = step.icon;
                        return (
                            <button
                                key={step.key}
                                onClick={step.done ? undefined : onNavigateToSettings}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    width: '100%',
                                    padding: '12px 16px',
                                    background: step.done ? '#FAFAFA' : '#fff',
                                    border: 'none',
                                    borderTop: idx > 0 ? '1px solid #F1F1F1' : 'none',
                                    cursor: step.done ? 'default' : 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.1s ease',
                                    opacity: step.done ? 0.55 : 1,
                                }}
                                onMouseEnter={e => { if (!step.done) (e.currentTarget.style.background = '#F8FBF9'); }}
                                onMouseLeave={e => { if (!step.done) (e.currentTarget.style.background = '#fff'); }}
                            >
                                <div style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: step.done ? '#E8F8EE' : '#F1F1F1',
                                    flexShrink: 0,
                                }}>
                                    {step.done
                                        ? <Check size={14} color="#3BB570" strokeWidth={3} />
                                        : <Icon size={14} color="#959595" />
                                    }
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: '0.8125rem',
                                        fontWeight: 500,
                                        color: step.done ? '#959595' : '#1A1A1A',
                                        textDecoration: step.done ? 'line-through' : 'none',
                                    }}>
                                        {step.label}
                                    </div>
                                    {!step.done && (
                                        <div style={{ fontSize: '0.6875rem', color: '#959595', marginTop: 1 }}>
                                            {step.desc}
                                        </div>
                                    )}
                                </div>
                                {!step.done && (
                                    <ArrowRight size={14} color="#C0C0C0" style={{ flexShrink: 0 }} />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ── Static suggestions — one per domain, contextually useful ──
const SUGGESTIONS: { text: string; icon: LucideIcon; color: string }[] = [
    { text: 'Start a trim session', icon: Scissors, color: '#1C9EFF' },
    { text: 'Plan a harvest', icon: Sprout, color: '#FA9E52' },
    { text: 'Plant new clones', icon: Leaf, color: '#3BB570' },
    { text: 'Schedule an IPM task', icon: ClipboardList, color: '#959595' },
];

// ── Full workflow catalog ──
interface WorkflowItem { text: string; icon: LucideIcon }
interface WorkflowCategory { label: string; color: string; items: WorkflowItem[] }

const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
    {
        label: 'Trim',
        color: '#1C9EFF',
        items: [
            { text: 'Start a trim session', icon: Scissors },
            { text: 'Add batches to session', icon: Package },
            { text: 'Assign trimmers', icon: User },
            { text: 'Submit completed batches', icon: Package },
        ],
    },
    {
        label: 'Harvest & Extraction',
        color: '#FA9E52',
        items: [
            { text: 'Harvest for fresh frozen', icon: Sprout },
            { text: 'Record harvest weights', icon: Scale },
            { text: 'Allocate to flower & trim', icon: ArrowRightLeft },
            { text: 'Record extraction run', icon: Thermometer },
        ],
    },
    {
        label: 'Plants',
        color: '#3BB570',
        items: [
            { text: 'Plant new clones', icon: Leaf },
            { text: 'Move between rooms', icon: MoveRight },
            { text: 'Track plant health issue', icon: Thermometer },
            { text: 'Change growth phase', icon: Sprout },
        ],
    },
    {
        label: 'Operations',
        color: '#959595',
        items: [
            { text: 'Schedule an IPM task', icon: ClipboardList },
            { text: 'Weekly trim report', icon: Scale },
            { text: 'Flower-to-waste ratio', icon: Thermometer },
        ],
    },
];

const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

interface AIEmptyStateProps {
    onSend: (text: string) => void;
    onStartAmbient: () => void;
    onFileUpload: (file: File) => void;
    isLoading: boolean;
    isExecuting: boolean;
    // Voice
    isListening: boolean;
    voiceMode: SpeechMode;
    onToggleListening: () => void;
    onSwitchMode: (mode: SpeechMode) => void;
    micError?: string | null;
    // Conversations
    conversations: ConversationSummary[];
    onSelectConversation: (id: string) => void;
    onDeleteConversation: (id: string) => void;
    // Drag state
    isDragOver: boolean;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    // Textarea ref from parent for injected voice text
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    inputText: string;
    onInputChange: (text: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    // Setup status
    facilitySetup?: FacilitySetupStatus;
    onNavigateToSettings?: () => void;
}

export const AIEmptyState: React.FC<AIEmptyStateProps> = ({
    onSend,
    onStartAmbient,
    onFileUpload,
    isLoading,
    isExecuting,
    isListening,
    voiceMode,
    onToggleListening,
    onSwitchMode,
    micError,
    conversations,
    onSelectConversation,
    onDeleteConversation,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    textareaRef,
    inputText,
    onInputChange,
    onSubmit,
    onKeyDown,
    facilitySetup,
    onNavigateToSettings,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showAllWorkflows, setShowAllWorkflows] = useState(false);

    return (
        <div
            className="ai-home-empty"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
        >
            {/* Brand block lifted to AIHome — see ai-home-brand-block */}

            {/* Setup checklist — shown when facility config is incomplete */}
            {facilitySetup && onNavigateToSettings && (
                <SetupChecklist setup={facilitySetup} onNavigateToSettings={onNavigateToSettings} />
            )}

            {/* Primary input */}
            <form onSubmit={onSubmit} className="ai-hero-form">
                <div className="ai-hero-input">
                    <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="What needs to happen?"
                        rows={2}
                        disabled={isLoading || isExecuting}
                    />
                    <div className="ai-hero-input-actions">
                        <VoicePill
                            isListening={isListening}
                            mode={voiceMode}
                            onToggleListening={onToggleListening}
                            onSwitchMode={onSwitchMode}
                            error={micError}
                        />
                        <button
                            type="submit"
                            disabled={!inputText.trim() || isLoading || isExecuting}
                            className="ai-hero-send"
                        >
                            <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onFileUpload(file);
                        e.target.value = '';
                    }}
                    className="hidden"
                />
            </form>

            {/* Static suggestions */}
            <div className="ai-suggestions">
                {SUGGESTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                        <button
                            key={s.text}
                            onClick={() => onSend(s.text)}
                            className="ai-suggestion-chip"
                            type="button"
                            style={{
                                '--chip-color': s.color,
                                '--chip-bg': `${s.color}0D`,
                                '--chip-bg-hover': `${s.color}1A`,
                            } as React.CSSProperties}
                        >
                            <Icon size={14} />
                            {s.text}
                        </button>
                    );
                })}
            </div>

            {/* Feature cards: Ambient (gated) + Import */}
            <div className="ai-features">
                {AMBIENT_ENABLED && (
                    <button
                        className={`ai-feature-card${isListening && voiceMode === 'ambient' ? ' ai-feature-active' : ''}`}
                        onClick={onStartAmbient}
                        type="button"
                    >
                        <div className="ai-feature-icon" style={{ background: 'rgba(28,158,255,0.08)', color: '#1C9EFF' }}>
                            <Radio size={20} />
                        </div>
                        <div className="ai-feature-text">
                            <span className="ai-feature-title">Ambient Listening</span>
                            <span className="ai-feature-desc">
                                {isListening && voiceMode === 'ambient'
                                    ? 'Listening — tasks created automatically'
                                    : 'Leave the mic on — tasks captured as your team talks'}
                            </span>
                        </div>
                    </button>
                )}

                <button
                    className={`ai-feature-card${isDragOver ? ' ai-feature-drop' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                >
                    <div className="ai-feature-icon" style={{ background: 'rgba(250,158,82,0.08)', color: '#FA9E52' }}>
                        <FileText size={20} />
                    </div>
                    <div className="ai-feature-text">
                        <span className="ai-feature-title">Spreadsheet Import</span>
                        <span className="ai-feature-desc">Bulk create harvests, plants, or tag assignments from CSV</span>
                    </div>
                </button>
            </div>

            {/* Recent conversations — inline */}
            {conversations.length > 0 && (
                <div className="ai-recent">
                    <span className="ai-recent-label">Recent</span>
                    <div className="ai-recent-list">
                        {conversations.slice(0, 5).map((convo) => {
                            const Icon = convo.kind === 'ambient' ? Radio : MessageSquare;
                            return (
                                <div
                                    key={convo.id}
                                    className="ai-recent-item"
                                    onClick={() => onSelectConversation(convo.id)}
                                >
                                    <Icon size={13} className="ai-recent-icon" />
                                    <span className="ai-recent-title">{convo.title}</span>
                                    <span className="ai-recent-time">{formatRelativeTime(convo.updatedAt)}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteConversation(convo.id);
                                        }}
                                        className="ai-recent-delete"
                                        type="button"
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* All workflows — progressive disclosure */}
            <div className="ai-wf-section">
                <button
                    className={`ai-wf-toggle${showAllWorkflows ? ' open' : ''}`}
                    onClick={() => setShowAllWorkflows(v => !v)}
                    type="button"
                >
                    All workflows
                    <ChevronDown size={14} />
                </button>
                <div className={`ai-wf-expand${showAllWorkflows ? ' open' : ''}`}>
                    <div className="ai-wf-expand-inner">
                        <div className="ai-workflows">
                            {WORKFLOW_CATEGORIES.map((cat) => (
                                <div key={cat.label} className="ai-wf-group">
                                    <span className="ai-wf-label" style={{ color: cat.color }}>{cat.label}</span>
                                    <div className="ai-wf-items">
                                        {cat.items.map((w) => {
                                            const Icon = w.icon;
                                            return (
                                                <button
                                                    key={w.text}
                                                    onClick={() => onSend(w.text)}
                                                    className="ai-wf-item"
                                                    type="button"
                                                >
                                                    <Icon size={13} style={{ color: cat.color, flexShrink: 0 }} />
                                                    {w.text}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mic error */}
            {micError && (
                <p className="text-xs" style={{ color: 'var(--color-waste)' }}>{micError}</p>
            )}
        </div>
    );
};

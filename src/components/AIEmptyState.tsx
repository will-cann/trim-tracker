import React, { useState, useRef } from 'react';
import {
    ArrowRight, FileText, Scissors, Sprout, ClipboardList,
    Leaf, Radio, ChevronDown, type LucideIcon, Thermometer,
    MoveRight, Package, User, Scale, ArrowRightLeft, Trash2,
    MessageSquare,
} from 'lucide-react';
import { VoicePill } from './VoicePill';
import type { ConversationSummary, SpeechMode } from '../types/definitions';
import logo from '../assets/logo.png';

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
    // License selector (rendered by parent)
    licenseSelector?: React.ReactNode;
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
    licenseSelector,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    textareaRef,
    inputText,
    onInputChange,
    onSubmit,
    onKeyDown,
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
            {/* Brand */}
            <div className="ai-hero">
                <img src={logo} alt="neurocann" className="ai-hero-logo" />
                <h1 className="ai-hero-brand">
                    <span className="ai-hero-accent">neuro</span>cann
                </h1>
            </div>

            {/* License selector */}
            {licenseSelector}

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

            {/* Feature cards: Ambient + Import */}
            <div className="ai-features">
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
                        {conversations.slice(0, 5).map((convo) => (
                            <div
                                key={convo.id}
                                className="ai-recent-item"
                                onClick={() => onSelectConversation(convo.id)}
                            >
                                <MessageSquare size={13} className="ai-recent-icon" />
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
                        ))}
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

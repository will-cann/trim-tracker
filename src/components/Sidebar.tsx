import React, { useState } from 'react';
import { Plus, LayoutDashboard, BarChart3, Sprout, LogOut, User as UserIcon, Trash2, MessageSquare, GripVertical, Scissors, Settings, ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/authContext';
import type { ConversationSummary, TrimSession } from '../types/definitions';
import logo from '../assets/logo.png';

type ViewType = 'ai' | 'dashboard' | 'reports' | 'harvests' | 'settings' | 'tasks';

interface SidebarProps {
    currentView: ViewType;
    onViewChange: (view: ViewType) => void;
    conversations: ConversationSummary[];
    activeConversationId: string | null;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
    onDeleteConversation: (id: string) => void;
    onPanelOpenChange?: (isOpen: boolean) => void;
    activeSession: TrimSession | null;
    completedSessions: TrimSession[];
    selectedSessionId: string | null;
    onSelectSession: (sessionId: string | null) => void;
    taskCount?: number;
}

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

const navItems: { view: ViewType; icon: (color: string) => React.ReactNode; label: string }[] = [
    { view: 'dashboard', icon: (color) => <LayoutDashboard size={20} color={color} />, label: 'Trim Tracker' },
    { view: 'harvests', icon: (color) => <Sprout size={20} color={color} />, label: 'Harvest Day' },
    { view: 'tasks', icon: (color) => <ClipboardList size={20} color={color} />, label: 'Tasks' },
    { view: 'reports', icon: (color) => <BarChart3 size={20} color={color} />, label: 'Reports' },
];

export const Sidebar: React.FC<SidebarProps> = ({
    currentView,
    onViewChange,
    conversations,
    activeConversationId,
    onSelectConversation,
    onNewConversation,
    onDeleteConversation,
    onPanelOpenChange,
    activeSession,
    completedSessions,
    selectedSessionId,
    onSelectSession,
    taskCount = 0,
}) => {
    const { user, logout } = useAuth();
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const togglePanel = () => {
        const next = !isPanelOpen;
        setIsPanelOpen(next);
        onPanelOpenChange?.(next);
    };

    // Determine if the context panel has content for the current view
    const hasContextPanel = currentView === 'ai' || currentView === 'dashboard';

    // Build session list for Trim Tracker panel
    const sessionList = [
        ...(activeSession ? [{ ...activeSession, isActive: true }] : []),
        ...completedSessions.map(s => ({ ...s, isActive: false })),
    ];

    return (
        <>
            <div className="sidebar-rail">
                {/* Logo — click toggles AI panel, double-click starts new conversation */}
                <button
                    onClick={() => {
                        if (currentView === 'ai') {
                            togglePanel();
                        } else {
                            onNewConversation();
                            onViewChange('ai');
                            if (!isPanelOpen) {
                                setIsPanelOpen(true);
                                onPanelOpenChange?.(true);
                            }
                        }
                    }}
                    className={`sidebar-rail-logo ${currentView === 'ai' ? 'active' : ''}`}
                    title={currentView === 'ai' ? (isPanelOpen ? 'Hide chats' : 'Show chats') : 'New conversation'}
                >
                    <img src={logo} alt="Logo" className="w-5 h-5 object-contain brightness-0 invert" />
                </button>

                {/* Module icons — clicking active icon toggles panel */}
                <div className="sidebar-rail-nav">
                    {navItems.map(({ view, icon, label }) => {
                        const isActive = currentView === view;
                        const viewHasPanel = view === 'dashboard';
                        return (
                            <button
                                key={view}
                                className={`sidebar-rail-btn ${isActive ? 'active' : ''}`}
                                onClick={() => {
                                    if (isActive && viewHasPanel) {
                                        togglePanel();
                                    } else {
                                        onViewChange(view);
                                        if (viewHasPanel && !isPanelOpen) {
                                            setIsPanelOpen(true);
                                            onPanelOpenChange?.(true);
                                        }
                                    }
                                }}
                                title={label}
                            >
                                <span className="relative">
                                    {icon(isActive ? '#10b981' : '#6b7280')}
                                    {view === 'tasks' && taskCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 bg-teal-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
                                            {taskCount > 99 ? '99+' : taskCount}
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Bottom: settings, user, logout */}
                <div className="sidebar-rail-bottom">
                    <button
                        className={`sidebar-rail-btn ${currentView === 'settings' ? 'active' : ''}`}
                        onClick={() => onViewChange('settings')}
                        title="Settings"
                    >
                        <Settings size={18} color={currentView === 'settings' ? '#10b981' : '#6b7280'} />
                    </button>
                    {user && (
                        <div
                            className="sidebar-rail-avatar"
                            title={user.name || user.email || 'User'}
                        >
                            {user.picture ? (
                                <img src={user.picture} alt="" className="w-full h-full object-cover rounded-full" />
                            ) : (
                                <UserIcon size={16} />
                            )}
                        </div>
                    )}
                    <button
                        className="sidebar-rail-btn"
                        onClick={logout}
                        title="Logout"
                    >
                        <LogOut size={18} color="#ef4444" />
                    </button>
                </div>
            </div>

            {/* Expand tab — contextual icon on rail edge when panel is collapsed */}
            {hasContextPanel && !isPanelOpen && (
                <button
                    className="sidebar-expand-tab"
                    onClick={togglePanel}
                    title={currentView === 'ai' ? 'Chat history' : 'Trim sessions'}
                >
                    {currentView === 'ai'
                        ? <MessageSquare size={12} />
                        : <Scissors size={12} />
                    }
                </button>
            )}

            {/* Click-away overlay for left panel */}
            {hasContextPanel && isPanelOpen && (
                <div className="sidebar-panel-overlay" onClick={togglePanel} />
            )}

            {/* Context panel — slides in/out based on view */}
            {hasContextPanel && (
                <div className={`sidebar-panel ${isPanelOpen ? 'open' : 'closed'}`}>
                    {/* Panel edge grip — always visible when open */}
                    {isPanelOpen && (
                        <div
                            className="sidebar-panel-grip"
                            onClick={togglePanel}
                            title="Collapse panel"
                        >
                            <GripVertical size={14} />
                        </div>
                    )}

                    {isPanelOpen && (
                        <div className="sidebar-panel-content">
                            {/* AI View: Conversation history */}
                            {currentView === 'ai' && (
                                <>
                                    <div className="sidebar-panel-header">
                                        <h3>
                                            <span className="text-emerald-500">neuro</span><span className="text-gray-900">cann</span>
                                        </h3>
                                    </div>

                                    <button
                                        onClick={() => {
                                            onNewConversation();
                                            onViewChange('ai');
                                        }}
                                        className="sidebar-panel-new-btn"
                                    >
                                        <Plus size={16} />
                                        <span>New chat</span>
                                    </button>

                                    {conversations.length > 0 && (
                                        <div className="conversation-history">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Recent</h4>
                                            <div className="conversation-list">
                                                {conversations.map((convo) => (
                                                    <div
                                                        key={convo.id}
                                                        className={`conversation-item ${activeConversationId === convo.id ? 'active' : ''}`}
                                                        onClick={() => {
                                                            onSelectConversation(convo.id);
                                                            onViewChange('ai');
                                                        }}
                                                    >
                                                        <MessageSquare size={14} className="shrink-0 text-gray-400" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-gray-700 truncate">{convo.title}</p>
                                                            <p className="text-xs text-gray-400">{formatRelativeTime(convo.updatedAt)}</p>
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteConversation(convo.id);
                                                            }}
                                                            className="sidebar-convo-delete"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Dashboard View: Trim Sessions */}
                            {currentView === 'dashboard' && (
                                <>
                                    <div className="sidebar-panel-header">
                                        <h3>Trim Sessions</h3>
                                        <span className="text-xs text-gray-400">{sessionList.length}</span>
                                    </div>

                                    <div className="conversation-list">
                                        {sessionList.length === 0 ? (
                                            <p className="text-sm text-gray-400 px-2 py-4 text-center">No sessions yet.</p>
                                        ) : (
                                            sessionList.map((s) => {
                                                const strains = [...new Set(s.entries.map(e => e.strain))].join(', ');
                                                const date = s.startTime
                                                    ? new Date(s.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                    : '';
                                                const isSelected = 'isActive' in s && s.isActive
                                                    ? selectedSessionId === null
                                                    : selectedSessionId === s.id;
                                                return (
                                                    <div
                                                        key={s.id}
                                                        className={`conversation-item ${isSelected ? 'active' : ''}`}
                                                        onClick={() => {
                                                            if ('isActive' in s && s.isActive) {
                                                                onSelectSession(null);
                                                            } else {
                                                                onSelectSession(s.id);
                                                            }
                                                            onViewChange('dashboard');
                                                        }}
                                                    >
                                                        <Scissors size={14} className={`shrink-0 ${'isActive' in s && s.isActive ? 'text-emerald-500' : 'text-gray-400'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-gray-700 truncate">
                                                                {strains || 'No batches'}
                                                            </p>
                                                            <p className="text-xs text-gray-400">
                                                                {date}
                                                                {'isActive' in s && s.isActive && (
                                                                    <span className="ml-1.5 text-emerald-500 font-medium">Active</span>
                                                                )}
                                                                {s.completedAt && ' — Completed'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

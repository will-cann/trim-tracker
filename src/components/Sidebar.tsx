import React, { useState } from 'react';
import { Plus, PanelLeft, PanelLeftClose, LayoutDashboard, BarChart3, Sprout, LogOut, User as UserIcon, Trash2, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/authContext';
import type { TrimmerProfile, ConversationSummary } from '../types/definitions';
import { AddTrimmerProfileModal } from './AddTrimmerProfileModal';
import logo from '../assets/logo.png';

type ViewType = 'ai' | 'dashboard' | 'reports' | 'harvests';

interface SidebarProps {
    profiles: TrimmerProfile[];
    onAddProfile: (name: string) => void;
    onDeleteProfile: (id: string) => void;
    currentView: ViewType;
    onViewChange: (view: ViewType) => void;
    conversations: ConversationSummary[];
    activeConversationId: string | null;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
    onDeleteConversation: (id: string) => void;
    onPanelOpenChange?: (isOpen: boolean) => void;
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
    { view: 'reports', icon: (color) => <BarChart3 size={20} color={color} />, label: 'Reports' },
];

export const Sidebar: React.FC<SidebarProps> = ({
    profiles,
    onAddProfile,
    onDeleteProfile,
    currentView,
    onViewChange,
    conversations,
    activeConversationId,
    onSelectConversation,
    onNewConversation,
    onDeleteConversation,
    onPanelOpenChange,
}) => {
    const { user, logout } = useAuth();
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const togglePanel = () => {
        const next = !isPanelOpen;
        setIsPanelOpen(next);
        onPanelOpenChange?.(next);
    };

    const handleAddSubmit = (name: string) => {
        onAddProfile(name);
        setIsModalOpen(false);
    };

    // Determine if the context panel has content for the current view
    const hasContextPanel = currentView === 'ai' || currentView === 'dashboard';

    return (
        <>
            <div className="sidebar-rail">
                {/* Logo */}
                <button
                    onClick={() => {
                        onNewConversation();
                        onViewChange('ai');
                    }}
                    className="sidebar-rail-logo"
                    title="New conversation"
                >
                    <img src={logo} alt="Logo" className="w-5 h-5 object-contain brightness-0 invert" />
                </button>

                {/* Module icons */}
                <div className="sidebar-rail-nav">
                    {navItems.map(({ view, icon, label }) => (
                        <button
                            key={view}
                            className={`sidebar-rail-btn ${currentView === view ? 'active' : ''}`}
                            onClick={() => onViewChange(view)}
                            title={label}
                        >
                            {icon(currentView === view ? '#10b981' : '#9ca3af')}
                        </button>
                    ))}
                </div>

                {/* Bottom: user avatar + logout */}
                <div className="sidebar-rail-bottom">
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

            {/* Context panel — slides in/out based on view */}
            {hasContextPanel && (
                <div className={`sidebar-panel ${isPanelOpen ? 'open' : 'closed'}`}>
                    {/* Panel toggle */}
                    <button
                        className="sidebar-panel-toggle"
                        onClick={togglePanel}
                        title={isPanelOpen ? 'Collapse' : 'Expand'}
                    >
                        {isPanelOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
                    </button>

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

                            {/* Dashboard View: Trimmer roster */}
                            {currentView === 'dashboard' && (
                                <>
                                    <div className="sidebar-panel-header">
                                        <h3>Trimmer Roster</h3>
                                        <span className="text-xs text-gray-400">{profiles.length}</span>
                                    </div>

                                    <div className="roster-list">
                                        {profiles.length === 0 ? (
                                            <p className="empty-roster">No trimmers in roster.</p>
                                        ) : (
                                            profiles.map(profile => (
                                                <div key={profile.id} className="roster-item">
                                                    <div className="roster-info">
                                                        <span className="roster-name">{profile.name}</span>
                                                        <span className="roster-status">{profile.status}</span>
                                                    </div>
                                                    <button
                                                        className="btn-delete-roster"
                                                        onClick={() => onDeleteProfile(profile.id)}
                                                        title="Remove from roster"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <button className="btn-add-roster" onClick={() => setIsModalOpen(true)}>
                                        <Plus size={16} />
                                        Add Trimmer
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {isModalOpen && (
                <AddTrimmerProfileModal
                    onClose={() => setIsModalOpen(false)}
                    onSubmit={handleAddSubmit}
                />
            )}
        </>
    );
};

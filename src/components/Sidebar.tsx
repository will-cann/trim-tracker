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
}) => {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleAddSubmit = (name: string) => {
        onAddProfile(name);
        setIsModalOpen(false);
    };

    const navItems: { view: ViewType; icon: (color: string) => React.ReactNode; label: string }[] = [
        { view: 'dashboard', icon: (color) => <LayoutDashboard size={20} color={color} />, label: 'Trim Tracker' },
        { view: 'harvests', icon: (color) => <Sprout size={20} color={color} />, label: 'Harvest Day' },
        { view: 'reports', icon: (color) => <BarChart3 size={20} color={color} />, label: 'Reports' },
    ];

    return (
        <>
            <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
                {/* Header — Logo as new conversation trigger */}
                <div className="sidebar-header">
                    <div className="header-content">
                        <button
                            onClick={() => {
                                onNewConversation();
                                onViewChange('ai');
                            }}
                            className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center overflow-hidden shrink-0
                                       hover:bg-emerald-600 transition-colors cursor-pointer border-0"
                            title="New conversation"
                        >
                            <img src={logo} alt="Logo" className="w-6 h-6 object-contain brightness-0 invert" />
                        </button>
                        {isOpen && (
                            <h3
                                onClick={() => {
                                    onNewConversation();
                                    onViewChange('ai');
                                }}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                            >
                                <span className="text-emerald-500">neuro</span><span className="text-gray-900">cann</span>
                            </h3>
                        )}
                    </div>
                </div>

                {/* Toggle button — appears on hover at the right edge, vertically centered */}
                <button
                    className="sidebar-toggle-hover"
                    onClick={() => setIsOpen(!isOpen)}
                    title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                    {isOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
                </button>

                {isOpen && (
                    <div className="sidebar-content">
                        {/* New Chat Button */}
                        <button
                            onClick={() => {
                                onNewConversation();
                                onViewChange('ai');
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #e5e7eb',
                                fontSize: '0.8125rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                backgroundColor: 'transparent',
                                color: '#374151',
                                width: '100%',
                                marginBottom: '0.5rem',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f0fdf4';
                                e.currentTarget.style.borderColor = '#86efac';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.borderColor = '#e5e7eb';
                            }}
                        >
                            <Plus size={16} />
                            <span>New chat</span>
                        </button>

                        {/* Conversation History */}
                        {conversations.length > 0 && (
                            <div className="conversation-history">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Recent</h4>
                                <div className="conversation-list">
                                    {conversations.map((convo) => (
                                        <div
                                            key={convo.id}
                                            className={`conversation-item ${
                                                currentView === 'ai' && activeConversationId === convo.id ? 'active' : ''
                                            }`}
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
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-all"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Navigation */}
                        <div className="nav-links" style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Views</h4>
                            {navItems.map(({ view, icon, label }) => (
                                <button
                                    key={view}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '0.5rem',
                                        border: 'none',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        width: '100%',
                                        backgroundColor: currentView === view ? '#10b981' : 'transparent',
                                        color: currentView === view ? 'white' : '#374151',
                                        boxShadow: currentView === view ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                                    }}
                                    onClick={() => onViewChange(view)}
                                    onMouseEnter={(e) => {
                                        if (currentView !== view) {
                                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (currentView !== view) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    {icon(currentView === view ? 'white' : '#6b7280')}
                                    <span>{label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Trimmer Roster — collapsed section */}
                        <details className="mt-3 border-t pt-3 border-gray-200">
                            <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 cursor-pointer hover:text-gray-600 list-none flex items-center justify-between">
                                Trimmer Roster
                                <span className="text-gray-300 text-[10px] font-normal normal-case">{profiles.length}</span>
                            </summary>
                            <div className="roster-list mt-2">
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
                        </details>

                        {/* User and Logout Section */}
                        <div className="border-t mt-auto pt-4 space-y-2">
                            {user && (
                                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 overflow-hidden">
                                        {user.picture ? (
                                            <img src={user.picture} alt={user.name || 'User'} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserIcon size={16} />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">{user.name || user.email}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{user.role || 'User'}</p>
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={logout}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.625rem 0.75rem',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    width: '100%',
                                    backgroundColor: 'transparent',
                                    color: '#ef4444'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <LogOut size={20} />
                                <span>Logout</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <AddTrimmerProfileModal
                    onClose={() => setIsModalOpen(false)}
                    onSubmit={handleAddSubmit}
                />
            )}
        </>
    );
};

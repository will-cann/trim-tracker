import React, { useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, LayoutDashboard, BarChart3, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/authContext';
import type { TrimmerProfile } from '../types/definitions';
import { AddTrimmerProfileModal } from './AddTrimmerProfileModal';
import logo from '../assets/logo.png';

interface SidebarProps {
    profiles: TrimmerProfile[];
    onAddProfile: (name: string) => void;
    onDeleteProfile: (id: string) => void;
    currentView: 'dashboard' | 'reports';
    onViewChange: (view: 'dashboard' | 'reports') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    profiles,
    onAddProfile,
    onDeleteProfile,
    currentView,
    onViewChange
}) => {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleAddSubmit = (name: string) => {
        onAddProfile(name);
        setIsModalOpen(false);
    };

    return (
        <>
            <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <div className="header-content">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center overflow-hidden shrink-0">
                            <img src={logo} alt="Logo" className="w-6 h-6 object-contain brightness-0 invert" />
                        </div>
                        {isOpen && <h3>Trim Tracker</h3>}
                    </div>
                    <button className="toggle-btn" onClick={() => setIsOpen(!isOpen)}>
                        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>
                </div>

                {isOpen && (
                    <div className="sidebar-content">
                        <div className="nav-links mb-6 flex flex-col gap-1" style={{ marginBottom: '1.5rem' }}>
                            <button
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
                                    backgroundColor: currentView === 'dashboard' ? '#10b981' : 'transparent',
                                    color: currentView === 'dashboard' ? 'white' : '#374151',
                                    boxShadow: currentView === 'dashboard' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none'
                                }}
                                onClick={() => onViewChange('dashboard')}
                                onMouseEnter={(e) => {
                                    if (currentView !== 'dashboard') {
                                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (currentView !== 'dashboard') {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }
                                }}
                            >
                                <LayoutDashboard size={20} color={currentView === 'dashboard' ? 'white' : '#6b7280'} />
                                <span>Dashboard</span>
                            </button>
                            <button
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
                                    backgroundColor: currentView === 'reports' ? '#10b981' : 'transparent',
                                    color: currentView === 'reports' ? 'white' : '#374151',
                                    boxShadow: currentView === 'reports' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none'
                                }}
                                onClick={() => onViewChange('reports')}
                                onMouseEnter={(e) => {
                                    if (currentView !== 'reports') {
                                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (currentView !== 'reports') {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }
                                }}
                            >
                                <BarChart3 size={20} color={currentView === 'reports' ? 'white' : '#6b7280'} />
                                <span>Reports</span>
                            </button>
                        </div>

                        <div className="roster-section border-t pt-4">
                            <div className="flex items-center justify-between mb-2 px-2">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trimmer Roster</h4>
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
                        </div>

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


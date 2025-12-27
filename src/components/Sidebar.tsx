import React, { useState } from 'react';
import { Users, Plus, Trash2, ChevronLeft, ChevronRight, LayoutDashboard, BarChart3 } from 'lucide-react';
import type { TrimmerProfile } from '../types/definitions';
import { AddTrimmerProfileModal } from './AddTrimmerProfileModal';

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
                        <Users size={20} />
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


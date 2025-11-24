import React, { useState } from 'react';
import { Users, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TrimmerProfile } from '../types/definitions';
import { AddTrimmerProfileModal } from './AddTrimmerProfileModal';

interface SidebarProps {
    profiles: TrimmerProfile[];
    onAddProfile: (name: string) => void;
    onDeleteProfile: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ profiles, onAddProfile, onDeleteProfile }) => {
    const [isOpen, setIsOpen] = useState(true);
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
                        {isOpen && <h3>Trimmer Roster</h3>}
                    </div>
                    <button className="toggle-btn" onClick={() => setIsOpen(!isOpen)}>
                        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>
                </div>

                {isOpen && (
                    <div className="sidebar-content">
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

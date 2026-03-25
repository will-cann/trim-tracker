import React, { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { TrimmerProfile, TrimSession } from '../types/definitions';

interface RightPanelProps {
    trimmerProfiles: TrimmerProfile[];
    onAddProfile: (name: string) => void;
    onDeleteProfile: (id: string) => void;
    isOpen: boolean;
    onToggle: () => void;
    session: TrimSession | null;
}

export const RightPanel: React.FC<RightPanelProps> = ({
    trimmerProfiles,
    session,
    onAddProfile,
    onDeleteProfile,
    isOpen,
    onToggle,
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');

    // Build set of profile IDs assigned to the active session
    const assignedProfileIds = new Set(
        session?.entries.flatMap(e =>
            e.trimmers.filter(t => t.profileId).map(t => t.profileId!)
        ) || []
    );

    const handleAdd = () => {
        const trimmed = newName.trim();
        if (trimmed) {
            onAddProfile(trimmed);
        }
        setNewName('');
        setIsAdding(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAdd();
        if (e.key === 'Escape') { setNewName(''); setIsAdding(false); }
    };

    return (
        <>
            {/* Expand tab when collapsed */}
            {!isOpen && (
                <button
                    className="right-expand-tab"
                    onClick={onToggle}
                    title="Show trimmer roster"
                >
                    <GripVertical size={12} />
                </button>
            )}

            <div className={`right-panel ${isOpen ? 'open' : 'closed'}`}>
                {/* Grip handle on left edge */}
                {isOpen && (
                    <div
                        className="right-panel-grip"
                        onClick={onToggle}
                        title="Collapse panel"
                    >
                        <GripVertical size={14} />
                    </div>
                )}

                {isOpen && (
                    <div className="right-panel-content">
                        {/* Header */}
                        <div className="right-panel-header">
                            <h3>Trimmer Roster</h3>
                            <span className="text-xs text-gray-400">{trimmerProfiles.length}</span>
                        </div>

                        {/* Add button / inline input */}
                        {isAdding ? (
                            <div className="right-panel-add-input">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onBlur={handleAdd}
                                    placeholder="Trimmer name..."
                                    autoFocus
                                    className="w-full text-sm px-3 py-2 border border-emerald-300 rounded-lg
                                               focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                            </div>
                        ) : (
                            <button
                                className="right-panel-add-btn"
                                onClick={() => setIsAdding(true)}
                            >
                                <Plus size={14} />
                                <span>Add trimmer</span>
                            </button>
                        )}

                        {/* Profile list */}
                        <div className="right-panel-list">
                            {trimmerProfiles.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">
                                    No trimmers yet
                                </p>
                            ) : (
                                trimmerProfiles.map(profile => (
                                    <div key={profile.id} className="right-panel-item">
                                        <div
                                            className={`trimmer-status-dot ${assignedProfileIds.has(profile.id) ? 'assigned' : 'available'}`}
                                            title={assignedProfileIds.has(profile.id) ? 'In session' : 'Available'}
                                        />
                                        <span className="flex-1 text-sm text-gray-700 truncate">
                                            {profile.name}
                                        </span>
                                        <button
                                            className="right-panel-item-delete"
                                            onClick={() => onDeleteProfile(profile.id)}
                                            title="Remove trimmer"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

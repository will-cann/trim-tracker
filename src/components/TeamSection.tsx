import React, { useState } from 'react';
import { Plus, Trash2, Users, Pencil, Check, X, ArrowRight } from 'lucide-react';
import type { TrimmerProfile, TeamRole } from '../types/definitions';
import { apiService } from '../services/apiService';

interface TeamSectionProps {
    profiles: TrimmerProfile[];
    onReload: () => void;
    onNavigateToTeam?: () => void;
}

const ROLE_LABELS: Record<TeamRole, string> = {
    admin: 'Admin',
    director: 'Director',
    department_manager: 'Manager',
    technician: 'Technician',
};

const ROLE_COLORS: Record<TeamRole, string> = {
    admin: 'bg-blue-100 text-blue-700',
    director: 'bg-blue-100 text-blue-700',
    department_manager: 'bg-amber-100 text-amber-700',
    technician: 'bg-gray-100 text-gray-600',
};

export const TeamSection: React.FC<TeamSectionProps> = ({ profiles, onReload, onNavigateToTeam }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState<TeamRole>('technician');
    const [newEmail, setNewEmail] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState<{ name: string; role: TeamRole; email: string }>({ name: '', role: 'technician', email: '' });

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name) { setIsAdding(false); return; }
        await apiService.addTrimmerProfile(name, newRole, newEmail.trim() || undefined);
        setNewName('');
        setNewRole('technician');
        setNewEmail('');
        setIsAdding(false);
        onReload();
    };

    const handleEdit = (profile: TrimmerProfile) => {
        setEditingId(profile.id);
        setEditData({ name: profile.name, role: profile.role || 'technician', email: profile.email || '' });
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        await apiService.updateTrimmerProfile(editingId, {
            name: editData.name.trim() || undefined,
            role: editData.role,
            email: editData.email.trim() || undefined,
        });
        setEditingId(null);
        onReload();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this team member? This cannot be undone.')) return;
        await apiService.deleteTrimmerProfile(id);
        onReload();
    };

    const activeProfiles = profiles.filter(p => p.status === 'active');
    const inactiveProfiles = profiles.filter(p => p.status === 'inactive');

    return (
        <div className="trim-card !p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Team Members</h3>
                    <span className="text-xs text-gray-400">{activeProfiles.length} active</span>
                </div>
                <div className="flex items-center gap-2">
                    {onNavigateToTeam && (
                        <button
                            onClick={onNavigateToTeam}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                            Manage Team <ArrowRight size={12} />
                        </button>
                    )}
                    {!isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="btn-new-batch text-sm px-3 py-1.5"
                        >
                            <Plus size={14} />
                            Add Member
                        </button>
                    )}
                </div>
            </div>

            {/* Add form */}
            {isAdding && (
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Full name"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg
                                       focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                        />
                        <select
                            value={newRole}
                            onChange={e => setNewRole(e.target.value as TeamRole)}
                            className="text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white
                                       focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                        >
                            <option value="technician">Technician</option>
                            <option value="department_manager">Manager</option>
                            <option value="director">Director</option>
                            <option value="admin">Admin</option>
                        </select>
                        <input
                            type="email"
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            placeholder="Email (optional)"
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="w-48 text-sm px-3 py-2 border border-gray-200 rounded-lg
                                       focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            className="text-sm font-medium px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors border-none cursor-pointer"
                        >
                            Add
                        </button>
                        <button
                            onClick={() => { setIsAdding(false); setNewName(''); setNewEmail(''); }}
                            className="text-sm px-3 py-1.5 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors border-none cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Team list */}
            {profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Users size={20} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No team members yet</p>
                    <p className="text-xs text-gray-400 mt-1">Add your crew to assign them tasks and track work.</p>
                </div>
            ) : (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left px-5 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Name</th>
                            <th className="text-left px-5 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Role</th>
                            <th className="text-left px-5 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Email</th>
                            <th className="w-20"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...activeProfiles, ...inactiveProfiles].map(profile => (
                            <tr
                                key={profile.id}
                                className={`border-b border-gray-100 strain-table-row ${profile.status === 'inactive' ? 'opacity-50' : ''}`}
                            >
                                {editingId === profile.id ? (
                                    <>
                                        <td className="px-5 py-2">
                                            <input
                                                type="text"
                                                value={editData.name}
                                                onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                                                autoFocus
                                                className="text-sm px-2 py-1 border border-emerald-300 rounded w-full
                                                           focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            />
                                        </td>
                                        <td className="px-5 py-2">
                                            <select
                                                value={editData.role}
                                                onChange={e => setEditData(d => ({ ...d, role: e.target.value as TeamRole }))}
                                                className="text-sm px-2 py-1 border border-emerald-300 rounded bg-white
                                                           focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            >
                                                <option value="technician">Technician</option>
                                                <option value="department_manager">Manager</option>
                                                <option value="director">Director</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </td>
                                        <td className="px-5 py-2">
                                            <input
                                                type="email"
                                                value={editData.email}
                                                onChange={e => setEditData(d => ({ ...d, email: e.target.value }))}
                                                placeholder="Email"
                                                className="text-sm px-2 py-1 border border-emerald-300 rounded w-full
                                                           focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex gap-1">
                                                <button onClick={handleSaveEdit} className="p-1 text-emerald-500 hover:bg-emerald-50 rounded transition-colors">
                                                    <Check size={14} />
                                                </button>
                                                <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="px-5 py-3 font-medium text-gray-900">{profile.name}</td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[profile.role || 'technician']}`}>
                                                {ROLE_LABELS[profile.role || 'technician']}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-500">{profile.email || '—'}</td>
                                        <td className="px-2 py-3">
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 strain-table-row-actions">
                                                <button
                                                    onClick={() => handleEdit(profile)}
                                                    className="strain-delete-btn"
                                                    title="Edit"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(profile.id)}
                                                    className="strain-delete-btn"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

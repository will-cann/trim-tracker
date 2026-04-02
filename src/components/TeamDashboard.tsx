import { useState, useRef, useEffect } from 'react';
import {
    Users, UserCheck, UserX, Mail, Plus, Check, Trash2,
    ArrowUp, ArrowDown, ChevronsUpDown, Send, Copy, CheckCircle,
} from 'lucide-react';
import type { TrimmerProfile, TeamRole } from '../types/definitions';
import { apiService } from '../services/apiService';
import { Modal, Badge, FilterToolbar } from './ui';
import type { FilterDef, SortOption } from './ui';

// ── Config ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<TeamRole, string> = {
    admin: 'Admin',
    manager: 'Manager',
    lead: 'Lead',
    worker: 'Worker',
};

const ROLE_BADGE: Record<TeamRole, { bg: string; color: string }> = {
    admin: { bg: 'bg-blue-50', color: 'text-blue-600' },
    manager: { bg: 'bg-blue-50', color: 'text-blue-600' },
    lead: { bg: 'bg-amber-50', color: 'text-amber-600' },
    worker: { bg: 'bg-gray-100', color: 'text-gray-600' },
};

const ROLE_DOTS: Record<TeamRole, string> = {
    admin: 'bg-blue-500',
    manager: 'bg-blue-400',
    lead: 'bg-amber-500',
    worker: 'bg-gray-400',
};

function formatRelativeTime(dateStr: string): string {
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Inline Editing Cells ─────────────────────────────────────────────────────

const InlineTextCell = ({
    value,
    placeholder,
    onSave,
}: {
    value: string;
    placeholder: string;
    onSave: (val: string) => void;
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
    useEffect(() => { setDraft(value); }, [value]);

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) onSave(trimmed);
        else setDraft(value);
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
                }}
                className="text-sm text-gray-700 bg-white border border-emerald-300 rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder={placeholder}
            />
        );
    }

    return (
        <button
            onClick={() => setEditing(true)}
            className="flex items-center text-left w-full group/cell min-h-[28px]"
        >
            {value ? (
                <span className="text-sm text-gray-700 group-hover/cell:text-gray-900 transition-colors">{value}</span>
            ) : (
                <span className="text-sm text-gray-300 group-hover/cell:text-gray-400 transition-colors">{placeholder}</span>
            )}
        </button>
    );
};

const InlineRoleCell = ({
    value,
    onSave,
}: {
    value: TeamRole;
    onSave: (role: TeamRole) => void;
}) => {
    const [open, setOpen] = useState(false);
    const badge = ROLE_BADGE[value];

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="group/cell"
            >
                <Badge variant="custom" bg={badge.bg} color={badge.color} className="cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition-all">
                    {ROLE_LABELS[value]}
                </Badge>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-8 z-30 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-40">
                        {(Object.keys(ROLE_LABELS) as TeamRole[]).map((role) => (
                            <button
                                key={role}
                                onClick={() => { onSave(role); setOpen(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${role === value ? 'text-emerald-600 font-medium' : 'text-gray-700'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${ROLE_DOTS[role]}`} />
                                {ROLE_LABELS[role]}
                                {role === value && <Check size={14} className="ml-auto text-emerald-500" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// ── Member Row ──────────────────────────────────────────────────────────────

const MemberRow = ({
    profile,
    onUpdate,
    onSendInvite,
    onDelete,
}: {
    profile: TrimmerProfile;
    onUpdate: (id: string, updates: Partial<TrimmerProfile>) => Promise<void>;
    onSendInvite: (id: string) => Promise<string | undefined>;
    onDelete: (id: string) => Promise<void>;
}) => {
    const [showActions, setShowActions] = useState(false);
    const [inviting, setInviting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const isInactive = profile.status === 'inactive';

    const handleInvite = async () => {
        setInviting(true);
        try {
            const url = await onSendInvite(profile.id);
            if (url) setInviteUrl(url);
        } finally {
            setInviting(false);
        }
    };

    const handleCopyLink = async () => {
        if (!inviteUrl) return;
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDelete = async () => {
        await onDelete(profile.id);
        setConfirmDelete(false);
    };

    const toggleStatus = () => {
        onUpdate(profile.id, { status: isInactive ? 'active' : 'inactive' });
    };

    const inviteStatusBadge = () => {
        switch (profile.inviteStatus) {
            case 'pending':
                return (
                    <Badge variant="upcoming" className="text-[11px]">
                        Invite sent {profile.invitedAt && <span className="ml-1 opacity-70">{formatRelativeTime(profile.invitedAt)}</span>}
                    </Badge>
                );
            case 'accepted':
                return <Badge variant="complete" className="text-[11px]">Accepted</Badge>;
            default:
                return profile.email
                    ? <span className="text-xs text-gray-400">Not invited</span>
                    : <span className="text-xs text-gray-300">No email</span>;
        }
    };

    return (
        <>
            <tr
                className={`group border-b border-gray-100 hover:bg-gray-50/60 transition-colors ${isInactive ? 'opacity-50' : ''}`}
                onMouseEnter={() => setShowActions(true)}
                onMouseLeave={() => setShowActions(false)}
            >
                {/* Avatar + Name */}
                <td className="pl-5 pr-2 py-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0">
                            {profile.name.charAt(0).toUpperCase()}
                        </div>
                        <InlineTextCell
                            value={profile.name}
                            placeholder="Name"
                            onSave={(val) => onUpdate(profile.id, { name: val })}
                        />
                    </div>
                </td>

                {/* Role */}
                <td className="px-3 py-3">
                    <InlineRoleCell
                        value={profile.role || 'worker'}
                        onSave={(role) => onUpdate(profile.id, { role })}
                    />
                </td>

                {/* Email */}
                <td className="px-3 py-3 hidden md:table-cell">
                    <InlineTextCell
                        value={profile.email || ''}
                        placeholder="Add email"
                        onSave={(val) => onUpdate(profile.id, { email: val })}
                    />
                </td>

                {/* Invite Status */}
                <td className="px-3 py-3 hidden lg:table-cell">
                    {inviteStatusBadge()}
                </td>

                {/* Status */}
                <td className="px-3 py-3 hidden sm:table-cell">
                    <button
                        onClick={toggleStatus}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                            isInactive
                                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                    >
                        {isInactive ? 'Inactive' : 'Active'}
                    </button>
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right">
                    <div className={`flex items-center justify-end gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}>
                        {/* Send / Resend invite */}
                        <button
                            onClick={handleInvite}
                            disabled={!profile.email || inviting}
                            title={!profile.email ? 'Add an email to send invite' : profile.inviteStatus === 'pending' ? 'Resend invite' : 'Send invite'}
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send size={14} />
                        </button>

                        {/* Toggle active/inactive */}
                        <button
                            onClick={toggleStatus}
                            title={isInactive ? 'Activate' : 'Deactivate'}
                            className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                            {isInactive ? <UserCheck size={14} /> : <UserX size={14} />}
                        </button>

                        {/* Delete */}
                        <button
                            onClick={() => setConfirmDelete(true)}
                            title="Remove member"
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </td>
            </tr>

            {confirmDelete && (
                <tr>
                    <td colSpan={6}>
                        <Modal
                            title="Remove Team Member"
                            contentClassName="delete-modal"
                            onClose={() => setConfirmDelete(false)}
                            footer={
                                <div className="flex items-center gap-2 justify-end">
                                    <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
                                    <button className="btn-delete-confirm" onClick={handleDelete}>Remove</button>
                                </div>
                            }
                        >
                            <p className="text-sm text-gray-600">
                                Are you sure you want to remove <strong>{profile.name}</strong> from the team? This action cannot be undone.
                            </p>
                        </Modal>
                    </td>
                </tr>
            )}

            {inviteUrl && (
                <tr>
                    <td colSpan={6}>
                        <Modal
                            title="Invite Link"
                            titleIcon={<Mail size={20} className="text-emerald-500" />}
                            contentClassName="creation-modal"
                            onClose={() => setInviteUrl(null)}
                            footer={
                                <div className="flex items-center gap-2 justify-end">
                                    <button className="btn-cancel" onClick={() => setInviteUrl(null)}>Done</button>
                                    <button className="btn-primary" onClick={handleCopyLink}>
                                        {copied ? <><CheckCircle size={14} /> Copied</> : <><Copy size={14} /> Copy Link</>}
                                    </button>
                                </div>
                            }
                        >
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600">
                                    Share this link with <strong>{profile.name}</strong> to let them set up their account. The link expires in 7 days.
                                </p>
                                <div
                                    onClick={handleCopyLink}
                                    className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 break-all cursor-pointer hover:bg-gray-100 transition-colors select-all"
                                >
                                    {inviteUrl}
                                </div>
                            </div>
                        </Modal>
                    </td>
                </tr>
            )}
        </>
    );
};

// ── Add Member Modal ────────────────────────────────────────────────────────

const AddMemberModal = ({
    onClose,
    onSubmit,
}: {
    onClose: () => void;
    onSubmit: (name: string, role: TeamRole, email?: string) => Promise<void>;
}) => {
    const [name, setName] = useState('');
    const [role, setRole] = useState<TeamRole>('worker');
    const [email, setEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => { nameRef.current?.focus(); }, []);

    const handleSubmit = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await onSubmit(name.trim(), role, email.trim() || undefined);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Add Team Member"
            contentClassName="creation-modal"
            titleIcon={<Users size={20} className="text-emerald-500" />}
            onClose={onClose}
            footer={
                <div className="flex items-center gap-2 justify-end">
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        disabled={!name.trim() || saving}
                        onClick={handleSubmit}
                    >
                        {saving ? 'Adding...' : 'Add Member'}
                    </button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="field">
                    <label className="field-label">Name <span className="text-red-400">*</span></label>
                    <input
                        ref={nameRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                        placeholder="Full name"
                        className="field-input"
                    />
                </div>
                <div className="field">
                    <label className="field-label">Role</label>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as TeamRole)}
                        className="field-input"
                    >
                        {(Object.keys(ROLE_LABELS) as TeamRole[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                    </select>
                </div>
                <div className="field">
                    <label className="field-label">Email</label>
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                        placeholder="email@company.com"
                        type="email"
                        className="field-input"
                    />
                    <p className="field-hint">An invitation will be sent if email is provided</p>
                </div>
            </div>
        </Modal>
    );
};

// ── Sortable Header ─────────────────────────────────────────────────────────

type SortField = 'name' | 'role' | 'email' | 'inviteStatus' | 'status' | 'createdAt';

const SortableHeader = ({
    label,
    field,
    activeSort,
    sortDir,
    onSort,
    className = '',
}: {
    label: string;
    field: SortField;
    activeSort: SortField | null;
    sortDir: 'asc' | 'desc';
    onSort: (field: SortField) => void;
    className?: string;
}) => {
    const isActive = activeSort === field;
    return (
        <th
            className={`px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
            onClick={() => onSort(field)}
        >
            <div className="flex items-center gap-1">
                {label}
                {isActive ? (
                    sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                ) : (
                    <ChevronsUpDown size={12} className="opacity-0 group-hover/th:opacity-50" />
                )}
            </div>
        </th>
    );
};

// ── Main Dashboard ──────────────────────────────────────────────────────────

interface TeamDashboardProps {
    profiles: TrimmerProfile[];
    onReload: () => void;
}

export const TeamDashboard: React.FC<TeamDashboardProps> = ({ profiles, onReload }) => {
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({ role: [], status: [], invite: [] });
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // ── Stats ───────────────────────────────────────────────────────────────
    const activeCount = profiles.filter(p => p.status === 'active').length;
    const inactiveCount = profiles.filter(p => p.status === 'inactive').length;
    const pendingCount = profiles.filter(p => p.inviteStatus === 'pending').length;
    const acceptedCount = profiles.filter(p => p.inviteStatus === 'accepted').length;

    // ── Filter defs ─────────────────────────────────────────────────────────
    const roleFilter: FilterDef = {
        key: 'role',
        label: 'Role',
        multi: true,
        options: (Object.keys(ROLE_LABELS) as TeamRole[]).map(r => ({
            value: r,
            label: ROLE_LABELS[r],
            dot: ROLE_DOTS[r],
        })),
    };

    const statusFilter: FilterDef = {
        key: 'status',
        label: 'Status',
        multi: true,
        options: [
            { value: 'active', label: 'Active', dot: 'bg-[#3BB570]' },
            { value: 'inactive', label: 'Inactive', dot: 'bg-gray-400' },
        ],
    };

    const inviteFilter: FilterDef = {
        key: 'invite',
        label: 'Invite',
        multi: true,
        options: [
            { value: 'none', label: 'Not Invited', dot: 'bg-gray-300' },
            { value: 'pending', label: 'Pending', dot: 'bg-[#FA9E52]' },
            { value: 'accepted', label: 'Accepted', dot: 'bg-[#3BB570]' },
        ],
    };

    const teamSortOptions: SortOption[] = [
        { value: 'name', label: 'Name' },
        { value: 'role', label: 'Role' },
        { value: 'createdAt', label: 'Date Added' },
    ];

    // ── Filtering ───────────────────────────────────────────────────────────
    const filtered = profiles.filter(p => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const name = p.name.toLowerCase();
            const email = (p.email || '').toLowerCase();
            if (!name.includes(q) && !email.includes(q)) return false;
        }

        const roleF = activeFilters.role || [];
        if (roleF.length > 0 && !roleF.includes(p.role || 'worker')) return false;

        const statusF = activeFilters.status || [];
        if (statusF.length > 0 && !statusF.includes(p.status)) return false;

        const inviteF = activeFilters.invite || [];
        if (inviteF.length > 0 && !inviteF.includes(p.inviteStatus || 'none')) return false;

        return true;
    });

    // ── Sorting ─────────────────────────────────────────────────────────────
    const sorted = sortField
        ? [...filtered].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'name': cmp = a.name.localeCompare(b.name); break;
                case 'role': cmp = (a.role || 'worker').localeCompare(b.role || 'worker'); break;
                case 'email': cmp = (a.email || '').localeCompare(b.email || ''); break;
                case 'status': cmp = a.status.localeCompare(b.status); break;
                case 'inviteStatus': cmp = (a.inviteStatus || 'none').localeCompare(b.inviteStatus || 'none'); break;
                case 'createdAt': cmp = (a.createdAt || '').localeCompare(b.createdAt || ''); break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        })
        : filtered;

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const handleFilterChange = (key: string, values: string[]) => {
        setActiveFilters(prev => ({ ...prev, [key]: values }));
    };

    const handleClearFilters = () => {
        setActiveFilters({ role: [], status: [], invite: [] });
    };

    const handleToolbarSort = (value: string | null, dir: 'asc' | 'desc') => {
        setSortField(value as SortField | null);
        setSortDir(dir);
    };

    // ── Actions ─────────────────────────────────────────────────────────────
    const handleAdd = async (name: string, role: TeamRole, email?: string) => {
        await apiService.addTrimmerProfile(name, role, email);
        onReload();
    };

    const handleUpdate = async (id: string, updates: Partial<TrimmerProfile>) => {
        await apiService.updateTrimmerProfile(id, updates);
        onReload();
    };

    const handleSendInvite = async (id: string): Promise<string | undefined> => {
        const result = await apiService.sendTeamInvite(id);
        onReload();
        return result.inviteUrl;
    };

    const handleDelete = async (id: string) => {
        await apiService.deleteTrimmerProfile(id);
        onReload();
    };

    const hasActiveFilters = Object.values(activeFilters).some(v => v.length > 0);

    return (
        <div className="dashboard">
            {/* Stats */}
            <div className="dashboard-top-section">
                <div className="stats-grid">
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 181, 112, 0.1)', color: '#3BB570' }}>
                            <Users size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Active Members</label>
                            <p className="stat-value">{activeCount}</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: 'rgba(250, 158, 82, 0.1)', color: '#FA9E52' }}>
                            <Mail size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Pending Invites</label>
                            <p className="stat-value">{pendingCount}</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: 'rgba(28, 158, 255, 0.1)', color: '#1C9EFF' }}>
                            <UserCheck size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Accepted</label>
                            <p className="stat-value">{acceptedCount}</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: 'rgba(156, 163, 175, 0.1)', color: '#9CA3AF' }}>
                            <UserX size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Inactive</label>
                            <p className="stat-value">{inactiveCount}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <FilterToolbar
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search members..."
                filters={[roleFilter, statusFilter, inviteFilter]}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                sortOptions={teamSortOptions}
                activeSort={sortField}
                sortDir={sortDir}
                onSortChange={handleToolbarSort}
                trailing={
                    <button
                        type="button"
                        className="btn-new-batch"
                        onClick={() => setShowAddModal(true)}
                    >
                        <Plus size={20} />
                        Add Member
                    </button>
                }
            />

            {/* Content */}
            {sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center mb-4 shadow-sm">
                        <Users size={28} className="text-emerald-400" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-600 mb-1">
                        {searchQuery || hasActiveFilters ? 'No matching members' : 'No team members yet'}
                    </h3>
                    <p className="text-sm text-gray-400 max-w-xs mb-4">
                        {searchQuery || hasActiveFilters
                            ? 'Try adjusting your search or filters.'
                            : 'Add your first team member to get started.'}
                    </p>
                    {!searchQuery && !hasActiveFilters && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="btn-new-batch px-4 py-2 text-sm"
                        >
                            <Plus size={16} />
                            Add First Member
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50/50">
                                <SortableHeader label="Name" field="name" activeSort={sortField} sortDir={sortDir} onSort={handleSort} className="pl-5" />
                                <SortableHeader label="Role" field="role" activeSort={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Email" field="email" activeSort={sortField} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                                <SortableHeader label="Invite" field="inviteStatus" activeSort={sortField} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                                <SortableHeader label="Status" field="status" activeSort={sortField} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                                <th className="px-3 py-3 w-28" />
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map(profile => (
                                <MemberRow
                                    key={profile.id}
                                    profile={profile}
                                    onUpdate={handleUpdate}
                                    onSendInvite={handleSendInvite}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showAddModal && (
                <AddMemberModal
                    onClose={() => setShowAddModal(false)}
                    onSubmit={handleAdd}
                />
            )}
        </div>
    );
};

import React from 'react';
import { BarChart3, Sprout, LogOut, User as UserIcon, Scissors, Settings, ClipboardList, Map, Package, Users, FlaskConical, BookOpen, ShoppingCart, Warehouse } from 'lucide-react';
import { ff } from '../utils/featureFlags';
import { useAuth } from '../contexts/authContext';
import logo from '../assets/logo.png';

type ViewType = 'ai' | 'dashboard' | 'reports' | 'harvests' | 'harvest-day' | 'settings' | 'tasks' | 'plant-map' | 'packages' | 'extractions' | 'sops' | 'ordering' | 'supplies' | 'team' | 'tag-list';

type Role = 'admin' | 'director' | 'department_manager' | 'technician';
type Department = 'cultivation' | 'extraction' | 'post_harvest' | 'trim' | 'procurement' | 'lab' | 'compliance';

const ROLE_LEVELS: Record<Role, number> = {
    admin: 50,
    director: 40,
    department_manager: 30,
    technician: 10,
};

interface NavItem {
    view: ViewType;
    icon: (color: string) => React.ReactNode;
    label: string;
    flag?: boolean;
    /** Departments that grant access to this module. Omit for universal access. */
    dept?: Department[];
    /** Minimum role level required. Omit for no role restriction. */
    minRole?: number;
}

interface SidebarProps {
    currentView: ViewType;
    onViewChange: (view: ViewType) => void;
    onNewConversation: () => void;
    taskCount?: number;
}

function canSeeNavItem(
    item: NavItem,
    role: Role,
    departments: Department[],
): boolean {
    const level = ROLE_LEVELS[role] ?? 0;

    // Admins and directors see everything
    if (level >= ROLE_LEVELS.director) return true;

    // Check minimum role requirement
    if (item.minRole && level < item.minRole) return false;

    // Check department requirement
    if (item.dept && item.dept.length > 0) {
        return item.dept.some((d) => departments.includes(d));
    }

    return true;
}

const navItems: NavItem[] = [
    { view: 'plant-map', icon: (color) => <Map size={18} color={color} />, label: 'Plants', dept: ['cultivation'] },
    { view: 'harvests', icon: (color) => <Sprout size={18} color={color} />, label: 'Harvest', dept: ['cultivation'] },
    { view: 'dashboard', icon: (color) => <Scissors size={18} color={color} />, label: 'Trim', dept: ['trim'] },
    { view: 'packages', icon: (color) => <Package size={18} color={color} />, label: 'Packages', dept: ['post_harvest', 'extraction', 'lab'] },
    { view: 'extractions', icon: (color) => <FlaskConical size={18} color={color} />, label: 'Extraction', flag: ff.extractionWorkspace, dept: ['extraction'] },
    { view: 'sops', icon: (color) => <BookOpen size={18} color={color} />, label: 'SOPs' },
    { view: 'ordering', icon: (color) => <ShoppingCart size={18} color={color} />, label: 'Ordering', dept: ['procurement'], minRole: ROLE_LEVELS.department_manager },
    { view: 'supplies', icon: (color) => <Warehouse size={18} color={color} />, label: 'Supplies' },
    { view: 'tasks', icon: (color) => <ClipboardList size={18} color={color} />, label: 'Tasks' },
    { view: 'team', icon: (color) => <Users size={18} color={color} />, label: 'Team', minRole: ROLE_LEVELS.director },
    { view: 'reports', icon: (color) => <BarChart3 size={18} color={color} />, label: 'Reports', minRole: ROLE_LEVELS.department_manager },
];

export const Sidebar: React.FC<SidebarProps> = ({
    currentView,
    onViewChange,
    onNewConversation,
    taskCount = 0,
}) => {
    const { user, logout } = useAuth();
    const role = (user?.role ?? 'technician') as Role;
    const departments = (user?.departments ?? []) as Department[];

    return (
        <div className="sidebar-rail">
            {/* Logo — navigate to AI / new conversation */}
            <button
                onClick={() => {
                    onNewConversation();
                    onViewChange('ai');
                }}
                className={`sidebar-rail-logo ${currentView === 'ai' ? 'active' : ''}`}
                title="New conversation"
            >
                <img src={logo} alt="Logo" className="w-5 h-5 object-contain brightness-0 invert" />
            </button>

            {/* Module icons */}
            <div className="sidebar-rail-nav">
                {navItems.filter(n => n.flag !== false && canSeeNavItem(n, role, departments)).map(({ view, icon, label }) => {
                    const isActive = currentView === view;
                    return (
                        <button
                            key={view}
                            className={`sidebar-rail-btn ${isActive ? 'active' : ''}`}
                            onClick={() => onViewChange(view)}
                            title={label}
                        >
                            <span className="relative">
                                {icon(isActive ? '#3BB570' : '#959595')}
                                {view === 'tasks' && taskCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
                                        {taskCount > 99 ? '99+' : taskCount}
                                    </span>
                                )}
                            </span>
                            <span className="sidebar-label">{label}</span>
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
                    <Settings size={16} color={currentView === 'settings' ? '#3BB570' : '#959595'} />
                    <span className="sidebar-label">Settings</span>
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
                    <LogOut size={18} color="#DF5B59" />
                </button>
            </div>
        </div>
    );
};

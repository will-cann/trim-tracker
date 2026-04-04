import React from 'react';
import { BarChart3, Sprout, LogOut, User as UserIcon, Scissors, Settings, ClipboardList, Map, Package, Users, FlaskConical, BookOpen } from 'lucide-react';
import { ff } from '../utils/featureFlags';
import { useAuth } from '../contexts/authContext';
import logo from '../assets/logo.png';

type ViewType = 'ai' | 'dashboard' | 'reports' | 'harvests' | 'harvest-day' | 'settings' | 'tasks' | 'plant-map' | 'packages' | 'extractions' | 'sops' | 'team' | 'tag-list';

interface SidebarProps {
    currentView: ViewType;
    onViewChange: (view: ViewType) => void;
    onNewConversation: () => void;
    taskCount?: number;
}

const navItems: { view: ViewType; icon: (color: string) => React.ReactNode; label: string; flag?: boolean }[] = [
    { view: 'plant-map', icon: (color) => <Map size={18} color={color} />, label: 'Plants' },
    { view: 'harvests', icon: (color) => <Sprout size={18} color={color} />, label: 'Harvest' },
    { view: 'dashboard', icon: (color) => <Scissors size={18} color={color} />, label: 'Trim' },
    { view: 'packages', icon: (color) => <Package size={18} color={color} />, label: 'Packages' },
    { view: 'extractions', icon: (color) => <FlaskConical size={18} color={color} />, label: 'Extraction', flag: ff.extractionWorkspace },
    { view: 'sops', icon: (color) => <BookOpen size={18} color={color} />, label: 'SOPs' },
    { view: 'tasks', icon: (color) => <ClipboardList size={18} color={color} />, label: 'Tasks' },
    { view: 'team', icon: (color) => <Users size={18} color={color} />, label: 'Team' },
    { view: 'reports', icon: (color) => <BarChart3 size={18} color={color} />, label: 'Reports' },
];

export const Sidebar: React.FC<SidebarProps> = ({
    currentView,
    onViewChange,
    onNewConversation,
    taskCount = 0,
}) => {
    const { user, logout } = useAuth();

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
                {navItems.filter(n => n.flag !== false).map(({ view, icon, label }) => {
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

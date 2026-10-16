import React from 'react';
import { KeyRound, Leaf, LayoutGrid, Tag, Users, Wrench, Package, Plug, Cloud } from 'lucide-react';
import { ff } from '../../utils/featureFlags';

export type SettingsSection = 'licenses' | 'strains' | 'rooms' | 'tags' | 'equipment' | 'products' | 'team' | 'llm-plugin' | 'metrc-sync';

interface SettingsNavProps {
    active: SettingsSection;
    onChange: (section: SettingsSection) => void;
    counts: {
        licenses: number;
        strains: number;
        rooms: number;
        team: number;
    };
    /** Sections that do not apply to this deploy/company (e.g. Metrc sync on a site without T3). */
    hidden?: SettingsSection[];
}

const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ElementType; countKey?: keyof SettingsNavProps['counts']; flag?: boolean }[] = [
    { id: 'licenses', label: 'Licenses', icon: KeyRound, countKey: 'licenses' },
    { id: 'strains', label: 'Strains', icon: Leaf, countKey: 'strains' },
    { id: 'rooms', label: 'Rooms', icon: LayoutGrid, countKey: 'rooms' },
    { id: 'tags', label: 'Plant Tags', icon: Tag },
    { id: 'equipment', label: 'Equipment', icon: Wrench, flag: ff.extractionWorkspace },
    { id: 'products', label: 'Product Catalog', icon: Package },
    { id: 'team', label: 'Team', icon: Users, countKey: 'team' },
    { id: 'llm-plugin', label: 'LLM Plugin', icon: Plug },
    { id: 'metrc-sync', label: 'Metrc Sync', icon: Cloud },
];

export const SettingsNav: React.FC<SettingsNavProps> = ({ active, onChange, counts, hidden = [] }) => {
    const items = NAV_ITEMS.filter(n => n.flag !== false && !hidden.includes(n.id));
    return (
        <>
            {/* Desktop sidebar */}
            <nav className="settings-nav">
                <div className="settings-nav-list">
                    {items.map(item => {
                        const Icon = item.icon;
                        const count = item.countKey ? counts[item.countKey] : undefined;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onChange(item.id)}
                                className={`settings-nav-item ${active === item.id ? 'active' : ''}`}
                            >
                                <Icon size={16} />
                                <span className="settings-nav-label">{item.label}</span>
                                {count !== undefined && count > 0 && (
                                    <span className="settings-nav-count">{count}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* Mobile pill bar */}
            <div className="settings-pills">
                {items.map(item => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onChange(item.id)}
                            className={`settings-pill ${active === item.id ? 'active' : ''}`}
                        >
                            <Icon size={14} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </>
    );
};

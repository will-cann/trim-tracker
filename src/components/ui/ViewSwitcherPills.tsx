import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import type { TaskView } from '../../hooks/useTaskViews';

interface ViewSwitcherPillsProps {
    views: TaskView[];
    activeViewId: string;
    isModified: boolean;
    onSelectView: (id: string) => void;
    onSaveView: (title: string) => void;
    onDeleteView: (id: string) => void;
    onUpdateView: (id: string) => void;
}

export const ViewSwitcherPills = ({
    views,
    activeViewId,
    isModified,
    onSelectView,
    onSaveView,
    onDeleteView,
    onUpdateView,
}: ViewSwitcherPillsProps) => {
    const [showNewInput, setShowNewInput] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (showNewInput) inputRef.current?.focus();
    }, [showNewInput]);

    useEffect(() => {
        if (!menuOpenId) return;
        const close = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menuOpenId]);

    const handleSave = () => {
        const title = newTitle.trim();
        if (!title) { setShowNewInput(false); return; }
        onSaveView(title);
        setNewTitle('');
        setShowNewInput(false);
    };

    return (
        <div className="view-switcher">
            <div className="view-switcher__track">
                {views.map(view => {
                    const isActive = view.id === activeViewId;
                    const showMenu = !view.isBuiltIn && isActive;

                    return (
                        <div key={view.id} className="view-switcher__item">
                            <button
                                onClick={() => onSelectView(view.id)}
                                className={`view-tab ${isActive ? 'view-tab--active' : ''}`}
                            >
                                <span className="view-tab__label">{view.title}</span>
                                {isActive && isModified && (
                                    <span className="view-tab__dot" />
                                )}
                            </button>

                            {/* Dropdown trigger for custom active views */}
                            {showMenu && (
                                <div className="relative" ref={menuOpenId === view.id ? menuRef : undefined}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpenId(menuOpenId === view.id ? null : view.id);
                                        }}
                                        className="view-tab__menu-trigger"
                                    >
                                        <ChevronDown size={12} />
                                    </button>

                                    {menuOpenId === view.id && (
                                        <div className="view-tab__dropdown">
                                            <button
                                                onClick={() => { onUpdateView(view.id); setMenuOpenId(null); }}
                                                className="view-tab__dropdown-item"
                                            >
                                                <Pencil size={12} />
                                                Save current filters
                                            </button>
                                            <button
                                                onClick={() => { onDeleteView(view.id); setMenuOpenId(null); }}
                                                className="view-tab__dropdown-item view-tab__dropdown-item--danger"
                                            >
                                                <Trash2 size={12} />
                                                Remove view
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Separator */}
                <div className="view-switcher__sep" />

                {/* Save new view */}
                {showNewInput ? (
                    <div className="view-switcher__new">
                        <input
                            ref={inputRef}
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') { setShowNewInput(false); setNewTitle(''); }
                            }}
                            onBlur={handleSave}
                            placeholder="Name this view"
                            className="view-switcher__new-input"
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setShowNewInput(true)}
                        className="view-tab view-tab--ghost"
                        title="Save current filters as a view"
                    >
                        <Plus size={13} strokeWidth={2.5} />
                        <span className="view-tab__label">Save view</span>
                    </button>
                )}
            </div>
        </div>
    );
};

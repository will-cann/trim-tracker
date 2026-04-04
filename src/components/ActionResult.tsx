import { Check, ArrowRight, Package, Plus, UserPlus, Sprout, Scale, ArrowRightLeft, Trash2, MapPin, User, Scissors, ClipboardList, Leaf, Thermometer, Tag, Home, Pencil } from 'lucide-react';
import type { ActionResultItem } from '../types/definitions';

interface ActionResultProps {
    results: ActionResultItem[];
    onNavigate?: (view: string) => void;
}

const RESULT_ICONS: Record<string, typeof Package> = {
    create_session: Package,
    add_batch: Plus,
    assign_trimmer: User,
    add_trimmer_profile: UserPlus,
    create_harvest: Sprout,
    record_wet_weight: Scale,
    allocate_harvest: ArrowRightLeft,
    record_harvest_waste: Trash2,
    move_harvest: MapPin,
    convert_to_trim: Scissors,
    create_human_task: ClipboardList,
    update_human_task: ClipboardList,
    delete_human_task: Trash2,
    update_plant_health: Leaf,
    create_planting: Sprout,
    move_plants: MapPin,
    change_plant_phase: Sprout,
    record_extraction: Thermometer,
    update_trimmer_profile: User,
    update_batch_weight: Scale,
    update_license: Pencil,
    destroy_plants: Trash2,
    create_package: Package,
    update_package: Pencil,
    finish_package: Package,
    delete_package: Trash2,
    record_plant_weight: Scale,
    create_strain: Plus,
    delete_strain: Trash2,
    create_license: Plus,
    delete_license: Trash2,
    import_tags: Tag,
    assign_tag: Tag,
    auto_assign_tags: Tag,
    create_room: Home,
    update_room: Pencil,
    delete_room: Trash2,
    flag_contamination: Thermometer,
};

const NAV_LABELS: Record<string, string> = {
    dashboard: 'Open Trim Tracker',
    harvests: 'Open Harvest Day',
    reports: 'View Reports',
    tasks: 'View Tasks',
    'plant-map': 'View Plant Map',
    packages: 'View Packages',
    extractions: 'View Extraction',
    settings: 'Open Settings',
    'tag-list': 'View Tags',
};

export const ActionResult = ({ results, onNavigate }: ActionResultProps) => {
    const navTargets = [...new Set(results.map(r => r.navigateTo).filter(Boolean))] as string[];

    return (
        <div className="action-result">
            <div className="action-result-list">
                {results.map((result, i) => {
                    const Icon = RESULT_ICONS[result.type] || Check;
                    return (
                        <div
                            key={i}
                            className={`action-result-item ${i < results.length - 1 ? 'action-result-item-border' : ''}`}
                        >
                            <div className="action-result-check">
                                <Check size={11} strokeWidth={3} />
                            </div>
                            <div className="action-result-text">
                                <span className="action-result-label">{result.label}</span>
                                {result.summary && (
                                    <span className="action-result-summary">{result.summary}</span>
                                )}
                            </div>
                            <Icon size={14} className="action-result-type-icon" />
                        </div>
                    );
                })}
            </div>

            {navTargets.length > 0 && onNavigate && (
                <div className="action-result-nav">
                    {navTargets.map(target => (
                        <button
                            key={target}
                            onClick={() => onNavigate(target as any)}
                            className="action-result-nav-btn"
                        >
                            {NAV_LABELS[target] || target}
                            <ArrowRight size={14} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

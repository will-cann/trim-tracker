import { Check, ArrowRight, Package, Plus, UserPlus, Sprout, Scale, ArrowRightLeft, Trash2, MapPin, User, Scissors, ClipboardList } from 'lucide-react';
import type { ActionResultItem } from '../types/definitions';

interface ActionResultProps {
    results: ActionResultItem[];
    onNavigate?: (view: 'dashboard' | 'harvests' | 'reports' | 'tasks') => void;
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
};

const NAV_LABELS: Record<string, string> = {
    dashboard: 'Open Trim Tracker',
    harvests: 'Open Harvest Day',
    reports: 'View Reports',
    tasks: 'View Tasks',
};

export const ActionResult = ({ results, onNavigate }: ActionResultProps) => {
    // Group by navigation target for a cleaner CTA
    const navTargets = [...new Set(results.map(r => r.navigateTo).filter(Boolean))] as string[];

    return (
        <div className="space-y-3">
            {/* Result items */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 overflow-hidden">
                {results.map((result, i) => {
                    const Icon = RESULT_ICONS[result.type] || Check;
                    return (
                        <div
                            key={i}
                            className={`flex items-center gap-3 px-3 py-2.5 ${
                                i < results.length - 1 ? 'border-b border-emerald-100' : ''
                            }`}
                        >
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                <Check size={11} className="text-white" strokeWidth={3} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-900 font-medium">{result.label}</span>
                                {result.summary && (
                                    <span className="text-sm text-gray-500 ml-1.5">{result.summary}</span>
                                )}
                            </div>
                            <Icon size={14} className="text-gray-300 flex-shrink-0" />
                        </div>
                    );
                })}
            </div>

            {/* Navigation CTAs */}
            {navTargets.length > 0 && onNavigate && (
                <div className="flex gap-2">
                    {navTargets.map(target => (
                        <button
                            key={target}
                            onClick={() => onNavigate(target as 'dashboard' | 'harvests' | 'reports' | 'tasks')}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                                       text-emerald-700 bg-emerald-50 hover:bg-emerald-100
                                       border border-emerald-200 transition-colors"
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

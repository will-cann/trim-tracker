import React, { useState } from 'react';
import { Activity, Scissors, Sparkles } from 'lucide-react';
import { DashboardHeader } from '../ui';
import { FacilityOverview } from './FacilityOverview';
import { TrimPerformance } from './TrimPerformance';
import { ReportsBuilder } from './ReportsBuilder';

type ReportsSection = 'overview' | 'trim' | 'ask';

const SECTIONS: Array<{ id: ReportsSection; label: string; icon: React.ReactNode; title: string; subtitle: string }> = [
    { id: 'overview', label: 'Overview', icon: <Activity size={14} />, title: 'Facility overview', subtitle: 'Where the facility stands today and which way each number is moving.' },
    { id: 'trim', label: 'Trim', icon: <Scissors size={14} />, title: 'Trim performance', subtitle: 'Output, labor and per-trimmer rates for one week of completed sessions.' },
    { id: 'ask', label: 'Ask', icon: <Sparkles size={14} />, title: 'Ask a question', subtitle: 'Describe the report you want and get a chart. Save the ones you come back to.' },
];

const STORAGE_KEY = 'reports.section';

function readSection(): ReportsSection {
    try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        if (v === 'overview' || v === 'trim' || v === 'ask') return v;
    } catch { /* storage unavailable */ }
    return 'overview';
}

/**
 * Reports has three jobs: show the facility's pulse (daily snapshots), show
 * one week of trim work in detail, and answer ad-hoc questions. Each gets its
 * own section so its controls (compare window, week picker, prompt) sit with
 * the data they scope instead of competing in one header.
 */
export const ReportsDashboard: React.FC = () => {
    const [section, setSection] = useState<ReportsSection>(readSection);
    const active = SECTIONS.find(s => s.id === section) ?? SECTIONS[0];

    const select = (id: ReportsSection) => {
        setSection(id);
        try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
    };

    return (
        <div className="reports-dashboard">
            <DashboardHeader
                eyebrow="Reports"
                title={active.title}
                subtitle={active.subtitle}
                density="compact"
                actions={
                    <div className="reports-tabs" role="tablist" aria-label="Report sections">
                        {SECTIONS.map(s => (
                            <button
                                key={s.id}
                                role="tab"
                                aria-selected={s.id === section}
                                className={`reports-tab${s.id === section ? ' reports-tab-active' : ''}`}
                                onClick={() => select(s.id)}
                            >
                                {s.icon}
                                {s.label}
                            </button>
                        ))}
                    </div>
                }
            />

            {section === 'overview' && <FacilityOverview />}
            {section === 'trim' && <TrimPerformance />}
            {section === 'ask' && <ReportsBuilder />}
        </div>
    );
};

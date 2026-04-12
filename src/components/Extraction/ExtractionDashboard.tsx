import { useState } from 'react';
import { RunList } from './RunList';
import { ProcessTemplateList } from './ProcessTemplateList';
import { PlanningCalculator } from './PlanningCalculator';
import { DashboardHeader } from '../ui';
import type { StartRunPrefill } from './StartRunModal';

type DashboardTab = 'runs' | 'processes' | 'planning';

export const ExtractionDashboard: React.FC = () => {
    const [tab, setTab] = useState<DashboardTab>('runs');
    const [startRunPrefill, setStartRunPrefill] = useState<StartRunPrefill | null>(null);

    const handleStartRunFromPlan = (prefill: StartRunPrefill) => {
        setStartRunPrefill(prefill);
        setTab('runs');
    };

    return (
        <div className="dashboard">
            <DashboardHeader
                eyebrow="Extraction"
                title="Workspace"
                density="compact"
            />

            {/* Tab bar */}
            <div className="extraction-tabs">
                <button
                    className={`extraction-tab ${tab === 'runs' ? 'extraction-tab--active' : ''}`}
                    onClick={() => setTab('runs')}
                >
                    Runs
                </button>
                <button
                    className={`extraction-tab ${tab === 'processes' ? 'extraction-tab--active' : ''}`}
                    onClick={() => setTab('processes')}
                >
                    Processes
                </button>
                <button
                    className={`extraction-tab ${tab === 'planning' ? 'extraction-tab--active' : ''}`}
                    onClick={() => setTab('planning')}
                >
                    Planning
                </button>
            </div>

            {/* All tabs stay mounted so their state survives a tab switch —
                critical for the Planning tab, where a user builds a basket,
                kicks off stage 1 on the Runs tab, and needs to come back to
                the same plan to schedule the next stage. */}
            <div style={{ display: tab === 'runs' ? 'block' : 'none' }}>
                <RunList
                    startRunPrefill={startRunPrefill}
                    onPrefillConsumed={() => setStartRunPrefill(null)}
                    onRunCreatedFromPlan={() => setTab('planning')}
                />
            </div>
            <div style={{ display: tab === 'processes' ? 'block' : 'none' }}>
                <ProcessTemplateList />
            </div>
            <div style={{ display: tab === 'planning' ? 'block' : 'none' }}>
                <PlanningCalculator onStartRun={handleStartRunFromPlan} />
            </div>
        </div>
    );
};

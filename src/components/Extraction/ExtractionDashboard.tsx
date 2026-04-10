import { useState } from 'react';
import { RunList } from './RunList';
import { ProcessTemplateList } from './ProcessTemplateList';
import { PlanningCalculator } from './PlanningCalculator';

type DashboardTab = 'runs' | 'processes' | 'planning';

export const ExtractionDashboard: React.FC = () => {
    const [tab, setTab] = useState<DashboardTab>('runs');

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">Extraction Workspace</h1>
                    <p className="text-xs text-gray-400">Manage extraction runs and track your pipeline</p>
                </div>
            </div>

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

            {tab === 'runs' && <RunList />}
            {tab === 'processes' && <ProcessTemplateList />}
            {tab === 'planning' && <PlanningCalculator />}
        </div>
    );
};

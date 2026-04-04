import { RunList } from './RunList';

export const ExtractionDashboard: React.FC = () => {
    return (
        <div className="dashboard">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">Extraction Workspace</h1>
                    <p className="text-xs text-gray-400">Manage extraction runs and track your pipeline</p>
                </div>
            </div>

            <RunList />
        </div>
    );
};

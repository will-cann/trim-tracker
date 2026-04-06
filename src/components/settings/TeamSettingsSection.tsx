import React from 'react';
import { TeamDashboard } from '../TeamDashboard';
import type { TrimmerProfile } from '../../types/definitions';

interface TeamSettingsSectionProps {
    profiles: TrimmerProfile[];
    onReload: () => void;
}

export const TeamSettingsSection: React.FC<TeamSettingsSectionProps> = ({ profiles, onReload }) => {
    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Team</h3>
                    <p className="settings-section-desc">Manage team members, roles, and department assignments.</p>
                </div>
            </div>
            <div className="mt-4">
                <TeamDashboard profiles={profiles} onReload={onReload} />
            </div>
        </div>
    );
};

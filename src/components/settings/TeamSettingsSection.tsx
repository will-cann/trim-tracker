import React from 'react';
import { ArrowRight } from 'lucide-react';
import { TeamSection } from '../TeamSection';
import type { TrimmerProfile } from '../../types/definitions';

interface TeamSettingsSectionProps {
    profiles: TrimmerProfile[];
    onReload: () => void;
    onNavigateToTeam?: () => void;
}

export const TeamSettingsSection: React.FC<TeamSettingsSectionProps> = ({ profiles, onReload, onNavigateToTeam }) => {
    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Team</h3>
                    <p className="settings-section-desc">Manage team members, roles, and assignments.</p>
                </div>
                {onNavigateToTeam && (
                    <button
                        onClick={onNavigateToTeam}
                        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                        style={{ color: '#3BB570' }}
                    >
                        Team Dashboard <ArrowRight size={14} />
                    </button>
                )}
            </div>
            <div className="mt-4">
                <TeamSection profiles={profiles} onReload={onReload} />
            </div>
        </div>
    );
};

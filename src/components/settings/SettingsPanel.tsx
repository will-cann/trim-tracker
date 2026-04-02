import React, { useState, useEffect, useCallback } from 'react';
import type { License, Strain, TrimmerProfile, TagSettings } from '../../types/definitions';
import type { Room } from '../../types/plantMap';
import { apiService } from '../../services/apiService';
import { CenteredSpinner } from '../Spinner';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { SettingsNav, type SettingsSection } from './SettingsNav';
import { LicenseSection } from './LicenseSection';
import { StrainSection } from './StrainSection';
import { RoomSection } from './RoomSection';
import { TagSection } from './TagSection';
import { TeamSettingsSection } from './TeamSettingsSection';

interface SettingsPanelProps {
    onViewChange?: (view: any) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onViewChange }) => {
    const [activeSection, setActiveSection] = useState<SettingsSection>('licenses');
    const [loading, setLoading] = useState(true);

    // Data state
    const [licenses, setLicenses] = useState<License[]>([]);
    const [strains, setStrains] = useState<Strain[]>([]);
    const [profiles, setProfiles] = useState<TrimmerProfile[]>([]);
    const [tagSettings, setTagSettings] = useState<TagSettings>({
        useTags: false, tagSource: 'auto', tagOnPhase: 'nursery_to_veg',
        requireBatchTag: false, autoTagPrefix: 'PLT', autoTagCounter: 0,
    });
    const [rooms, setRooms] = useState<Room[]>([]);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<{
        type: 'strain' | 'license' | 'room' | 'equipment';
        id: string;
        name: string;
    } | null>(null);

    // Data loaders
    const loadLicenses = useCallback(async () => {
        const data = await apiService.getAllLicenses();
        setLicenses(data);
    }, []);

    const loadStrains = useCallback(async () => {
        const data = await apiService.getStrains();
        setStrains(data);
    }, []);

    const loadProfiles = useCallback(async () => {
        const data = await apiService.getTrimmerProfiles();
        setProfiles(data);
    }, []);

    const loadTagSettings = useCallback(async () => {
        const data = await apiService.getTagSettings();
        setTagSettings(data);
    }, []);

    const loadRooms = useCallback(async () => {
        const data = await apiService.getRooms(undefined, true);
        setRooms(data.map((r: any) => ({
            id: r.id,
            name: r.name,
            roomType: r.room_type,
            capacity: r.capacity,
            squareFootage: r.square_footage ? Number(r.square_footage) : undefined,
            notes: r.notes || undefined,
            equipment: (r.equipment || []).map((e: any) => ({
                id: e.id,
                equipmentType: e.equipmentType || e.equipment_type,
                name: e.name,
                quantity: e.quantity,
                specs: e.specs || {},
            })),
        })));
    }, []);

    useEffect(() => {
        Promise.all([loadLicenses(), loadStrains(), loadProfiles(), loadTagSettings(), loadRooms()])
            .finally(() => setLoading(false));
    }, [loadLicenses, loadStrains, loadProfiles, loadTagSettings, loadRooms]);

    const handleSaveTagSettings = async (updates: Partial<TagSettings>) => {
        const newSettings = await apiService.updateTagSettings({ ...tagSettings, ...updates });
        setTagSettings(newSettings);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        if (deleteTarget.type === 'strain') {
            await apiService.deleteStrain(deleteTarget.id);
            await loadStrains();
        } else if (deleteTarget.type === 'license') {
            await apiService.deleteLicense(deleteTarget.id);
            await loadLicenses();
        } else if (deleteTarget.type === 'room') {
            await apiService.deleteRoom(deleteTarget.id);
            await loadRooms();
        } else if (deleteTarget.type === 'equipment') {
            await apiService.deleteRoomEquipment(deleteTarget.id);
            await loadRooms();
        }
        setDeleteTarget(null);
    };

    if (loading) {
        return <CenteredSpinner label="Loading settings…" height="py-20" />;
    }

    const renderSection = () => {
        switch (activeSection) {
            case 'licenses':
                return (
                    <LicenseSection
                        licenses={licenses}
                        loading={false}
                        onReload={loadLicenses}
                        onDelete={(id, name) => setDeleteTarget({ type: 'license', id, name })}
                    />
                );
            case 'strains':
                return (
                    <StrainSection
                        strains={strains}
                        loading={false}
                        onReload={loadStrains}
                        onDelete={(id, name) => setDeleteTarget({ type: 'strain', id, name })}
                    />
                );
            case 'rooms':
                return (
                    <RoomSection
                        rooms={rooms}
                        loading={false}
                        onReload={loadRooms}
                        onDeleteRoom={(id, name) => setDeleteTarget({ type: 'room', id, name })}
                        onDeleteEquipment={(id, name) => setDeleteTarget({ type: 'equipment', id, name })}
                    />
                );
            case 'tags':
                return (
                    <TagSection
                        tagSettings={tagSettings}
                        onSaveSettings={handleSaveTagSettings}
                        loading={false}
                    />
                );
            case 'team':
                return (
                    <TeamSettingsSection
                        profiles={profiles}
                        onReload={loadProfiles}
                        onNavigateToTeam={onViewChange ? () => onViewChange('team') : undefined}
                    />
                );
        }
    };

    return (
        <>
            {deleteTarget && (
                <DeleteConfirmationModal
                    title={`Delete ${deleteTarget.type === 'strain' ? 'Strain' : deleteTarget.type === 'license' ? 'License' : deleteTarget.type === 'room' ? 'Room' : 'Equipment'}`}
                    message={`Are you sure you want to delete "${deleteTarget.name}"?${deleteTarget.type === 'room' ? ' Plants in this room will become unassigned.' : ' This cannot be undone.'}`}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
            <div className="dashboard settings-container">
                {/* Header */}
                <div className="settings-header">
                    <h2 className="settings-title">Settings</h2>
                    <p className="settings-subtitle">Manage your facility configuration</p>
                </div>

                {/* Layout: Nav + Content */}
                <div className="settings-layout">
                    <SettingsNav
                        active={activeSection}
                        onChange={setActiveSection}
                        counts={{
                            licenses: licenses.length,
                            strains: strains.length,
                            rooms: rooms.length,
                            team: profiles.filter(p => p.status === 'active').length,
                        }}
                        onNavigateToTeam={onViewChange ? () => onViewChange('team') : undefined}
                    />
                    <main className="settings-content">
                        {renderSection()}
                    </main>
                </div>
            </div>
        </>
    );
};

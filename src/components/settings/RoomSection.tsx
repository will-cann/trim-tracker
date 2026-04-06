import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { Room, EquipmentType } from '../../types/plantMap';
import { apiService } from '../../services/apiService';

interface RoomSectionProps {
    rooms: Room[];
    loading: boolean;
    onReload: () => void;
    onDeleteRoom: (id: string, name: string) => void;
    onDeleteEquipment: (id: string, name: string) => void;
}

export const RoomSection: React.FC<RoomSectionProps> = ({ rooms, loading, onReload, onDeleteRoom, onDeleteEquipment }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomType, setNewRoomType] = useState('');
    const [newRoomCapacity, setNewRoomCapacity] = useState('');
    const [newRoomSqFt, setNewRoomSqFt] = useState('');
    const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
    const [isAddingEquipment, setIsAddingEquipment] = useState<string | null>(null);
    const [newEquipName, setNewEquipName] = useState('');
    const [newEquipType, setNewEquipType] = useState<EquipmentType>('light');
    const [newEquipQty, setNewEquipQty] = useState('1');

    const handleAddRoom = async () => {
        const name = newRoomName.trim();
        if (!name) { setIsAdding(false); return; }
        await apiService.createRoom({
            name,
            roomType: newRoomType || undefined,
            capacity: newRoomCapacity ? parseInt(newRoomCapacity) : undefined,
            squareFootage: newRoomSqFt ? parseFloat(newRoomSqFt) : undefined,
        });
        setNewRoomName(''); setNewRoomType(''); setNewRoomCapacity(''); setNewRoomSqFt('');
        setIsAdding(false);
        await onReload();
    };

    const handleUpdateRoom = async (id: string, field: string, raw: string) => {
        let value: any;
        if (field === 'capacity' || field === 'squareFootage') {
            const num = parseFloat(raw);
            value = (!raw || isNaN(num) || num <= 0) ? null : num;
        } else {
            value = raw.trim() || null;
        }
        await apiService.updateRoom(id, { [field]: value });
        await onReload();
    };

    const handleAddEquipment = async (roomId: string) => {
        const name = newEquipName.trim();
        if (!name) { setIsAddingEquipment(null); return; }
        await apiService.addRoomEquipment({
            roomId,
            equipmentType: newEquipType,
            name,
            quantity: parseInt(newEquipQty) || 1,
        });
        setNewEquipName(''); setNewEquipType('light'); setNewEquipQty('1');
        setIsAddingEquipment(null);
        await onReload();
    };

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Rooms</h3>
                    <p className="settings-section-desc">Manage facility spaces and their equipment.</p>
                </div>
                {!isAdding && (
                    <button onClick={() => setIsAdding(true)} className="btn-new-batch text-sm px-3 py-1.5">
                        <Plus size={14} /> Add Room
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="settings-add-form">
                    <div className="flex gap-2 mb-2 flex-wrap">
                        <input
                            type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)}
                            placeholder="Room name" autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleAddRoom(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="field-input flex-1" style={{ minWidth: 140 }}
                        />
                        <select value={newRoomType} onChange={e => setNewRoomType(e.target.value)}
                            className="field-input" style={{ width: 120 }}>
                            <option value="">Type...</option>
                            <option value="nursery">Nursery</option>
                            <option value="veg">Veg</option>
                            <option value="flower">Flower</option>
                            <option value="dry">Dry</option>
                            <option value="storage">Storage</option>
                            <option value="general">General</option>
                        </select>
                        <input
                            type="number" value={newRoomCapacity} onChange={e => setNewRoomCapacity(e.target.value)}
                            placeholder="Capacity" min={1}
                            className="field-input" style={{ width: 90 }}
                        />
                        <input
                            type="number" value={newRoomSqFt} onChange={e => setNewRoomSqFt(e.target.value)}
                            placeholder="Sq ft" min={1}
                            className="field-input" style={{ width: 90 }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleAddRoom} className="btn-primary text-sm px-3 py-1.5">Save</button>
                        <button onClick={() => { setIsAdding(false); setNewRoomName(''); setNewRoomType(''); setNewRoomCapacity(''); setNewRoomSqFt(''); }} className="btn-cancel text-sm px-3 py-1.5">Cancel</button>
                    </div>
                </div>
            )}

            {loading ? (
                <CenteredSpinner label="Loading rooms…" height="py-12" />
            ) : rooms.length === 0 ? (
                <div className="settings-empty">
                    Rooms define where plants live — veg, flower, dry, cure. Required for the plant map.{' '}
                    <button onClick={() => setIsAdding(true)} className="settings-empty-action">
                        Add your rooms
                    </button>
                </div>
            ) : (
                <div className="settings-table-wrap">
                    <table className="strain-table">
                        <thead>
                            <tr>
                                <th className="strain-th" style={{ width: 28 }}></th>
                                <th className="strain-th strain-th-name">Room</th>
                                <th className="strain-th strain-th-days">Type</th>
                                <th className="strain-th strain-th-days">Capacity</th>
                                <th className="strain-th strain-th-days">Sq Ft</th>
                                <th className="strain-th strain-th-notes">Notes</th>
                                <th className="strain-th" style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rooms.map(room => (
                                <React.Fragment key={room.id}>
                                    <tr className="strain-row">
                                        <td className="strain-cell-action" style={{ paddingLeft: 12 }}>
                                            <button
                                                onClick={() => setExpandedRoomId(expandedRoomId === room.id ? null : room.id)}
                                                className="strain-delete-btn" style={{ opacity: 1 }}
                                                title={expandedRoomId === room.id ? 'Collapse' : 'Expand equipment'}
                                            >
                                                {expandedRoomId === room.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                        </td>
                                        <td className="strain-cell-name">
                                            <span className="strain-name-text">{room.name}</span>
                                        </td>
                                        <td className="strain-cell-days">
                                            <select
                                                defaultValue={room.roomType || ''}
                                                onChange={e => handleUpdateRoom(room.id, 'roomType', e.target.value)}
                                                className="strain-days-input" style={{ width: 80, textAlign: 'left' }}
                                            >
                                                <option value="">—</option>
                                                <option value="nursery">Nursery</option>
                                                <option value="veg">Veg</option>
                                                <option value="flower">Flower</option>
                                                <option value="dry">Dry</option>
                                                <option value="storage">Storage</option>
                                                <option value="general">General</option>
                                            </select>
                                        </td>
                                        <td className="strain-cell-days">
                                            <input type="number" defaultValue={room.capacity ?? ''} placeholder="—" min={1}
                                                onBlur={e => handleUpdateRoom(room.id, 'capacity', e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                className="strain-days-input"
                                            />
                                        </td>
                                        <td className="strain-cell-days">
                                            <input type="number" defaultValue={room.squareFootage ?? ''} placeholder="—" min={1}
                                                onBlur={e => handleUpdateRoom(room.id, 'squareFootage', e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                className="strain-days-input"
                                            />
                                        </td>
                                        <td className="strain-cell-notes">
                                            <input type="text" defaultValue={room.notes ?? ''} placeholder="Add notes..."
                                                onBlur={e => handleUpdateRoom(room.id, 'notes', e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                className="strain-notes-input"
                                            />
                                        </td>
                                        <td className="strain-cell-action">
                                            <button onClick={() => onDeleteRoom(room.id, room.name)}
                                                className="strain-delete-btn" title="Delete room">
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedRoomId === room.id && (
                                        <tr>
                                            <td colSpan={7} className="px-5 py-3 bg-[#F9FAFB]">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-medium uppercase tracking-wider text-[#959595]">
                                                        Equipment ({room.equipment?.length || 0})
                                                    </span>
                                                    {isAddingEquipment !== room.id && (
                                                        <button onClick={() => { setIsAddingEquipment(room.id); setNewEquipName(''); setNewEquipType('light'); setNewEquipQty('1'); }}
                                                            className="btn-new-batch text-xs px-2 py-1">
                                                            <Plus size={12} /> Add
                                                        </button>
                                                    )}
                                                </div>
                                                {isAddingEquipment === room.id && (
                                                    <div className="flex gap-2 mb-2 flex-wrap">
                                                        <select value={newEquipType} onChange={e => setNewEquipType(e.target.value as EquipmentType)}
                                                            className="field-input text-xs" style={{ width: 120 }}>
                                                            <option value="light">Light</option>
                                                            <option value="hvac">HVAC</option>
                                                            <option value="dehumidifier">Dehumidifier</option>
                                                            <option value="fan">Fan</option>
                                                            <option value="co2_generator">CO2 Generator</option>
                                                            <option value="other">Other</option>
                                                        </select>
                                                        <input type="text" value={newEquipName} onChange={e => setNewEquipName(e.target.value)}
                                                            placeholder="Equipment name" autoFocus
                                                            onKeyDown={e => { if (e.key === 'Enter') handleAddEquipment(room.id); if (e.key === 'Escape') setIsAddingEquipment(null); }}
                                                            className="field-input text-xs flex-1" style={{ minWidth: 120 }}
                                                        />
                                                        <input type="number" value={newEquipQty} onChange={e => setNewEquipQty(e.target.value)}
                                                            placeholder="Qty" min={1}
                                                            className="field-input text-xs" style={{ width: 60 }}
                                                        />
                                                        <button onClick={() => handleAddEquipment(room.id)} className="btn-primary text-xs px-2 py-1">Save</button>
                                                        <button onClick={() => setIsAddingEquipment(null)} className="btn-cancel text-xs px-2 py-1">Cancel</button>
                                                    </div>
                                                )}
                                                {(!room.equipment || room.equipment.length === 0) && isAddingEquipment !== room.id ? (
                                                    <p className="text-xs text-[#C0C0C0] italic">No equipment added yet.</p>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {room.equipment?.map(eq => (
                                                            <div key={eq.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-white">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[11px] font-medium capitalize px-1.5 py-0.5 rounded bg-[#F1F1F1] text-[#959595]">
                                                                        {eq.equipmentType.replace('_', ' ')}
                                                                    </span>
                                                                    <span className="text-sm text-[#1A1A1A]">{eq.name}</span>
                                                                    <span className="text-xs text-[#959595]">x{eq.quantity}</span>
                                                                </div>
                                                                <button onClick={() => onDeleteEquipment(eq.id, eq.name)}
                                                                    className="strain-delete-btn" title="Remove equipment">
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

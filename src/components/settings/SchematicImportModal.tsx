import React, { useRef, useState } from 'react';
import { FileUp, Grid3x3 } from 'lucide-react';
import { Modal } from '../ui';
import { apiService } from '../../services/apiService';
import type { SchematicRoom } from '../../services/apiService';
import type { Room } from '../../types/plantMap';

interface SchematicImportModalProps {
    existingRooms: Room[];
    onClose: () => void;
    onApplied: () => void;
}

type Draft = SchematicRoom & { include: boolean; existingId: string | null };

const ROOM_TYPE_OPTIONS = ['nursery', 'veg', 'flower', 'dry', 'storage', 'general'] as const;

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

/**
 * Upload a floor plan / bench layout, let Claude propose the rooms and their
 * grid, edit the proposals, then create or update the rooms in one go.
 */
export const SchematicImportModal: React.FC<SchematicImportModalProps> = ({ existingRooms, onClose, onApplied }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiNotes, setAiNotes] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Draft[]>([]);

    const matchExisting = (name: string) => existingRooms.find(r => r.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

    const handleFile = async (file: File) => {
        setError(null);
        setReading(true);
        setFileName(file.name);
        try {
            const data = await fileToBase64(file);
            const result = await apiService.parseRoomSchematic({ fileName: file.name, mediaType: file.type, data });
            setAiNotes(result.notes);
            setDrafts(result.rooms.map(r => ({ ...r, include: true, existingId: matchExisting(r.name)?.id ?? null })));
            if (result.rooms.length === 0) setError(result.notes || 'No rooms were found in that file.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read the schematic');
        } finally {
            setReading(false);
        }
    };

    const update = (i: number, patch: Partial<Draft>) => {
        setDrafts(prev => prev.map((d, j) => {
            if (j !== i) return d;
            const next = { ...d, ...patch };
            if (patch.name !== undefined) next.existingId = matchExisting(patch.name)?.id ?? null;
            return next;
        }));
    };

    const apply = async () => {
        setApplying(true);
        setError(null);
        try {
            for (const d of drafts.filter(x => x.include && x.name.trim())) {
                const payload = {
                    roomType: d.roomType ?? undefined,
                    capacity: d.capacity ?? undefined,
                    squareFootage: d.squareFootage ?? undefined,
                    layoutRows: d.layoutRows ?? undefined,
                    layoutCols: d.layoutCols ?? undefined,
                };
                if (d.existingId) await apiService.updateRoom(d.existingId, payload);
                else await apiService.createRoom({ name: d.name.trim(), notes: d.notes ?? undefined, ...payload });
            }
            onApplied();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save rooms');
            setApplying(false);
        }
    };

    const selected = drafts.filter(d => d.include && d.name.trim());
    const toCreate = selected.filter(d => !d.existingId).length;
    const toUpdate = selected.length - toCreate;

    return (
        <Modal
            title="Import rooms from a schematic"
            titleIcon={<Grid3x3 size={16} className="text-emerald-600" />}
            contentClassName="creation-modal"
            size="lg"
            onClose={onClose}
            footer={
                <>
                    <button onClick={onClose} className="btn-cancel" disabled={applying}>Cancel</button>
                    <button onClick={apply} className="btn-primary" disabled={applying || selected.length === 0}>
                        {applying ? 'Saving…' : `${toCreate ? `Create ${toCreate}` : ''}${toCreate && toUpdate ? ', ' : ''}${toUpdate ? `update ${toUpdate}` : ''}${!toCreate && !toUpdate ? 'Nothing selected' : ''}`}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="text-xs text-gray-500">
                    Upload a floor plan, bench layout or a photo of the whiteboard. The AI lists each room with its benches (rows) and positions per bench (columns); fix anything it got wrong before saving. Rooms whose name already exists are updated, the rest are created.
                </p>

                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                    />
                    <button className="btn-new-batch text-xs px-3 py-1.5" onClick={() => inputRef.current?.click()} disabled={reading}>
                        <FileUp size={13} /> {reading ? 'Reading…' : fileName ? 'Choose another file' : 'Choose file'}
                    </button>
                    {fileName && <span className="text-xs text-gray-500 truncate">{fileName}</span>}
                </div>

                {aiNotes && drafts.length > 0 && <p className="text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1.5">{aiNotes}</p>}
                {error && <p className="text-xs text-red-600">{error}</p>}

                {drafts.length > 0 && (
                    <div className="settings-table-wrap">
                        <table className="strain-table">
                            <thead>
                                <tr>
                                    <th className="strain-th" style={{ width: 28 }}></th>
                                    <th className="strain-th strain-th-name">Room</th>
                                    <th className="strain-th strain-th-days">Type</th>
                                    <th className="strain-th strain-th-days" title="Benches / tables">Rows</th>
                                    <th className="strain-th strain-th-days" title="Positions per bench">Cols</th>
                                    <th className="strain-th strain-th-days">Capacity</th>
                                    <th className="strain-th strain-th-days">Sq Ft</th>
                                    <th className="strain-th strain-th-notes">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drafts.map((d, i) => (
                                    <tr key={i} className="strain-row" style={{ opacity: d.include ? 1 : 0.45 }}>
                                        <td className="strain-cell-action" style={{ paddingLeft: 12 }}>
                                            <input type="checkbox" checked={d.include} onChange={e => update(i, { include: e.target.checked })} />
                                        </td>
                                        <td className="strain-cell-name">
                                            <input type="text" value={d.name} onChange={e => update(i, { name: e.target.value })} className="strain-days-input" style={{ width: 160, textAlign: 'left' }} />
                                            <div className="text-[10px] text-gray-400 mt-0.5">{d.existingId ? 'updates existing room' : 'new room'}</div>
                                        </td>
                                        <td className="strain-cell-days">
                                            <select value={d.roomType ?? ''} onChange={e => update(i, { roomType: (e.target.value || null) as Draft['roomType'] })} className="strain-days-input" style={{ width: 84, textAlign: 'left' }}>
                                                <option value="">—</option>
                                                {ROOM_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </td>
                                        <td className="strain-cell-days">
                                            <input type="number" min={1} max={60} value={d.layoutRows ?? ''} onChange={e => update(i, { layoutRows: e.target.value ? Math.min(60, parseInt(e.target.value, 10) || 0) || null : null })} className="strain-days-input" />
                                        </td>
                                        <td className="strain-cell-days">
                                            <input type="number" min={1} max={60} value={d.layoutCols ?? ''} onChange={e => update(i, { layoutCols: e.target.value ? Math.min(60, parseInt(e.target.value, 10) || 0) || null : null })} className="strain-days-input" />
                                        </td>
                                        <td className="strain-cell-days">
                                            <input type="number" min={1} value={d.capacity ?? ''} onChange={e => update(i, { capacity: e.target.value ? parseInt(e.target.value, 10) || null : null })} className="strain-days-input" />
                                        </td>
                                        <td className="strain-cell-days">
                                            <input type="number" min={1} value={d.squareFootage ?? ''} onChange={e => update(i, { squareFootage: e.target.value ? parseInt(e.target.value, 10) || null : null })} className="strain-days-input" />
                                        </td>
                                        <td className="strain-cell-notes">
                                            <span className="text-[11px] text-gray-500">{d.notes ?? ''}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Modal>
    );
};

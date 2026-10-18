import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, FileUp } from 'lucide-react';
import { Modal } from '../ui';
import { apiService } from '../../services/apiService';
import type { ParsedRoomSheet, SheetGrid } from '../../types/plantMap';
import { parseRoomWorkbook, rotScoreLabel, defaultObservedAt } from '../../types/plantMap';

interface ImportRoomSheetModalProps {
    rooms: Array<{ id: string; name: string }>;
    /** Room currently open on the map, preselected when the sheet names no room. */
    currentRoomId?: string | null;
    onClose: () => void;
    onImported: (roomId: string) => void;
}

/**
 * Upload a room workbook (a "room map" sheet of tables with strain + count
 * and a "health report" sheet of bud-rot scores on the same layout), check
 * what was read, pick the room and the observation date, then import.
 */
export const ImportRoomSheetModal: React.FC<ImportRoomSheetModalProps> = ({ rooms, currentRoomId, onClose, onImported }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [parsed, setParsed] = useState<ParsedRoomSheet | null>(null);
    const [roomChoice, setRoomChoice] = useState<string>('');   // room id, or '__new__'
    const [newRoomName, setNewRoomName] = useState('');
    const [observedAt, setObservedAt] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFile = async (file: File) => {
        setError(null);
        setFileName(file.name);
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array', cellDates: false });
            const sheets: Record<string, SheetGrid> = {};
            for (const name of wb.SheetNames) {
                sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as SheetGrid;
            }
            const result = parseRoomWorkbook(sheets);
            setParsed(result);
            const match = result.roomName ? rooms.find(r => r.name.toLowerCase() === result.roomName!.toLowerCase()) : null;
            setRoomChoice(match ? match.id : currentRoomId && !result.roomName ? currentRoomId : '__new__');
            setNewRoomName(result.roomName ?? '');
            setObservedAt(defaultObservedAt(result.observedAt, new Date().toISOString().slice(0, 10)).observedAt);
            if (result.tables.length === 0) setError('No tables were found in that workbook.');
        } catch (e) {
            setParsed(null);
            setError(e instanceof Error ? e.message : 'Could not read the workbook');
        }
    };

    const scoreCounts = useMemo(() => {
        const m = new Map<number, number>();
        for (const s of parsed?.scores ?? []) m.set(s.score, (m.get(s.score) ?? 0) + 1);
        return [...m.entries()].sort((a, b) => a[0] - b[0]);
    }, [parsed]);

    const apply = async () => {
        if (!parsed) return;
        setBusy(true);
        setError(null);
        try {
            const res = await apiService.importRoomSheet({
                roomId: roomChoice && roomChoice !== '__new__' ? roomChoice : undefined,
                roomName: roomChoice === '__new__' ? newRoomName.trim() : undefined,
                observedAt: parsed.scores.length ? observedAt : (observedAt || null),
                sheet: parsed,
            });
            onImported(res.room.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Import failed');
            setBusy(false);
        }
    };

    const canApply = !!parsed && parsed.tables.length > 0 && (roomChoice !== '__new__' || newRoomName.trim()) && (!parsed.scores.length || !!observedAt);
    const today = new Date().toISOString().slice(0, 10);
    const sheetDate = parsed?.observedAt ? defaultObservedAt(parsed.observedAt, today) : null;
    const sheetDateIgnored = sheetDate && (sheetDate.verdict === 'old' || sheetDate.verdict === 'future');

    return (
        <Modal
            title="Import room sheet"
            titleIcon={<FileSpreadsheet size={16} className="text-emerald-600" />}
            contentClassName="creation-modal"
            size="md"
            onClose={onClose}
            footer={
                <>
                    <button onClick={onClose} className="btn-cancel" disabled={busy}>Cancel</button>
                    <button onClick={apply} className="btn-primary" disabled={busy || !canApply}>
                        {busy ? 'Importing…' : parsed ? `Import ${parsed.tables.length} tables${parsed.scores.length ? ` + ${parsed.scores.length} scores` : ''}` : 'Import'}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="text-xs text-gray-500">
                    A workbook with a <strong>room map</strong> sheet (strain code per table, plant count underneath) and a <strong>health report</strong> sheet (bud-rot score 0.5 / 1 / 2 / 3 on the same layout). Decks and East/West labels are read from the headers.
                </p>

                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                    />
                    <button className="btn-new-batch text-xs px-3 py-1.5" onClick={() => inputRef.current?.click()} disabled={busy}>
                        <FileUp size={13} /> {fileName ? 'Choose another file' : 'Choose workbook'}
                    </button>
                    {fileName && <span className="text-xs text-gray-500 truncate">{fileName}</span>}
                </div>

                {parsed && parsed.tables.length > 0 && (
                    <>
                        <div className="room-map-stats">
                            <Stat label="Grid" value={`${parsed.rows} × ${parsed.cols}`} />
                            <Stat label="Tables" value={String(parsed.tables.length)} />
                            <Stat label="Plants" value={parsed.totalPlants.toLocaleString()} />
                            <Stat label="Scored tables" value={String(parsed.scores.length)} />
                        </div>
                        {parsed.sections.length > 1 && (
                            <p className="text-[11px] text-gray-500">
                                Sections: {parsed.sections.map(s => `${s.name} (${s.rowCount} benches)`).join(', ')}{parsed.colStartLabel ? ` · columns run ${parsed.colStartLabel} → ${parsed.colEndLabel ?? '…'}` : ''}
                            </p>
                        )}
                        {scoreCounts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {scoreCounts.map(([score, n]) => (
                                    <span key={score} className="room-map-cell-chip">{score} {rotScoreLabel(score)} × {n}</span>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="field-label">Room</label>
                                <select className="field-input w-full" value={roomChoice} onChange={e => setRoomChoice(e.target.value)}>
                                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    <option value="__new__">New room…</option>
                                </select>
                                {roomChoice === '__new__' && (
                                    <input type="text" className="field-input w-full mt-1" placeholder="Room name" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} />
                                )}
                            </div>
                            <div>
                                <label className="field-label">Scores observed on</label>
                                <input type="date" className="field-input w-full" value={observedAt} onChange={e => setObservedAt(e.target.value)} max={today} />
                                {sheetDateIgnored ? (
                                    <p className="text-[11px] text-amber-700 mt-1">
                                        The sheet is titled {parsed.observedAt}{sheetDate.verdict === 'future' ? ', a future date' : `, ${sheetDate.ageDays} days ago`}, so it isn't being used as the scoring date. Change this if the scores really are from then.
                                    </p>
                                ) : parsed.observedAt && parsed.observedAt !== observedAt ? (
                                    <p className="text-[11px] text-gray-400 mt-1">Sheet says {parsed.observedAt}; using {observedAt}.</p>
                                ) : null}
                            </div>
                        </div>

                        <p className="text-[11px] text-gray-400">
                            Importing replaces the room's grid and tables, and replaces any sheet scores already logged for that date. Earlier sheet scores on this room are marked resolved.
                        </p>
                    </>
                )}

                {parsed?.warnings.length ? (
                    <ul className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 space-y-0.5">
                        {parsed.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
                        {parsed.warnings.length > 8 && <li>+{parsed.warnings.length - 8} more</li>}
                    </ul>
                ) : null}
                {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
        </Modal>
    );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="room-map-stat">
        <span className="room-map-stat-value">{value}</span>
        <span className="room-map-stat-label">{label}</span>
    </div>
);

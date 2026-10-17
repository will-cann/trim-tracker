import { describe, it, expect } from 'vitest';
import { normalizeSchematic, extractJson } from '../parse-room-schematic';

describe('normalizeSchematic', () => {
    it('keeps named rooms, validates types and grid bounds, derives capacity', () => {
        const out = normalizeSchematic({
            rooms: [
                { name: 'Flower Room 1', roomType: 'Flower', layoutRows: 4, layoutCols: 12.4, notes: ' 4 benches ' },
                { name: 'Veg A', roomType: 'vegetative', layoutRows: '3', layoutCols: 200, capacity: 70 },
                { name: '', roomType: 'flower', layoutRows: 2, layoutCols: 2 },
                { name: 'flower room 1', roomType: 'flower', layoutRows: 9, layoutCols: 9 },
                { name: 'Dry', roomType: 'dry' },
            ],
            notes: 'Hand sketch',
        });
        expect(out.notes).toBe('Hand sketch');
        expect(out.rooms).toHaveLength(3);
        expect(out.rooms[0]).toEqual({ name: 'Flower Room 1', roomType: 'flower', layoutRows: 4, layoutCols: 12, capacity: 48, squareFootage: null, notes: '4 benches' });
        // Unknown type → null; columns clamped to the grid max; printed capacity wins.
        expect(out.rooms[1]).toMatchObject({ roomType: null, layoutRows: 3, layoutCols: 60, capacity: 70 });
        expect(out.rooms[2]).toMatchObject({ name: 'Dry', roomType: 'dry', layoutRows: null, layoutCols: null, capacity: null });
    });

    it('returns no rooms for a non-schematic', () => {
        const out = normalizeSchematic({ rooms: [], notes: 'This is an invoice' });
        expect(out.rooms).toEqual([]);
        expect(out.notes).toBe('This is an invoice');
        expect(normalizeSchematic(null).rooms).toEqual([]);
    });
});

describe('extractJson', () => {
    it('reads fenced and bare JSON', () => {
        expect(extractJson('```json\n{"rooms":[]}\n```')).toEqual({ rooms: [] });
        expect(extractJson('Here you go {"rooms":[{"name":"A"}]} done')).toEqual({ rooms: [{ name: 'A' }] });
        expect(() => extractJson('no json')).toThrow();
    });
});

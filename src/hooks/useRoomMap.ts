import { useState, useEffect, useCallback } from 'react';
import type { PlantPhase, RoomMapData } from '../types/plantMap';
import { apiService } from '../services/apiService';

export const useRoomMap = (phase: PlantPhase, roomName: string | null) => {
    const [data, setData] = useState<RoomMapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchRoomMap = useCallback(async () => {
        if (!roomName) {
            setData(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await apiService.getRoomMap(phase, roomName) as RoomMapData;
            setData(result);
        } catch (err) {
            setError('Failed to load room data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [phase, roomName]);

    useEffect(() => {
        fetchRoomMap();
    }, [fetchRoomMap]);

    return { data, loading, error, refetch: fetchRoomMap };
};

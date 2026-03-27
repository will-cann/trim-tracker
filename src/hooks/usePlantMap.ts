import { useState, useEffect, useCallback } from 'react';
import type { PlantPhase, PlantMapData } from '../types/plantMap';
import { apiService } from '../services/apiService';

export const usePlantMap = (phase: PlantPhase) => {
    const [data, setData] = useState<PlantMapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMap = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await apiService.getPlantMap(phase) as PlantMapData;
            setData(result);
        } catch (err) {
            setError('Failed to load plant map');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [phase]);

    useEffect(() => {
        fetchMap();
    }, [fetchMap]);

    // Auto-refresh every 10 minutes
    useEffect(() => {
        const interval = setInterval(fetchMap, 600000);
        return () => clearInterval(interval);
    }, [fetchMap]);

    return { data, loading, error, refetch: fetchMap };
};

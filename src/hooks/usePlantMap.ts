import { useState, useEffect, useCallback } from 'react';
import type { PlantPhase, PlantMapData } from '../types/plantMap';
import { apiService } from '../services/apiService';

const ALL_PHASES: PlantPhase[] = ['nursery', 'vegetative', 'flowering'];

export const usePlantMap = (phase: PlantPhase | 'all') => {
    const [data, setData] = useState<PlantMapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMap = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (phase === 'all') {
                const results = await Promise.all(
                    ALL_PHASES.map(p => apiService.getPlantMap(p) as Promise<PlantMapData>)
                );
                // Merge: combine rooms across phases, summing plant counts
                const merged: PlantMapData = {};
                for (const phaseData of results) {
                    for (const [roomName, meta] of Object.entries(phaseData)) {
                        if (merged[roomName]) {
                            const existing = merged[roomName];
                            existing.totalPlants += meta.totalPlants;
                            existing.totalStrains = new Set([...existing.strains, ...meta.strains]).size;
                            existing.strains = [...new Set([...existing.strains, ...meta.strains])];
                            existing.contaminants = [...new Set([...existing.contaminants, ...meta.contaminants])];
                            existing.phaseDates = [...existing.phaseDates, ...meta.phaseDates];
                            existing.harvestDates = [...existing.harvestDates, ...meta.harvestDates];
                            existing.flipDates = [...existing.flipDates, ...meta.flipDates];
                            // Weighted average health
                            existing.plantHealth = Math.round(
                                (existing.plantHealth * (existing.totalPlants - meta.totalPlants) + meta.plantHealth * meta.totalPlants) / existing.totalPlants
                            );
                        } else {
                            merged[roomName] = { ...meta };
                        }
                    }
                }
                setData(merged);
            } else {
                const result = await apiService.getPlantMap(phase) as PlantMapData;
                setData(result);
            }
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

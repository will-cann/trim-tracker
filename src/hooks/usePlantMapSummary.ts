import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/apiService';
import type { PlantPhase, PlantMapData } from '../types/plantMap';

export interface PlantMapSummaryItem {
    roomName: string;
    roomId: string;
    strains: string[];
    plantIds: string[];
    entityType: 'plants' | 'plantbatches';
    plantHealth: number;
    contaminants: string[];
}

const PHASES: PlantPhase[] = ['nursery', 'vegetative', 'flowering'];
const ENTITY_FOR_PHASE: Record<PlantPhase, 'plants' | 'plantbatches'> = {
    nursery: 'plantbatches',
    vegetative: 'plants',
    flowering: 'plants',
};

export const usePlantMapSummary = () => {
    const [summary, setSummary] = useState<PlantMapSummaryItem[]>([]);

    const fetchSummary = useCallback(async () => {
        try {
            const results = await Promise.all(
                PHASES.map(phase => apiService.getPlantMap(phase) as Promise<PlantMapData>)
            );
            const items: PlantMapSummaryItem[] = [];
            results.forEach((data, i) => {
                const phase = PHASES[i];
                for (const [roomName, meta] of Object.entries(data)) {
                    items.push({
                        roomName,
                        roomId: meta.roomId,
                        strains: meta.strains,
                        plantIds: [],
                        entityType: ENTITY_FOR_PHASE[phase],
                        plantHealth: meta.plantHealth,
                        contaminants: meta.contaminants,
                    });
                }
            });
            setSummary(items);
        } catch {
            // Non-critical — AI just won't have plant context
        }
    }, []);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    // Refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(fetchSummary, 300000);
        return () => clearInterval(interval);
    }, [fetchSummary]);

    return summary;
};

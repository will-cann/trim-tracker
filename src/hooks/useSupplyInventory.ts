import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/apiService';
import type { SupplyPool, SupplyItem, SupplyLedgerEntry, SupplyPoolSlug } from '../types/definitions';

export const useSupplyInventory = (poolSlug?: SupplyPoolSlug) => {
    const [pools, setPools] = useState<SupplyPool[]>([]);
    const [items, setItems] = useState<SupplyItem[]>([]);
    const [loading, setLoading] = useState(true);

    const loadPools = useCallback(async () => {
        const data = await apiService.getSupplyPools();
        setPools(data);
    }, []);

    const loadItems = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getSupplyItems(poolSlug);
        setItems(data);
        setLoading(false);
    }, [poolSlug]);

    useEffect(() => {
        loadPools();
    }, [loadPools]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const saveItem = useCallback(async (item: Partial<SupplyItem> & { poolSlug: string; name: string }) => {
        const saved = await apiService.saveSupplyItem(item);
        await loadItems();
        return saved;
    }, [loadItems]);

    const deleteItem = useCallback(async (itemId: string) => {
        await apiService.deleteSupplyItem(itemId);
        await loadItems();
    }, [loadItems]);

    const receiveStock = useCallback(async (itemId: string, quantity: number, notes?: string) => {
        const result = await apiService.supplyLedgerEntry({ itemId, changeType: 'receive', quantity, notes });
        await loadItems();
        return result;
    }, [loadItems]);

    const consumeStock = useCallback(async (itemId: string, quantity: number, notes?: string) => {
        const result = await apiService.supplyLedgerEntry({ itemId, changeType: 'consume', quantity, notes });
        await loadItems();
        return result;
    }, [loadItems]);

    const adjustStock = useCallback(async (itemId: string, newQuantity: number, notes?: string) => {
        const result = await apiService.supplyLedgerEntry({ itemId, changeType: 'adjust', quantity: newQuantity, notes });
        await loadItems();
        return result;
    }, [loadItems]);

    const getLedger = useCallback(async (itemId?: string): Promise<SupplyLedgerEntry[]> => {
        return apiService.getSupplyLedger(itemId, poolSlug);
    }, [poolSlug]);

    const alertCount = items.filter(i => i.parLevel != null && i.quantityOnHand <= i.parLevel).length;

    return {
        pools,
        items,
        loading,
        alertCount,
        loadItems,
        saveItem,
        deleteItem,
        receiveStock,
        consumeStock,
        adjustStock,
        getLedger,
    };
};

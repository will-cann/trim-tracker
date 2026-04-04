import { useState, useEffect, useCallback } from 'react';
import { Store as StoreIcon, ShoppingCart, Package, Building2, Upload } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { Vendor, VendorProduct, Store, PurchaseOrder } from '../../types/definitions';
import { VendorList } from './VendorList';
import { ProductCatalog } from './ProductCatalog';
import { StoreList } from './StoreList';
import { OrderList } from './OrderList';
import { OrderBuilder } from './OrderBuilder';
import { MenuUploadModal } from './MenuUploadModal';

type Tab = 'vendors' | 'products' | 'stores' | 'orders';

export const OrderingDashboard = () => {
    const [tab, setTab] = useState<Tab>('vendors');
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);

    const [showUpload, setShowUpload] = useState(false);
    const [buildingOrderVendorId, setBuildingOrderVendorId] = useState<string | null>(null);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [v, p, s, o] = await Promise.all([
            apiService.getVendors(),
            apiService.getVendorProducts(),
            apiService.getStores(),
            apiService.getOrders(),
        ]);
        setVendors(v);
        setProducts(p);
        setStores(s);
        setOrders(o);
        setLoading(false);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const refreshVendors = useCallback(async () => {
        const v = await apiService.getVendors();
        setVendors(v);
    }, []);

    const refreshProducts = useCallback(async () => {
        const p = await apiService.getVendorProducts();
        setProducts(p);
    }, []);

    const refreshStores = useCallback(async () => {
        const s = await apiService.getStores();
        setStores(s);
    }, []);

    const refreshOrders = useCallback(async () => {
        const o = await apiService.getOrders();
        setOrders(o);
    }, []);

    const handleStartOrder = (vendorId: string) => {
        setBuildingOrderVendorId(vendorId);
        setEditingOrderId(null);
    };

    const handleEditOrder = (orderId: string) => {
        setEditingOrderId(orderId);
        setBuildingOrderVendorId(null);
    };

    const handleCloseBuilder = () => {
        setBuildingOrderVendorId(null);
        setEditingOrderId(null);
        refreshOrders();
    };

    // If order builder is active, show it full-screen
    if (buildingOrderVendorId || editingOrderId) {
        return (
            <OrderBuilder
                vendorId={buildingOrderVendorId}
                orderId={editingOrderId}
                vendors={vendors}
                stores={stores}
                onClose={handleCloseBuilder}
            />
        );
    }

    const TABS: { key: Tab; label: string; icon: typeof StoreIcon; count?: number }[] = [
        { key: 'vendors', label: 'Vendors', icon: Building2, count: vendors.length },
        { key: 'products', label: 'Products', icon: Package, count: products.length },
        { key: 'stores', label: 'Stores', icon: StoreIcon, count: stores.length },
        { key: 'orders', label: 'Orders', icon: ShoppingCart, count: orders.length },
    ];

    return (
        <div className="dashboard">
            <div className="dashboard-top-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="header-title">
                    <h4>Ordering</h4>
                </div>
                <button className="btn-primary" onClick={() => setShowUpload(true)}>
                    <Upload size={15} style={{ marginRight: 4 }} /> Upload Menu
                </button>
            </div>

            <div className="extraction-tabs">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        className={`extraction-tab ${tab === t.key ? 'extraction-tab--active' : ''}`}
                        onClick={() => setTab(t.key)}
                    >
                        <t.icon size={15} style={{ marginRight: 6, opacity: 0.7 }} />
                        {t.label}
                        {t.count != null && t.count > 0 && (
                            <span style={{
                                marginLeft: 6, fontSize: '0.6875rem', background: tab === t.key ? '#1A1A1A' : '#E8E8E8',
                                color: tab === t.key ? '#fff' : '#959595', borderRadius: 10, padding: '1px 7px',
                            }}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'vendors' && (
                <VendorList
                    vendors={vendors}
                    loading={loading}
                    onRefresh={refreshVendors}
                    onStartOrder={handleStartOrder}
                />
            )}
            {tab === 'products' && (
                <ProductCatalog
                    products={products}
                    vendors={vendors}
                    loading={loading}
                    onRefresh={refreshProducts}
                />
            )}
            {tab === 'stores' && (
                <StoreList
                    stores={stores}
                    loading={loading}
                    onRefresh={refreshStores}
                />
            )}
            {tab === 'orders' && (
                <OrderList
                    orders={orders}
                    loading={loading}
                    onRefresh={refreshOrders}
                    onEditOrder={handleEditOrder}
                />
            )}

            {showUpload && (
                <MenuUploadModal
                    onClose={() => setShowUpload(false)}
                    onSaved={() => { setShowUpload(false); loadAll(); }}
                />
            )}
        </div>
    );
};

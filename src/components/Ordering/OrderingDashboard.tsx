import { useState, useEffect, useCallback, useRef } from 'react';
import { Store as StoreIcon, ShoppingCart, Package, Building2, Upload, Loader2, CheckCircle2, X } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { Vendor, VendorProduct, Store, PurchaseOrder } from '../../types/definitions';
import { VendorList } from './VendorList';
import { ProductCatalog } from './ProductCatalog';
import { StoreList } from './StoreList';
import { OrderList } from './OrderList';
import { OrderBuilder } from './OrderBuilder';
import { MenuUploadModal, processFiles, EMPTY_PARSE_STATE } from './MenuUploadModal';
import type { ParseState } from './MenuUploadModal';

type Tab = 'vendors' | 'products' | 'stores' | 'orders';

export const OrderingDashboard = () => {
    const [tab, setTab] = useState<Tab>('products');
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);

    const [showUpload, setShowUpload] = useState(false);
    const [buildingOrderVendorId, setBuildingOrderVendorId] = useState<string | null>(null);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

    // Parse state lives here so it survives modal close
    const [parseState, setParseState] = useState<ParseState>(EMPTY_PARSE_STATE);
    const parseStateRef = useRef(parseState);
    parseStateRef.current = parseState;

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

    // Parse management — state updater uses a ref so the async loop always writes to current state
    const updateParseState = useCallback((updater: (prev: ParseState) => ParseState) => {
        setParseState(prev => {
            const next = updater(prev);
            parseStateRef.current = next;
            return next;
        });
    }, []);

    const handleStartParse = useCallback((files: File[]) => {
        processFiles(files, updateParseState);
    }, [updateParseState]);

    const handleUploadSaved = useCallback(() => {
        setShowUpload(false);
        loadAll();
    }, [loadAll]);

    const isParsing = parseState.active && parseState.step === 'parsing';
    const parseReady = parseState.active && parseState.step === 'review';
    const showToast = !showUpload && (isParsing || parseReady);

    const doneCount = parseState.fileStatuses.filter(f => f.status === 'done').length;
    const totalCount = parseState.fileStatuses.length;
    const totalProducts = parseState.products.length;

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
        { key: 'products', label: 'Products', icon: Package, count: products.length },
        { key: 'vendors', label: 'Vendors', icon: Building2, count: vendors.length },
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
                    parseState={parseState}
                    onUpdateParseState={updateParseState}
                    onStartParse={handleStartParse}
                    onClose={() => setShowUpload(false)}
                    onSaved={handleUploadSaved}
                />
            )}

            {/* Background parse toast */}
            {showToast && (
                <div style={{
                    position: 'fixed',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 200,
                    animation: 'slideUp 0.2s ease-out',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: '#1A1A1A',
                        color: '#fff',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        padding: '10px 16px',
                        minWidth: 300,
                        fontSize: '0.8125rem',
                    }}>
                        {isParsing ? (
                            <>
                                <Loader2 size={16} color="#3BB570" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>
                                    Parsing menus... {doneCount}/{totalCount} files
                                </span>
                                <button
                                    onClick={() => setShowUpload(true)}
                                    style={{ color: '#3BB570', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap' }}
                                >
                                    View
                                </button>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} color="#3BB570" style={{ flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>
                                    {totalProducts} products ready to review
                                </span>
                                <button
                                    onClick={() => setShowUpload(true)}
                                    style={{ color: '#3BB570', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                                >
                                    Review
                                </button>
                                <button
                                    onClick={() => setParseState(EMPTY_PARSE_STATE)}
                                    style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                                >
                                    <X size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

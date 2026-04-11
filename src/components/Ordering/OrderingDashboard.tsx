import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Store as StoreIcon, ShoppingCart, Package, Building2, Upload, Loader2, CheckCircle2, X, TrendingUp, Link2, Trash2 } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { Vendor, VendorProduct, Store, PurchaseOrder } from '../../types/definitions';
import type { AiMatchResult, SkuMatchProgress } from './SkuMatcherModal';
import { VendorList } from './VendorList';
import { ProductCatalog } from './ProductCatalog';
import { StoreList } from './StoreList';
import { OrderList } from './OrderList';
import { OrderBuilder } from './OrderBuilder';
import { MenuUploadModal, processFiles, EMPTY_PARSE_STATE } from './MenuUploadModal';
import type { ParseState } from './MenuUploadModal';
import { SalesImportModal } from './SalesImportModal';
import { SkuMatcherModal } from './SkuMatcherModal';

type Tab = 'vendors' | 'products' | 'stores' | 'orders';

export const OrderingDashboard = () => {
    const [tab, setTab] = useState<Tab>('products');
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);

    const [showUpload, setShowUpload] = useState(false);
    const [showSalesImport, setShowSalesImport] = useState(false);
    const [showSkuMatcher, setShowSkuMatcher] = useState(false);
    const [unmatchedCount, setUnmatchedCount] = useState(0);
    const [skuMatchProgress, setSkuMatchProgress] = useState<SkuMatchProgress>({
        status: 'idle', completed: 0, total: 0, results: [],
    });
    const skuMatchAbortRef = useRef(false);
    const [buildingOrderVendorId, setBuildingOrderVendorId] = useState<string | null>(null);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

    // Parse state lives here so it survives modal close
    const [parseState, setParseState] = useState<ParseState>(EMPTY_PARSE_STATE);
    const parseStateRef = useRef(parseState);
    parseStateRef.current = parseState;

    const refreshUnmatchedCount = useCallback(async () => {
        try {
            const result = await apiService.getUnmatchedSkus(500);
            setUnmatchedCount(result.unmatched.length);
        } catch (e) {
            console.error('Failed to load unmatched SKU count', e);
            setUnmatchedCount(0);
        }
    }, []);

    const handleClearSales = async () => {
        const ok = window.confirm(
            'Delete all imported sales data, inventory snapshots, and AI-generated SKU aliases?\n\n' +
            'Manual SKU aliases and vendor products will be preserved. This cannot be undone.'
        );
        if (!ok) return;
        try {
            const result = await apiService.clearSalesData();
            alert(
                `Cleared:\n` +
                `• ${result.salesDeleted} sales rows\n` +
                `• ${result.inventoryDeleted} inventory snapshots\n` +
                `• ${result.importsDeleted} import records\n` +
                `• ${result.aiAliasesDeleted} AI-generated aliases`
            );
            refreshUnmatchedCount();
        } catch (e) {
            alert('Failed to clear sales data: ' + (e instanceof Error ? e.message : 'unknown error'));
        }
    };

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
        refreshUnmatchedCount();
    }, [refreshUnmatchedCount]);

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

    const runSkuMatching = useCallback(async (unmatchedSkus: Array<{ sku: string; productName?: string; units60d?: number }>) => {
        if (unmatchedSkus.length === 0) return;
        skuMatchAbortRef.current = false;
        setSkuMatchProgress({ status: 'running', completed: 0, total: unmatchedSkus.length, results: [] });

        const results: AiMatchResult[] = [];
        for (let i = 0; i < unmatchedSkus.length; i++) {
            if (skuMatchAbortRef.current) break;
            try {
                const resp = await apiService.matchProductsAi({
                    unmatched: [unmatchedSkus[i]],
                });
                if (resp.matches.length > 0) results.push(...resp.matches);
            } catch (e) {
                // Log but continue — one failure shouldn't stop the rest
                console.error(`SKU match failed for ${unmatchedSkus[i].sku}:`, e);
                results.push({
                    sku: unmatchedSkus[i].sku,
                    vendorProductId: null,
                    confidence: 0,
                    reasoning: 'AI call failed',
                });
            }
            setSkuMatchProgress(prev => ({ ...prev, completed: i + 1, results: [...results] }));
        }
        setSkuMatchProgress(prev => ({ ...prev, status: skuMatchAbortRef.current ? 'idle' : 'done' }));
    }, []);

    const cancelSkuMatching = useCallback(() => {
        skuMatchAbortRef.current = true;
    }, []);

    const clearSkuMatchResults = useCallback(() => {
        setSkuMatchProgress({ status: 'idle', completed: 0, total: 0, results: [] });
    }, []);

    const isParsing = parseState.active && parseState.step === 'parsing';
    const parseReady = parseState.active && parseState.step === 'review';
    const showParseToast = !showUpload && (isParsing || parseReady);
    const showSkuToast = !showSkuMatcher && skuMatchProgress.status !== 'idle';

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
        <>
        <div className="dashboard">
            <div className="dashboard-top-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="header-title">
                    <h4>Ordering</h4>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className="btn-cancel"
                        onClick={() => setShowSkuMatcher(true)}
                        title={
                            unmatchedCount > 0
                                ? `${unmatchedCount} POS SKU${unmatchedCount !== 1 ? 's' : ''} in your sales data don't match any vendor product yet. Click to run AI matching.`
                                : 'Map POS SKUs from imported sales data to canonical vendor products so order suggestions can use sales velocity.'
                        }
                    >
                        <Link2 size={15} style={{ marginRight: 4 }} />
                        Match SKUs
                        {unmatchedCount > 0 && (
                            <span style={{
                                marginLeft: 6, fontSize: '0.6875rem', background: '#DC8B47', color: '#fff',
                                borderRadius: 10, padding: '1px 7px', fontWeight: 600,
                            }}>
                                {unmatchedCount}
                            </span>
                        )}
                    </button>
                    <button
                        className="btn-cancel"
                        onClick={handleClearSales}
                        title="Wipe all imported sales data, inventory snapshots, and AI-generated aliases for this company"
                    >
                        <Trash2 size={15} style={{ marginRight: 4 }} /> Clear Sales
                    </button>
                    <button className="btn-cancel" onClick={() => setShowSalesImport(true)}>
                        <TrendingUp size={15} style={{ marginRight: 4 }} /> Import Sales
                    </button>
                    <button className="btn-primary" onClick={() => setShowUpload(true)}>
                        <Upload size={15} style={{ marginRight: 4 }} /> Upload Menu
                    </button>
                </div>
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

            {showSalesImport && (
                <SalesImportModal
                    stores={stores}
                    onClose={() => { setShowSalesImport(false); refreshUnmatchedCount(); }}
                    onImported={refreshUnmatchedCount}
                />
            )}

            {showSkuMatcher && (
                <SkuMatcherModal
                    products={products}
                    vendors={vendors}
                    progress={skuMatchProgress}
                    onRunMatching={runSkuMatching}
                    onCancelMatching={cancelSkuMatching}
                    onClearResults={clearSkuMatchResults}
                    onClose={() => setShowSkuMatcher(false)}
                    onSaved={refreshUnmatchedCount}
                />
            )}

        </div>

            {/* SKU matching toast */}
            {showSkuToast && createPortal(
                <div style={{
                    position: 'fixed',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
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
                        {skuMatchProgress.status === 'running' ? (
                            <>
                                <Loader2 size={16} color="#3BB570" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>
                                    Matching SKUs... {skuMatchProgress.completed}/{skuMatchProgress.total}
                                </span>
                                <button
                                    onClick={() => setShowSkuMatcher(true)}
                                    style={{ color: '#3BB570', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap' }}
                                >
                                    View
                                </button>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} color="#3BB570" style={{ flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>
                                    {skuMatchProgress.results.filter(m => m.vendorProductId).length} matches ready to review
                                </span>
                                <button
                                    onClick={() => setShowSkuMatcher(true)}
                                    style={{ color: '#3BB570', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                                >
                                    Review
                                </button>
                                <button
                                    onClick={clearSkuMatchResults}
                                    style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                                >
                                    <X size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>,
                document.body,
            )}

            {/* Background parse toast — portaled to body to escape any overflow/transform containers */}
            {showParseToast && createPortal(
                <div style={{
                    position: 'fixed',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
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
                </div>,
                document.body,
            )}
        </>
    );
};

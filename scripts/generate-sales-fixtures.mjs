#!/usr/bin/env node
/**
 * Generates Dutchie-style sales CSV fixtures for testing the ordering workflow.
 *
 * Writes one CSV per simulated store to tests/fixtures/sales/.
 * Each file contains ~10 weeks of daily sales for ~40 SKUs with varied velocity
 * patterns (bangers, stragglers, trending up, trending down, brand new) plus a
 * snapshot on-hand column on the most recent date so store_inventory gets populated.
 *
 * The SKU names are realistic Dutchie exports — they intentionally do NOT match
 * any vendor catalog directly, so the AI SKU matcher gets a real workout.
 *
 * Usage:
 *   node scripts/generate-sales-fixtures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'tests', 'fixtures', 'sales');

const STORES = [
    'downtown',
    'south-county',
    'boulder',
];

// Realistic product catalog. Each entry will become a row per day with varying velocity.
// pattern: 'banger' (high steady), 'straggler' (low), 'rising' (accelerating), 'falling' (declining), 'new' (only recent)
const PRODUCTS = [
    // Wyld edibles — bangers
    { sku: 'WYLD-RASP-100-10', name: 'Wyld Raspberry Sativa Gummies 100mg 10pk', basePrice: 18.00, base: 8, pattern: 'banger' },
    { sku: 'WYLD-MARION-100-10', name: 'Wyld Marionberry Indica Gummies 100mg 10pk', basePrice: 18.00, base: 6, pattern: 'banger' },
    { sku: 'WYLD-PEAR-100-10', name: 'Wyld Pear CBD Gummies 100mg 10pk', basePrice: 22.00, base: 2, pattern: 'straggler' },
    { sku: 'WYLD-HUCKLE-100-10', name: 'Wyld Huckleberry Hybrid Gummies 100mg 10pk', basePrice: 18.00, base: 4, pattern: 'rising' },

    // Kiva chocolates
    { sku: 'KIVA-CHOC-DARK-100', name: 'Kiva Dark Chocolate Bar 100mg', basePrice: 16.00, base: 5, pattern: 'banger' },
    { sku: 'KIVA-CHOC-MILK-100', name: 'Kiva Milk Chocolate Bar 100mg', basePrice: 16.00, base: 3, pattern: 'falling' },
    { sku: 'KIVA-MINT-100', name: 'Kiva Petra Mints 100mg', basePrice: 14.00, base: 4, pattern: 'banger' },
    { sku: 'KIVA-BLUEBERRY-100', name: 'Kiva Camino Blueberry Gummies 100mg', basePrice: 18.00, base: 5, pattern: 'rising' },

    // Stiiizy carts — bangers
    { sku: 'STIIIZY-BD-1G', name: 'Stiiizy Blue Dream Pod 1g', basePrice: 35.00, base: 12, pattern: 'banger' },
    { sku: 'STIIIZY-OG-1G', name: 'Stiiizy Skywalker OG Pod 1g', basePrice: 35.00, base: 10, pattern: 'banger' },
    { sku: 'STIIIZY-PINEAPPLE-1G', name: 'Stiiizy Pineapple Express Pod 1g', basePrice: 35.00, base: 7, pattern: 'rising' },
    { sku: 'STIIIZY-BIRTHDAY-1G', name: 'Stiiizy Birthday Cake Pod 1g', basePrice: 35.00, base: 4, pattern: 'falling' },
    { sku: 'STIIIZY-BD-05', name: 'Stiiizy Blue Dream Pod 0.5g', basePrice: 22.00, base: 6, pattern: 'banger' },

    // Raw Garden carts
    { sku: 'RAWGRDN-LIVERESIN-1G', name: 'Raw Garden Live Resin Cart 1g', basePrice: 38.00, base: 8, pattern: 'banger' },
    { sku: 'RAWGRDN-DIAMOND-05', name: 'Raw Garden Diamond Cart 0.5g', basePrice: 22.00, base: 5, pattern: 'rising' },

    // Flower
    { sku: 'CONNECTED-BISCOTTI-3.5', name: 'Connected Biscotti 3.5g Flower', basePrice: 50.00, base: 6, pattern: 'banger' },
    { sku: 'CONNECTED-GELATI-3.5', name: 'Connected Gelati 3.5g Flower', basePrice: 50.00, base: 5, pattern: 'banger' },
    { sku: 'CONNECTED-CUEBALL-3.5', name: 'Connected Cueball 3.5g Flower', basePrice: 50.00, base: 3, pattern: 'rising' },
    { sku: 'JEETER-BD-1G', name: 'Jeeter Blue Dream Pre-Roll 1g', basePrice: 12.00, base: 9, pattern: 'banger' },
    { sku: 'JEETER-WCAKE-1G', name: 'Jeeter Wedding Cake Pre-Roll 1g', basePrice: 12.00, base: 7, pattern: 'banger' },
    { sku: 'JEETER-INFUSED-XL', name: 'Jeeter Infused XL Pre-Roll 2g', basePrice: 30.00, base: 5, pattern: 'rising' },

    // Concentrates
    { sku: 'PAPAS-LIVE-1G', name: 'Papa & Barkley Live Resin 1g', basePrice: 45.00, base: 3, pattern: 'straggler' },
    { sku: 'PAPAS-ROSIN-1G', name: 'Papa & Barkley Solventless Rosin 1g', basePrice: 60.00, base: 2, pattern: 'rising' },

    // Drinks
    { sku: 'CANN-GRAPEFRUIT-5MG', name: 'Cann Grapefruit Rosemary Tonic 5mg', basePrice: 6.00, base: 8, pattern: 'banger' },
    { sku: 'CANN-LEMON-5MG', name: 'Cann Lemon Lavender Tonic 5mg', basePrice: 6.00, base: 6, pattern: 'banger' },
    { sku: 'PABST-COLD-5MG', name: 'Pabst Cold Brew Coffee 5mg', basePrice: 8.00, base: 4, pattern: 'rising' },

    // Some new launches (only sales in last 2 weeks)
    { sku: 'WYLD-WATERMELON-100-10', name: 'Wyld Watermelon Hybrid Gummies 100mg 10pk', basePrice: 18.00, base: 5, pattern: 'new' },
    { sku: 'STIIIZY-MOCHA-1G', name: 'Stiiizy Mocha Madness Pod 1g', basePrice: 35.00, base: 6, pattern: 'new' },

    // Stragglers
    { sku: 'OLD-VAPE-DIST', name: 'Generic Distillate Vape Cart 1g', basePrice: 18.00, base: 1, pattern: 'straggler' },
    { sku: 'OLD-EDIBLE-CARAMEL', name: 'House Brand Caramel Chews 100mg', basePrice: 10.00, base: 1, pattern: 'falling' },
    { sku: 'OLD-PREROLL-MIX', name: 'Mixed Strain Pre-Roll Pack 5pk', basePrice: 15.00, base: 2, pattern: 'straggler' },
];

// Per-store volume multiplier (boulder is biggest)
const STORE_MULTIPLIER = {
    'downtown': 1.0,
    'south-county': 0.7,
    'boulder': 1.4,
};

const DAYS = 70; // 10 weeks
const HALF = Math.floor(DAYS / 2);

// Deterministic pseudo-random for reproducible fixtures
function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function dailyUnits(product, dayIndexFromEnd, storeMult, rng) {
    // dayIndexFromEnd: 0 = today, 69 = 70 days ago
    const base = product.base * storeMult;
    let mult = 1;
    switch (product.pattern) {
        case 'banger': mult = 1; break;
        case 'straggler': mult = 1; break;
        case 'rising':
            // Recent half ~1.6x older half
            mult = dayIndexFromEnd < HALF ? 1.4 : 0.7;
            break;
        case 'falling':
            mult = dayIndexFromEnd < HALF ? 0.6 : 1.3;
            break;
        case 'new':
            // Only sales in last 14 days
            if (dayIndexFromEnd >= 14) return 0;
            mult = 1;
            break;
    }
    // Day-of-week effect — Friday/Saturday spike
    const today = new Date();
    const date = new Date(today);
    date.setDate(today.getDate() - dayIndexFromEnd);
    const dow = date.getDay();
    if (dow === 5 || dow === 6) mult *= 1.4;
    if (dow === 1) mult *= 0.7;

    // Random noise ±30%
    const noise = 0.7 + rng() * 0.6;
    const units = Math.round(base * mult * noise);
    return Math.max(0, units);
}

function formatDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
}

function escapeCsv(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

async function generateStore(storeName, seed) {
    const rng = mulberry32(seed);
    const mult = STORE_MULTIPLIER[storeName];
    const rows = [];

    // Header — Dutchie-style column names
    rows.push([
        'Sale Date',
        'Product SKU',
        'Product Name',
        'Brand',
        'Category',
        'Units Sold',
        'Revenue',
        'On Hand',
    ].map(escapeCsv).join(','));

    for (let day = DAYS - 1; day >= 0; day--) {
        const date = formatDate(day);
        for (const p of PRODUCTS) {
            const units = dailyUnits(p, day, mult, rng);
            if (units === 0) continue;
            const revenue = (units * p.basePrice).toFixed(2);
            // Only emit on_hand for the most recent day per SKU (simulated current snapshot)
            // We'll set onHand on day 0 only — derived from average daily * 4 days minus a bit
            const onHand = day === 0
                ? Math.max(0, Math.round(p.base * mult * (1 + rng() * 4)))
                : '';
            const brand = p.name.split(' ')[0];
            const category = inferCategory(p.name);
            rows.push([
                date,
                p.sku,
                p.name,
                brand,
                category,
                units,
                revenue,
                onHand,
            ].map(escapeCsv).join(','));
        }
    }

    return rows.join('\n');
}

function inferCategory(name) {
    const n = name.toLowerCase();
    if (n.includes('gummies') || n.includes('chocolate') || n.includes('mints') || n.includes('chews') || n.includes('caramel')) return 'edible';
    if (n.includes('cart') || n.includes('pod')) return 'vape';
    if (n.includes('pre-roll')) return 'pre-roll';
    if (n.includes('flower')) return 'flower';
    if (n.includes('rosin') || n.includes('resin') || n.includes('distillate')) return 'concentrate';
    if (n.includes('tonic') || n.includes('coffee') || n.includes('drink')) return 'drink';
    return 'other';
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    let seed = 42;
    for (const store of STORES) {
        const csv = await generateStore(store, seed++);
        const path = join(OUT_DIR, `${store}-sales.csv`);
        await writeFile(path, csv, 'utf8');
        const rowCount = csv.split('\n').length - 1;
        console.log(`✓ ${path} (${rowCount} rows)`);
    }
    console.log(`\nDone. Import these via the Ordering → Import Sales button.`);
    console.log(`Tip: create stores named "Downtown", "South County", and "Boulder" first.`);
}

main().catch(err => { console.error(err); process.exit(1); });

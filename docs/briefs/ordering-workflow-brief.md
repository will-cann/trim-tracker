# Ordering Workflow Feature Plan

## Problem

A buyer managing 20+ vendor relationships across 11-12 retail stores spends hours per week on a manual spreadsheet-based ordering process:

1. **Vendor menus arrive in inconsistent formats** (different Excel layouts, merged cells, varying SKU structures, strain rotation)
2. **Velocity calculation is manual** — rolling 8-week average per SKU per store, adjusted for seasonality and promo effects
3. **Order decisions are SKU-by-SKU** — some products are bangers, some are stragglers; static par levels don't work
4. **10-15 min per store per vendor** = 2+ hours per order cycle just filling forms, not counting interruptions
5. **No central distribution** — each order goes direct to a specific store, so quantities must be calculated per-store
6. **Vault space constraints** — can't just over-order; physical storage limits matter

## Core Insight

The buyer doesn't use static par levels. They use **velocity-derived dynamic pars**: rolling 8-week sales average per SKU, factoring in lead time and order cadence. The formula is roughly:

```
order_qty = (velocity_per_day * (lead_time_days + order_cadence_days)) - inventory_on_hand
```

But this is constantly adjusted for promos, seasonality, and judgment calls. The 8-week window is chosen to wash out promotional spikes.

## User Workflow (Current State)

```
Vendor sends menu (Excel/PDF) 
  → Buyer opens POS sales data (Dutchie) 
  → Calculates 8-week velocity per SKU per store
  → Compares against current inventory
  → Determines order qty (velocity math + judgment)
  → Fills out vendor order form (stores as columns, SKUs as rows)
  → Sends order back to vendor rep
```

## Feature Design

### Phase 1: Menu Ingestion & Normalization

**Goal:** Get vendor menus into a standard format the system can work with.

- **Upload vendor menus** (Excel, CSV, PDF) via drag-and-drop
- **AI-powered parsing** to extract: product name, brand, category, SKU, unit size, case size, price, availability
- **Normalization layer** — map messy vendor formats to a canonical schema
- **Vendor profiles** — save parsing rules per vendor so repeat menus get parsed faster
- **Menu management UI** — browse active menus, see last updated, mark items as discontinued/seasonal

**Data model additions:**
```
vendors (id, company_id, name, contact_info, lead_time_days, order_cadence_days, notes)
vendor_menus (id, vendor_id, uploaded_at, file_url, status, parsed_data)
vendor_products (id, vendor_id, name, brand, category, sku, unit_size, case_size, unit_price, case_price, active)
```

### Phase 2: Sales Velocity Engine

**Goal:** Automated velocity calculations from POS data.

- **Dutchie API integration** — pull sales data per store per SKU
- **Velocity calculation** — configurable rolling window (default 8 weeks), auto-exclude promo periods if tagged
- **Per-store, per-SKU velocity** with trend indicators (accelerating/stable/declining)
- **Promo flagging** — mark date ranges as promotional so velocity isn't skewed (or auto-detect from price drops)
- **Seasonality overlay** — year-over-year comparison when enough data exists

**Data model additions:**
```
pos_connections (id, company_id, provider, api_credentials, last_sync)
stores (id, company_id, name, pos_store_id, vault_capacity_notes)
sales_data (id, store_id, product_sku, date, units_sold, revenue)
velocity_cache (id, store_id, product_sku, window_weeks, velocity_per_day, trend, calculated_at)
```

### Phase 3: Order Builder (The Core)

**Goal:** AI generates a baseline order per vendor per store; buyer fine-tunes and submits.

- **Order matrix view** — stores as columns, vendor SKUs as rows (matching the buyer's current mental model)
- **Auto-populated quantities** based on: `(velocity * coverage_days) - inventory_on_hand`
- **Color coding**: green (well-stocked), yellow (reorder soon), red (out/critical), gray (new/no history)
- **AI recommendations with reasoning** — "Suggesting 2 cases: 8-week velocity is 4.2/day, 10-day lead time, you have 12 on hand"
- **Override & adjust** — buyer can change any qty; system remembers manual adjustments as feedback
- **Store-level notes** — e.g., "Boulder gets all exclusive drops", "South County gets promo stock"
- **Vault space warnings** — flag when total incoming exceeds estimated capacity
- **Order summary** — total units, total cost, per-store breakdown before submission

**Data model additions:**
```
purchase_orders (id, company_id, vendor_id, status, created_at, submitted_at, expected_delivery, notes)
purchase_order_lines (id, order_id, store_id, vendor_product_id, qty_units, qty_cases, unit_price, auto_suggested_qty, final_qty)
order_templates (id, vendor_id, store_id, product_preferences)  -- remembered adjustments
```

### Phase 4: Order Submission & Tracking

**Goal:** Get orders out the door and track fulfillment.

- **Export to vendor format** — generate filled-out order form in the vendor's own Excel template
- **Email draft** — auto-compose email to vendor rep with order attached
- **Order history** — searchable log of all past orders with quantities and costs
- **Delivery tracking** — mark orders received, flag discrepancies
- **Reorder reminders** — based on vendor cadence, notify when it's time to reorder

### Phase 5: AI Chat Integration

**Goal:** The ordering workflow works through the existing NeuroCann AI chat interface.

- "What should I order from Wild this week?" → generates order matrix based on current velocity + inventory
- "Show me velocity trends for Curator products across all stores" → visualization
- "Flag any SKUs where we're below 5-day supply" → alert list
- "I ran a promo on honeybee edibles last two weeks, exclude that from velocity" → adjusts calculations
- Upload a new menu PDF in chat → parsed and added to vendor catalog

## Technical Approach

### AI Parsing Pipeline (Phase 1)
The existing `ai-parse` function pattern works well here. New function:
- `parse-vendor-menu` — accepts file upload, sends to Claude with instructions to extract structured product data
- Uses vision API for PDFs with embedded images/logos
- Returns normalized `vendor_products[]` for review before saving

### POS Integration (Phase 2)
- New Netlify function: `dutchie-sync` — scheduled or on-demand sync of sales data
- Store mapping UI to connect Dutchie store IDs to NeuroCann stores
- Background job to compute/refresh velocity cache nightly

### Order Builder (Phase 3)
- New view: `ordering` added to `ViewType`
- Components: `VendorSelector`, `OrderMatrix`, `VelocityCell`, `OrderSummary`
- AI endpoint extension: new action types in `ai-parse` for order recommendations

## What This Doesn't Cover (Yet)

- **Direct POS ordering** (submitting orders through Dutchie/Leaflink API) — start with email/export
- **First-party ordering** (own grows) — handled by a separate supply chain team
- **Margin analysis / credit reports** — future layer on top of order history + sales data
- **METRC compliance for inbound transfers** — separate integration concern
- **Multi-user collaboration** — buyer + assistant working on same orders simultaneously

## Success Metrics

- Time to generate a store order drops from 10-15 min to < 2 min (review & adjust AI baseline)
- Full ordering cycle (all stores, one vendor) drops from 2+ hours to < 30 min
- Velocity calculations are automated — no more manual spreadsheet math
- Vendor menu ingestion takes < 1 min vs. manual reformatting

## Build Order

1. **Vendor + store data model** (tables, migrations, CRUD functions)
2. **Menu upload + AI parsing** (most novel, highest risk — validate early)
3. **Dutchie integration** (unlocks velocity — investigate API access first)
4. **Velocity engine** (calculations, caching, trend detection)
5. **Order matrix UI** (the core interface)
6. **AI chat integration** (leverage existing patterns)
7. **Export + email** (order submission)

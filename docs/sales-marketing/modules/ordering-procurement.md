# Ordering & Procurement

**Elevator pitch:** Build multi-store POs from vendor menus and POS sales velocity, and keep biomass suppliers warm with AI-drafted email threads.

## Who it's for

Buyers, inventory planners, procurement managers; extraction sourcing for biomass vendors.

**Nav:** Ordering · Department: procurement · Min role: department_manager+

## Problem

Buyers juggle inconsistent vendor menus, Dutchie/POS exports, and supplier outreach across email and spreadsheets. Static par levels don't match real SKU velocity across many stores.

## Value

Catalog → velocity suggestions → multi-store PO matrix → biomass supplier CRM in one module. Order quantity math mirrors how serious buyers already think: rolling sales average × coverage window − on hand.

## Key capabilities (shipped)

- Tabs: Vendors, Products, Stores, Orders
- Vendor CRUD: consumables | biomass | both; lead time, order cadence, contacts, strains grown, preferred channel
- AI menu parse (PDF/CSV/Excel) → review → save vendor products
- Multi-store registry; sales CSV import + inventory snapshots; clear sales data utility
- AI SKU matcher for unmatched POS SKUs → vendor product aliases
- Order builder: product × store qty matrix; velocity suggestions with cover status (red/yellow/green); apply-all; draft or submit
- Purchase order list with totals / expected delivery
- Biomass supplier detail: strains, products, contact thread timeline
- Supplier email: AI compose → editable preview → SendGrid send; inbound parse on replies domain → threads; replies can update vendor products
- Cron reminders create outreach human tasks when cadence lapses

## Status workflows

PO: draft → submitted (schema also supports confirmed / delivered / cancelled)  
Vendor menu parse: pending → parsing → parsed | failed  
Contact threads: open (email; SMS channel in schema only)

## Demo script

1. Upload a vendor menu → review parsed products → save catalog.
2. Import store sales CSV → show unmatched SKU count → run AI matcher.
3. Start order → Apply suggestions from velocity → submit PO.
4. "Ask Mike if he has Blue Dream frozen" → editable email draft → send → show thread.
5. Show overdue outreach reminder task from cadence cron.

## Talking points

- "This is the buyer's matrix — stores as columns, SKUs as rows — with velocity filling the cells."
- "Menus arrive messy; AI normalizes them into a catalog you can reorder from."
- "Biomass outreach is a thread, not a one-off mailto."

## Differentiators

- Velocity-driven multi-store PO matrix tied to imported POS data
- Biomass CRM with inbound email → structured product rows
- Same AI surface for talking to suppliers and building the order

## Do not claim

- Live Dutchie / POS API sync (CSV import only today)
- SMS supplier outreach (schema only; no SMS provider)
- That submitting a PO emails the vendor (status flip only; outreach is the separate supplier email flow)
- That chat AI currently proposes create_order / create_store / add_vendor_product (executor supports them; conversational tools not fully wired — use the Ordering UI for those demos)

## Related modules

[Supplies](./supplies.md) · [Extraction](./extraction.md) · [Tasks](./tasks.md) · [AI & Voice](./ai-voice.md)

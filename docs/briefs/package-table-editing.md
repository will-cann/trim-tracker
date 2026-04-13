# Package Table Editing + Mutation Safety Fixes

## Context

The PackageDashboard has two view modes: cards and table. Card view has full inline editing (waste weight, location, lab state, item name, notes), status transitions, quantity adjustments, and delete. Table view is completely read-only — clicking a row does nothing. We're adding row-click detail/edit capability for the table view, then fixing data safety issues found in a backend audit.

---

## Part 1: Table Row Detail Modal

**Problem:** Users in table view have zero interactivity. To edit a package they must switch to card view, find the card, expand it, then edit. This defeats the purpose of the table view for users who prefer dense scanning.

**Approach:** Click a table row to open a `PackageDetailModal` with the same mutation capabilities as the expanded PackageCard.

### Files to modify
- `src/components/Packages/PackageDashboard.tsx` — add `selectedPackage` state, pass `onRowClick` to DataTable, render modal
- `src/components/Packages/PackageDetailModal.tsx` — **new file**

### PackageDetailModal design
- **Header:** label + status chip + type chip (mirrors card header)
- **Read-only section:** strain, license, packaged date, tag number, source harvest/packages, METRC flags
- **Editable fields** (when status is active or on_hold): waste weight, location (room dropdown), lab testing state (chip buttons), item name, notes
- **Quantity adjustment form:** same as PackageCard — amount, reason dropdown, notes, apply/cancel, preview of before/after quantity
- **Adjustment history:** last 5 entries with delta, reason, date
- **Status action buttons:** Hold / Finish / Release / Reactivate (same logic as card)
- **Delete button:** with existing `DeleteConfirmationModal`
- **Save/Cancel** for field edits

### Key decisions
- Reuse `Modal` component (`src/components/ui/Modal.tsx`) — size `lg`
- DataTable already supports `onRowClick` — just needs the callback wired up
- Extract shared constants from PackageCard (`LAB_OPTIONS`, `LAB_LABEL`, `LAB_CLASS`, `ADJUSTMENT_REASONS`, `EditFields` interface) to avoid duplication
- After any mutation, reload packages and update `selectedPackage` with fresh data (or close modal if deleted)

### DataTable wiring
```tsx
<DataTable
  columns={PACKAGE_COLUMNS}
  data={sortedPackages}
  onRowClick={(pkg) => setSelectedPackage(pkg)}
  sortKey={...} sortDir={...} onSort={...}
/>
{selectedPackage && (
  <PackageDetailModal
    pkg={selectedPackage}
    onUpdate={handleUpdate}
    onDelete={handleDelete}
    onClose={() => setSelectedPackage(null)}
  />
)}
```

---

## Part 2: Mutation Safety Fixes

Backend audit of all 6 package-related Netlify functions. SQL injection is safe throughout (all parameterized). Three issues found:

### Fix 1 — CRITICAL: Missing company_id in DELETE

**File:** `netlify/functions/delete-package.ts`, line 47
**Current:** `DELETE FROM packages WHERE id = $1`
**Problem:** The SELECT on line 30 checks company_id, but the DELETE does not. Within the transaction the SELECT acts as a guard, but defense-in-depth requires the DELETE itself to be scoped. If the transaction isolation level or code path changes, this becomes a cross-tenant deletion vulnerability.
**Fix:** `DELETE FROM packages WHERE id = $1 AND company_id = $2` with `context.companyId` as second param.

### Fix 2 — MEDIUM: Missing company_id in quantity UPDATE

**File:** `netlify/functions/create-package-adjustment.ts`, lines 76-78
**Current:** `UPDATE packages SET quantity = $1 WHERE id = $2`
**Problem:** Same pattern — the SELECT+FOR UPDATE on line 49 scopes by company_id, but the UPDATE does not. The row lock from FOR UPDATE does prevent concurrent access within the transaction, but the UPDATE should independently scope by company_id for defense-in-depth.
**Fix:** `UPDATE packages SET quantity = $1 WHERE id = $2 AND company_id = $3` with `context.companyId`.

### Fix 3 — BUG: Undefined role in authorization check

**File:** `netlify/functions/create-package-adjustment.ts`, line 18
**Current:** `authorize(context, 'lead')`
**Problem:** `ROLE_LEVEL` in `utils/auth.ts` defines only `admin(50)`, `director(40)`, `department_manager(30)`, `technician(10)`. `'lead'` is not a key, so `ROLE_LEVEL['lead']` returns `undefined`. The comparison `userLevel < undefined` evaluates to `false` in JS (NaN comparison), meaning this check **passes for everyone** — it's effectively no authorization at all.
**Fix:** Change to `authorize(context, 'technician')` — consistent with `update-package.ts` and appropriate for package mutations.

---

## What's already solid
- `update-package.ts` — properly scopes by company_id in the UPDATE RETURNING query, validates against allowedFields allowlist, blocks direct quantity changes
- `create-package.ts` — uses transactions for batch creation + tag assignment
- `create-package-adjustment.ts` — uses FOR UPDATE locking to prevent concurrent adjustment race conditions, validates negative quantity, validates reason enum
- `get-packages.ts` / `get-package-adjustments.ts` — properly scoped by company_id
- Frontend uses server-authoritative reloads (no dangerous optimistic updates for create/update/delete)

---

## Verification plan
1. `npm run build` — type check passes
2. `npm run dev` — open packages in table view, click row, modal opens with all fields
3. Test in modal: edit fields and save, adjust quantity, change status, delete
4. Verify card view still works identically (no regressions from constant extraction)
5. Backend: confirm all DELETE/UPDATE queries include company_id in WHERE clause

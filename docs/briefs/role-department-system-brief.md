# Feature Brief: Role + Department Permission System

## Problem

The current role system (`admin > manager > lead > worker`) is a flat hierarchy that doesn't map to real cannabis facility org structures. Large operations have 8+ distinct job roles (Director of Operations, Cultivation Manager, Extraction Manager, Procurement Manager, Lab Manager, Trim Manager, Post-Harvest Manager, Technicians) who each own specific operational domains.

Additionally, the AI model powering each user's chat should vary by role tier — managers need Opus for strategic planning; technicians only need Haiku for task logging. This enables tiered seat-based pricing.

## Solution

Replace the 4-level role hierarchy with a **3-tier role + department scoping** system.

### Role Tiers

| Tier | DB value | AI Model | Purpose |
|------|----------|----------|---------|
| Director | `director` | Opus | Full cross-department access, strategic planning |
| Department Manager | `department_manager` | Opus | Full access to owned departments, strategic AI tools |
| Technician | `technician` | Haiku | Task completion, weight logging, supply consumption |

### Departments

Stored as `TEXT[]` on the user record:

```
cultivation, extraction, post_harvest, trim, procurement, lab, compliance
```

- Director: implicit access to all departments (empty array = all)
- Manager: access limited to their `departments[]`
- Technician: scoped to assigned departments

### Real-World Role Mapping

| Job Title | role | departments |
|-----------|------|-------------|
| Director of Operations | `director` | `[]` (all) |
| Cultivation Manager | `department_manager` | `[cultivation]` |
| Post-Harvest Manager | `department_manager` | `[post_harvest, trim]` |
| Trim Manager | `department_manager` | `[trim]` |
| Extraction Manager | `department_manager` | `[extraction]` |
| Lab Manager | `department_manager` | `[lab, compliance]` |
| Procurement Manager | `department_manager` | `[procurement]` |
| Cultivation Tech | `technician` | `[cultivation]` |
| Trim Worker | `technician` | `[trim]` |
| Extraction Tech | `technician` | `[extraction]` |

### Module → Department Mapping

| Module (sidebar view) | Department | Director | Manager (if dept matches) | Technician (if dept matches) |
|-----------------------|------------|----------|---------------------------|------------------------------|
| Plants / Plant Map | cultivation | Full | Full | View + log |
| Harvests | cultivation | Full | Full | View + log weights |
| Harvest Day | post_harvest | Full | Full | Log weights |
| Trim Sessions | trim | Full | Full | Own entries only |
| Packages | post_harvest, extraction, lab | Full | Full | View |
| Extraction | extraction | Full | Full | Log only |
| SOPs | (matches user's depts) | Full | Full | View assigned |
| Ordering | procurement | Full | Full | Hidden |
| Supplies | (pool matches dept) | Full | Full | View + consume |
| Tasks | (all, filtered by dept) | All tasks | Dept tasks | Own tasks only |
| Reports | (matches user's depts) | Full | Full | Hidden |
| Team / Settings | (admin only) | Full | Hidden | Hidden |

## Database Changes

### Migration: `036_role_departments.sql`

```sql
-- Add departments column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';

-- Migrate existing roles:
--   admin    → director,    departments = '{}'
--   manager  → department_manager, departments = '{}'  (need manual assignment)
--   lead     → department_manager, departments = '{}'
--   worker   → technician,  departments = '{}'

-- Update role enum (the column is VARCHAR, no enum to alter)
UPDATE users SET role = 'director' WHERE role = 'admin';
UPDATE users SET role = 'department_manager' WHERE role IN ('manager', 'lead');
UPDATE users SET role = 'technician' WHERE role = 'worker';

-- Same migration on trimmer_profiles.role
UPDATE trimmer_profiles SET role = 'director' WHERE role = 'admin';
UPDATE trimmer_profiles SET role = 'department_manager' WHERE role IN ('manager', 'lead');
UPDATE trimmer_profiles SET role = 'technician' WHERE role = 'worker';

-- Add departments to trimmer_profiles too (for invite flow)
ALTER TABLE trimmer_profiles ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';
```

### Supply pool auto-provisioning

When new companies are created in `resolveContext`, also seed their 3 supply pools (extraction, cultivation, facility). Currently in migration 035 seed but not in the sync-user flow.

## Backend Changes

### `netlify/functions/utils/auth.ts`

```typescript
// Old
export type Role = 'admin' | 'manager' | 'lead' | 'worker';

// New
export type Role = 'director' | 'department_manager' | 'technician';
export type Department = 'cultivation' | 'extraction' | 'post_harvest' | 'trim' | 'procurement' | 'lab' | 'compliance';

export interface AuthenticatedContext {
    userId: string;
    companyId: string;
    role: Role;
    departments: Department[];  // NEW
}

const ROLE_LEVEL: Record<Role, number> = {
    director: 40,
    department_manager: 30,
    technician: 10,
};
```

Update `resolveContext` to SELECT and return `departments` from the users table.

Update `authorize()` to optionally check department membership:

```typescript
export function authorize(
    context: AuthenticatedContext,
    minRole: Role,
    requiredDept?: Department
) {
    const userLevel = ROLE_LEVEL[context.role] ?? 0;
    const requiredLevel = ROLE_LEVEL[minRole];
    if (userLevel < requiredLevel) return FORBIDDEN;

    // Directors bypass department check
    if (context.role === 'director') return null;

    // If a department is required, check membership
    if (requiredDept && !context.departments.includes(requiredDept)) {
        return FORBIDDEN;
    }

    return null;
}
```

### `netlify/functions/ai-parse.ts`

**Model routing:**
```typescript
const model = context.role === 'technician'
    ? 'claude-haiku-4-5-20251001'
    : 'claude-opus-4-6';
```

**System prompt scoping:**
- Build system prompt dynamically based on `context.role` and `context.departments`
- Technician prompt: only includes tools for task completion, weight logging, supply consumption, simple lookups
- Manager prompt: full tools for their departments only (e.g., procurement manager gets ordering tools but not extraction tools)
- Director prompt: all tools

### Endpoint authorization updates

Add department checks to existing endpoints:

| Endpoint | Current auth | New auth |
|----------|-------------|----------|
| `create-task.ts` | `resolveContext` | + dept check on category |
| `save-order.ts` | `resolveContext` | + `authorize(ctx, 'department_manager', 'procurement')` |
| `record-extraction.ts` | `resolveContext` | + `authorize(ctx, 'technician', 'extraction')` |
| `save-supply-item.ts` | `resolveContext` | + dept check based on pool slug |

## Frontend Changes

### Types (`src/types/definitions.ts`)

```typescript
export type TeamRole = 'director' | 'department_manager' | 'technician';
export type Department = 'cultivation' | 'extraction' | 'post_harvest' | 'trim' | 'procurement' | 'lab' | 'compliance';
```

### Auth context

Expose `departments` alongside `role` from the auth context so components can check access.

### Sidebar (`src/components/Sidebar.tsx`)

Filter `navItems` based on user's role + departments. Technicians don't see Ordering, Reports, Team, Settings. Managers only see modules matching their departments.

### Team Management

Update the team member form (in `trimmer_profiles` / TeamDashboard) to:
- Select role tier from dropdown: Director / Department Manager / Technician
- Multi-select departments (shown only for manager and technician tiers)
- This data flows through to the invite → `resolveContext` auto-provision flow

### AI Chat

Pass `role` and `departments` to `ai-parse` so it can select model + build scoped prompt.

## Invite Flow (Current State + Gaps)

### What exists:
1. Admin creates `trimmer_profile` with name, email, role
2. `send-team-invite` → Auth0 Management API creates user + sends password-change ticket
3. On first login, `resolveContext` matches email to `trimmer_profile`, provisions user in company

### What needs to change:
1. `trimmer_profile` needs `departments TEXT[]` column (in migration above)
2. Team invite form needs department multi-select
3. `resolveContext` needs to copy `departments` from profile to new user record
4. Invite email should include context: "You've been invited to [Company] as [Role Title]"
5. Consider renaming `trimmer_profiles` to `team_members` — the table has outgrown its original trim-only purpose

## Monetization / Seat Tiers

| Seat | AI Model | Monthly cost (target) | Target user |
|------|----------|-----------------------|-------------|
| Operator | Haiku | Low ($) | Techs, trimmers, workers |
| Manager | Opus | Medium ($$) | Department heads |
| Director | Opus | High ($$$) | Dir of Ops, owners |

Cost scales with AI usage — Opus is ~15x more expensive than Haiku per token. The seat tier directly controls which model powers their AI assistant.

## Implementation Sequence

### Phase 1 — Database + Auth (foundation)
1. Migration `036_role_departments.sql`
2. Update `auth.ts` types, `resolveContext`, `authorize()`
3. Update `definitions.ts` TeamRole type
4. Update dev bypass to return `departments: []` for director

### Phase 2 — Frontend permissions
5. Expose departments in auth context
6. Filter sidebar by role + departments
7. Update team management form with department selector
8. Update invite flow to include departments

### Phase 3 — AI model routing
9. Model selection in `ai-parse.ts` based on role
10. Build department-scoped system prompts (technician vs manager vs director)
11. Scope available tools per role tier

### Phase 4 — Endpoint hardening
12. Add `authorize()` department checks to write endpoints
13. Add read-level scoping where appropriate (technicians can't see other dept data)

## Key Files

| File | Change |
|------|--------|
| `migrations/036_role_departments.sql` | New: schema changes |
| `netlify/functions/utils/auth.ts` | Role type, AuthenticatedContext, authorize(), resolveContext() |
| `netlify/functions/ai-parse.ts` | Model routing, prompt scoping |
| `netlify/functions/send-team-invite.ts` | Include departments in invite |
| `netlify/functions/add-trimmer-profile.ts` | Accept departments field |
| `src/types/definitions.ts` | TeamRole, Department types |
| `src/components/Sidebar.tsx` | Filter nav by permissions |
| `src/components/TeamDashboard.tsx` | Department selector in forms |
| `src/contexts/authContext.tsx` | Expose departments |

## Open Questions

- Should `trimmer_profiles` be renamed to `team_members`? The table now serves all roles, not just trimmers.
- Should departments be company-configurable, or hardcoded to the 7 listed? (Hardcoded is simpler; configurable supports niche operations.)
- How do we handle cross-department tasks? E.g., a task created by cultivation that involves extraction (processing fresh frozen). Does it show for both dept managers?

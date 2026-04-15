/**
 * Client-side variety-blend solver.
 *
 * Given a VarietySpec and the available strain catalog, picks which strains
 * to include and returns the expanded set of single-strain targets that
 * plan-backward can consume unchanged. The backend engine doesn't know
 * variety blends exist — by the time targets hit the wire, they look like
 * N regular single-strain requests.
 *
 * Selection policy (v1):
 *   1. For each phenotype with a quota > 0, pick that many strains whose
 *      phenotype matches, ranked by on-hand biomass descending.
 *      (Operators think "what do I have most of" — surfacing that stock
 *      makes the default plan land with the smallest shortfall.)
 *   2. If phenotype quotas sum to fewer than `strainCount`, fill the
 *      remaining slots from any remaining strain, same ranking.
 *   3. Unfilled slots (catalog too small for the requested mix) become
 *      warnings, not errors — the plan still runs with fewer strains.
 *
 * Excluded from v1 (documented for follow-ups):
 *   - Terpene filter (ANY-match). The VarietySpec type has no terpene
 *     field yet; add it here when δ.1+ lands UI for it.
 *   - Yield filter. Same.
 *   - Cost. Waits on the get-strain-pricing aggregator (δ.2).
 */

import type { PlanTargetInput, Strain, VarietySpec } from '../../types/definitions';

type Phenotype = 'sativa' | 'indica' | 'hybrid';
const PHENOTYPES: Phenotype[] = ['sativa', 'indica', 'hybrid'];

export interface VarietyExpansion {
  /** Expanded per-strain targets, ready to hand to plan-backward. */
  targets: PlanTargetInput[];
  /** Warnings surfaced next to the plan (partial fulfillment, etc.). */
  warnings: string[];
}

/**
 * Rank strains by on-hand biomass (descending). Strains with zero stock
 * sort after any with stock but still get included — the planner will
 * flag them as needing sourcing, which is still a valid plan.
 */
function rankByOnHand(
  strains: Strain[],
  biomassByStrain: Map<string, number>,
): Strain[] {
  return [...strains].sort((a, b) => {
    const qa = biomassByStrain.get(a.name) ?? 0;
    const qb = biomassByStrain.get(b.name) ?? 0;
    if (qa !== qb) return qb - qa;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Pick strains for a single variety target. Returns the chosen strains
 * (in stable order) and any warnings about partial fulfillment.
 */
export function selectStrainsForVariety(
  spec: VarietySpec,
  catalog: Strain[],
  biomassByStrain: Map<string, number>,
): { chosen: Strain[]; warnings: string[] } {
  const warnings: string[] = [];
  const chosen: Strain[] = [];
  const used = new Set<string>();

  const requestedCount = Math.max(1, Math.floor(spec.strainCount));

  // Validate the phenotype mix sums to at most strainCount. If an operator
  // types "4 strains but 3 sativa + 3 indica + 3 hybrid", something has
  // to give — truncate quotas proportionally isn't obvious, so just warn
  // and clamp each quota at whatever fits.
  const mix = spec.phenotypeMix ?? {};
  const quotaSum =
    (mix.sativa ?? 0) + (mix.indica ?? 0) + (mix.hybrid ?? 0);
  if (quotaSum > requestedCount) {
    warnings.push(
      `Phenotype quotas (${quotaSum}) exceed strain count (${requestedCount}). Some slots were dropped.`,
    );
  }

  // Fill each phenotype bucket first.
  let remainingSlots = requestedCount;
  for (const p of PHENOTYPES) {
    const want = mix[p] ?? 0;
    if (want <= 0) continue;
    const take = Math.min(want, remainingSlots);
    if (take <= 0) break;

    const pool = catalog.filter(s => s.phenotype === p && !used.has(s.id));
    const ranked = rankByOnHand(pool, biomassByStrain);
    const picked = ranked.slice(0, take);

    picked.forEach(s => {
      chosen.push(s);
      used.add(s.id);
    });
    remainingSlots -= picked.length;

    if (picked.length < take) {
      const missing = take - picked.length;
      warnings.push(
        `Requested ${want} ${p} ${want === 1 ? 'strain' : 'strains'}; catalog has ${picked.length}. ${missing} slot${missing === 1 ? '' : 's'} unfilled.`,
      );
    }
  }

  // Fill any remaining slots with strains of any phenotype (including
  // unset — some seed strains may not have a phenotype tagged yet).
  if (remainingSlots > 0) {
    const pool = catalog.filter(s => !used.has(s.id));
    const ranked = rankByOnHand(pool, biomassByStrain);
    const filler = ranked.slice(0, remainingSlots);
    filler.forEach(s => {
      chosen.push(s);
      used.add(s.id);
    });
    remainingSlots -= filler.length;

    if (remainingSlots > 0) {
      warnings.push(
        `Requested ${requestedCount} strains; catalog only has ${chosen.length}. Plan generated with fewer strains.`,
      );
    }
  }

  return { chosen, warnings };
}

/**
 * Expand a list of (potentially variety-blend) targets into the flat
 * single-strain list that plan-backward expects. Also sums per-strain
 * biomass tallies across multiple variety targets picking the same strain.
 */
export function expandVarietyTargets(
  targets: PlanTargetInput[],
  catalog: Strain[],
  biomassByStrain: Map<string, number>,
): VarietyExpansion {
  const out: PlanTargetInput[] = [];
  const warnings: string[] = [];

  for (const t of targets) {
    if (!t.variety) {
      // Pass through single-strain / any-strain targets untouched.
      // Variety field stripped defensively in case someone set both.
      const { variety: _v, ...rest } = t;
      void _v;
      out.push(rest);
      continue;
    }

    const { chosen, warnings: w } = selectStrainsForVariety(
      t.variety,
      catalog,
      biomassByStrain,
    );
    warnings.push(...w);

    if (chosen.length === 0) {
      // No strains matched at all — emit a zero-strain "any" fallback
      // so plan-backward still renders the biomass need, and warn.
      warnings.push(
        `${t.outputType}: no strains matched the variety filter. Plan generated with no strain breakdown.`,
      );
      out.push({
        outputType: t.outputType,
        quantity: t.quantity,
        unit: t.unit,
        strain: null,
      });
      continue;
    }

    const per = t.quantity / chosen.length;
    for (const s of chosen) {
      out.push({
        outputType: t.outputType,
        quantity: per,
        unit: t.unit,
        strain: s.name,
      });
    }
  }

  return { targets: out, warnings };
}

/**
 * Short human-readable summary of a variety target for chip display.
 * "4 strains (1s/1i/2h)" — compact enough for the target list.
 */
export function formatVarietyLabel(spec: VarietySpec): string {
  const parts: string[] = [];
  const mix = spec.phenotypeMix ?? {};
  if (mix.sativa) parts.push(`${mix.sativa}s`);
  if (mix.indica) parts.push(`${mix.indica}i`);
  if (mix.hybrid) parts.push(`${mix.hybrid}h`);
  const suffix = parts.length ? ` (${parts.join('/')})` : '';
  return `${spec.strainCount} strains${suffix}`;
}

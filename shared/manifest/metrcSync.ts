/**
 * Wire contract for the Metrc → NeuroCann sync (netlify/functions/metrc-sync-*.ts)
 * as shown in Settings → Metrc Sync. The sync itself runs server-side through
 * the T3 connection described in ./t3.ts; the browser only reads its state
 * and asks for a run.
 */
import type { T3Mode } from './t3'

/** The T3 lists the sync mirrors, in the order they are pulled per licence. */
export type MetrcSyncList =
  | 'items'
  | 'strains'
  | 'locations'
  | 'packages/active'
  | 'packages/intransit'
  | 'packages/inactive'
  | 'plantbatches/active'
  | 'plantbatches/inactive'
  | 'harvests/active'
  | 'harvests/inactive'
  | 'plants/vegetative'
  | 'plants/flowering'
  | 'plants/inactive'

export type MetrcSyncRunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'skipped'

export interface MetrcSyncListCounts {
  fetched: number
  inserted: number
  updated: number
  unchanged: number
}

/** counts[licence][list] */
export type MetrcSyncCounts = Record<string, Partial<Record<MetrcSyncList, MetrcSyncListCounts>>>

export interface MetrcSyncError {
  license?: string
  list?: MetrcSyncList | string
  message: string
}

/** One hand-entered NeuroCann row that a Metrc row with the same tag would change. */
export interface MetrcSyncConflict {
  license: string
  label: string
  /** Metrc-owned columns whose value differs, e.g. "quantity: 20 → 18". */
  changes: string[]
}

/** Dry-run / first-run report before anything is written. */
export interface MetrcSyncReport {
  /** Metrc packages whose tag already exists in NeuroCann without a Metrc id. */
  tagMatches: number
  conflicts: MetrcSyncConflict[]
  /** True when `conflicts` was cut off. */
  conflictsTruncated: boolean
}

export interface MetrcSyncRun {
  id: string
  trigger: 'schedule' | 'manual'
  status: MetrcSyncRunStatus
  dryRun: boolean
  startedByName?: string | null
  queuedAt: string
  startedAt: string | null
  finishedAt: string | null
  counts: MetrcSyncCounts
  errors: MetrcSyncError[]
  report?: MetrcSyncReport | null
  error?: string | null
}

export interface MetrcSyncListState {
  license: string
  list: MetrcSyncList | string
  /** Metrc lastModified high-water mark for the next incremental pull. */
  cursor: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

export interface MetrcSyncStatus {
  /** T3_API_KEY is set on this deploy. */
  configured: boolean
  mode: T3Mode
  /** This company is the one allowlisted company the sync targets. */
  enabled: boolean
  /** Why `enabled` is false, when it is. */
  reason?: string
  /** Signed-in user may press Sync now (director or admin). */
  canRun: boolean
  lastRun: MetrcSyncRun | null
  recentRuns: MetrcSyncRun[]
  lists: MetrcSyncListState[]
  /** Number of synced rows currently in NeuroCann for this company. */
  totals: { items: number; strains: number; rooms: number; packages: number; plantBatches: number; harvests: number; plants: number }
}

export interface MetrcSyncStartRequest {
  /** Pull and report tag matches/conflicts, but write nothing. */
  dryRun?: boolean
}

export interface MetrcSyncStartResponse {
  runId: string
  dryRun: boolean
}

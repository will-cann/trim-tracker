/**
 * ReportSpec compiler — validates AI-generated report specs against an allowlist
 * and compiles them to parameterized SQL. This is the security boundary.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReportSpec {
  title: string;
  description: string;
  visualization: 'bar' | 'line' | 'area' | 'composed' | 'pie' | 'table' | 'metric';
  query: {
    from: string;
    joins?: { table: string; on: [string, string] }[];
    columns: { expr: string; alias: string; agg?: 'sum' | 'avg' | 'count' | 'min' | 'max' }[];
    filters?: { column: string; op: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'between'; value: any }[];
    groupBy?: string[];
    orderBy?: { column: string; dir: 'asc' | 'desc' }[];
    limit?: number;
  };
  chart: {
    xAxis: string;
    yAxis: string[];
    colorBy?: string;
    stacked?: boolean;
  };
}

export interface CompiledQuery {
  text: string;
  values: any[];
}

// ── Allowlist ──────────────────────────────────────────────────────────────────

// Tables that have company_id directly
const COMPANY_SCOPED_TABLES = new Set([
  'harvests', 'trim_sessions', 'plants', 'plant_batches', 'rooms',
  'packages', 'extraction_logs', 'extraction_runs', 'human_tasks',
  'strains', 'licenses', 'trimmer_profiles', 'extraction_equipment',
  'process_templates', 'room_equipment', 'saved_reports',
]);

// Tables that are scoped through a join (no direct company_id)
const JOIN_SCOPED_TABLES = new Set([
  'trim_entries', 'trimmers', 'harvest_allocations', 'harvest_waste',
  'harvest_plant_weights', 'extraction_run_steps', 'extraction_run_sources',
  'process_steps',
]);

const SCHEMA: Record<string, string[]> = {
  // ─ Harvests & processing
  harvests: [
    'id', 'name', 'strain', 'license_number', 'plant_count',
    'total_wet_weight', 'total_waste_weight', 'dry_weight',
    'status', 'is_on_hold', 'harvest_start_date', 'harvest_end_date',
    'drying_location', 'manicure_location', 'submitted_at', 'approved_at',
    'created_at', 'updated_at',
  ],
  harvest_allocations: [
    'id', 'harvest_id', 'allocation_type', 'target_weight', 'actual_weight',
    'status', 'created_at',
  ],
  harvest_waste: [
    'id', 'harvest_id', 'waste_type', 'weight', 'created_at',
  ],
  harvest_plant_weights: [
    'id', 'harvest_id', 'plant_number', 'weight',
  ],

  // ─ Trim sessions
  trim_sessions: [
    'id', 'start_time', 'end_time', 'total_flower', 'total_shake',
    'total_trim', 'total_waste', 'completed_at', 'created_at',
  ],
  trim_entries: [
    'id', 'session_id', 'harvest_name', 'license_number', 'strain',
    'start_weight', 'flower_weight', 'shake_weight', 'trim_weight',
    'waste_weight', 'status', 'planned_trim_date', 'planned_method', 'created_at',
  ],
  trimmers: [
    'id', 'entry_id', 'profile_id', 'name', 'start_time', 'end_time',
    'tool', 'flower_weight', 'shake_weight', 'trim_weight', 'waste_weight',
  ],
  trimmer_profiles: [
    'id', 'name', 'status', 'role', 'created_at',
  ],

  // ─ Cultivation
  plants: [
    'id', 'label', 'strain_name', 'room_id', 'growth_phase',
    'planted_date', 'vegetative_date', 'flowering_date', 'target_harvest_date',
    'harvested_date', 'plant_health', 'is_on_hold', 'created_at',
  ],
  plant_batches: [
    'id', 'name', 'batch_type', 'strain_name', 'room_id',
    'untracked_count', 'tracked_count', 'planted_date', 'plant_health',
    'created_at',
  ],
  rooms: [
    'id', 'name', 'room_type', 'capacity', 'square_footage', 'created_at',
  ],
  room_equipment: [
    'id', 'room_id', 'equipment_type', 'name', 'quantity', 'created_at',
  ],
  strains: [
    'id', 'name', 'default_flowering_days', 'created_at',
  ],

  // ─ Inventory & packaging
  packages: [
    'id', 'label', 'package_type', 'item_name', 'strain', 'license_number',
    'quantity', 'unit', 'waste_weight', 'location', 'status',
    'lab_testing_state', 'packaged_date', 'finished_date',
    'input_quantity', 'created_at', 'updated_at',
  ],
  licenses: [
    'id', 'license_number', 'label', 'created_at',
  ],

  // ─ Extraction
  extraction_logs: [
    'id', 'input_package_type', 'input_quantity', 'output_package_type',
    'output_quantity', 'strain', 'license_number', 'extraction_type',
    'yield_percentage', 'waste_weight', 'notes', 'created_at',
  ],
  extraction_runs: [
    'id', 'template_id', 'name', 'strain', 'input_material', 'target_product',
    'status', 'planned_start', 'started_at', 'completed_at', 'created_at',
  ],
  extraction_run_steps: [
    'id', 'run_id', 'step_order', 'name', 'status',
    'input_weight_g', 'output_weight_g', 'yield_pct',
    'started_at', 'completed_at',
  ],
  extraction_run_sources: [
    'id', 'run_id', 'package_id', 'quantity_used',
  ],
  extraction_equipment: [
    'id', 'name', 'equipment_type', 'capacity_grams', 'status', 'created_at',
  ],
  process_templates: [
    'id', 'name', 'description', 'process_type', 'is_active', 'created_at',
  ],
  process_steps: [
    'id', 'template_id', 'step_order', 'name', 'description',
    'input_type', 'output_type', 'equipment_type',
    'expected_yield_pct', 'est_duration_hours', 'is_optional',
  ],

  // ─ Tasks
  human_tasks: [
    'id', 'title', 'description', 'priority', 'category', 'status',
    'assignee', 'location', 'due_date', 'created_at', 'completed_at',
  ],
};

// Known foreign key relationships for join validation
const VALID_JOINS: Record<string, Record<string, [string, string]>> = {
  trim_sessions: {
    trim_entries: ['trim_sessions.id', 'trim_entries.session_id'],
  },
  trim_entries: {
    trimmers: ['trim_entries.id', 'trimmers.entry_id'],
    trim_sessions: ['trim_entries.session_id', 'trim_sessions.id'],
  },
  trimmers: {
    trim_entries: ['trimmers.entry_id', 'trim_entries.id'],
    trimmer_profiles: ['trimmers.profile_id', 'trimmer_profiles.id'],
  },
  harvests: {
    harvest_allocations: ['harvests.id', 'harvest_allocations.harvest_id'],
    harvest_waste: ['harvests.id', 'harvest_waste.harvest_id'],
    harvest_plant_weights: ['harvests.id', 'harvest_plant_weights.harvest_id'],
  },
  harvest_allocations: {
    harvests: ['harvest_allocations.harvest_id', 'harvests.id'],
  },
  harvest_waste: {
    harvests: ['harvest_waste.harvest_id', 'harvests.id'],
  },
  harvest_plant_weights: {
    harvests: ['harvest_plant_weights.harvest_id', 'harvests.id'],
  },
  plants: {
    rooms: ['plants.room_id', 'rooms.id'],
    strains: ['plants.strain_id', 'strains.id'],
  },
  plant_batches: {
    rooms: ['plant_batches.room_id', 'rooms.id'],
    strains: ['plant_batches.strain_id', 'strains.id'],
  },
  rooms: {
    plants: ['rooms.id', 'plants.room_id'],
    plant_batches: ['rooms.id', 'plant_batches.room_id'],
    room_equipment: ['rooms.id', 'room_equipment.room_id'],
  },
  packages: {
    harvests: ['packages.harvest_id', 'harvests.id'],
  },
  extraction_runs: {
    extraction_run_steps: ['extraction_runs.id', 'extraction_run_steps.run_id'],
    extraction_run_sources: ['extraction_runs.id', 'extraction_run_sources.run_id'],
    process_templates: ['extraction_runs.template_id', 'process_templates.id'],
  },
  extraction_run_steps: {
    extraction_runs: ['extraction_run_steps.run_id', 'extraction_runs.id'],
    extraction_equipment: ['extraction_run_steps.equipment_id', 'extraction_equipment.id'],
  },
  process_templates: {
    process_steps: ['process_templates.id', 'process_steps.template_id'],
  },
  process_steps: {
    process_templates: ['process_steps.template_id', 'process_templates.id'],
  },
};

// ── Validation ─────────────────────────────────────────────────────────────────

const VALID_OPS = new Set(['=', '!=', '>', '<', '>=', '<=', 'in', 'between']);
const VALID_AGGS = new Set(['sum', 'avg', 'count', 'min', 'max']);
const VALID_VIZ = new Set(['bar', 'line', 'area', 'composed', 'pie', 'table', 'metric']);
const MAX_JOINS = 3;
const MAX_ROWS = 1000;
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

class CompilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompilerError';
  }
}

function validateIdentifier(id: string, context: string): void {
  if (!IDENTIFIER_RE.test(id)) {
    throw new CompilerError(`Invalid identifier in ${context}: "${id}"`);
  }
}

function validateTableColumn(table: string, column: string): void {
  const cols = SCHEMA[table];
  if (!cols) throw new CompilerError(`Table not allowed: "${table}"`);
  if (!cols.includes(column)) throw new CompilerError(`Column "${column}" not allowed on table "${table}"`);
}

/** Parse "table.column" into parts, validating both */
function parseQualifiedColumn(expr: string): { table: string; column: string } {
  const dot = expr.indexOf('.');
  if (dot === -1) throw new CompilerError(`Column must be table-qualified: "${expr}"`);
  const table = expr.slice(0, dot);
  const column = expr.slice(dot + 1);
  validateIdentifier(table, 'table');
  validateIdentifier(column, 'column');
  validateTableColumn(table, column);
  return { table, column };
}

function validateSpec(spec: ReportSpec): void {
  // Visualization
  if (!VALID_VIZ.has(spec.visualization)) {
    throw new CompilerError(`Invalid visualization: "${spec.visualization}"`);
  }

  const q = spec.query;

  // Primary table
  if (!SCHEMA[q.from]) throw new CompilerError(`Table not allowed: "${q.from}"`);
  if (!COMPANY_SCOPED_TABLES.has(q.from) && !JOIN_SCOPED_TABLES.has(q.from)) {
    throw new CompilerError(`Table "${q.from}" is not queryable`);
  }

  // Joins
  if (q.joins && q.joins.length > MAX_JOINS) {
    throw new CompilerError(`Too many joins (max ${MAX_JOINS})`);
  }
  const allTables = new Set([q.from]);
  for (const join of q.joins || []) {
    if (!SCHEMA[join.table]) throw new CompilerError(`Join table not allowed: "${join.table}"`);
    allTables.add(join.table);

    // Validate join condition references known FK relationships
    const [left, right] = join.on;
    parseQualifiedColumn(left);
    parseQualifiedColumn(right);
  }

  // Ensure at least one company-scoped table is in the query
  const hasCompanyScoped = [...allTables].some(t => COMPANY_SCOPED_TABLES.has(t));
  if (!hasCompanyScoped) {
    throw new CompilerError('Query must include at least one company-scoped table');
  }

  // Columns
  if (!q.columns || q.columns.length === 0) {
    throw new CompilerError('At least one column required');
  }
  for (const col of q.columns) {
    validateIdentifier(col.alias, 'alias');
    parseQualifiedColumn(col.expr);
    if (col.agg && !VALID_AGGS.has(col.agg)) {
      throw new CompilerError(`Invalid aggregation: "${col.agg}"`);
    }
  }

  // Filters
  for (const f of q.filters || []) {
    parseQualifiedColumn(f.column);
    if (!VALID_OPS.has(f.op)) {
      throw new CompilerError(`Invalid operator: "${f.op}"`);
    }
  }

  // Group by
  for (const g of q.groupBy || []) {
    parseQualifiedColumn(g);
  }

  // Order by
  for (const o of q.orderBy || []) {
    validateIdentifier(o.column, 'orderBy');
    if (o.dir !== 'asc' && o.dir !== 'desc') {
      throw new CompilerError(`Invalid order direction: "${o.dir}"`);
    }
  }

  // Limit
  if (q.limit !== undefined && (q.limit < 1 || q.limit > MAX_ROWS)) {
    throw new CompilerError(`Limit must be 1-${MAX_ROWS}`);
  }
}

// ── Compilation ────────────────────────────────────────────────────────────────

export function compileReportSpec(spec: ReportSpec, companyId: string): CompiledQuery {
  validateSpec(spec);

  const q = spec.query;
  const values: any[] = [companyId]; // $1 is always company_id
  let paramIdx = 2;

  // SELECT clause
  const selectParts: string[] = [];
  for (const col of q.columns) {
    const { table, column } = parseQualifiedColumn(col.expr);
    const qualified = `"${table}"."${column}"`;
    if (col.agg) {
      selectParts.push(`${col.agg.toUpperCase()}(${qualified}) AS "${col.alias}"`);
    } else {
      selectParts.push(`${qualified} AS "${col.alias}"`);
    }
  }

  // FROM clause
  let fromClause = `"${q.from}"`;

  // JOIN clauses
  const joinClauses: string[] = [];
  for (const join of q.joins || []) {
    const [leftExpr, rightExpr] = join.on;
    const left = parseQualifiedColumn(leftExpr);
    const right = parseQualifiedColumn(rightExpr);
    joinClauses.push(
      `JOIN "${join.table}" ON "${left.table}"."${left.column}" = "${right.table}"."${right.column}"`
    );
  }

  // WHERE clause — always starts with company_id
  const whereParts: string[] = [];

  // Find the company-scoped table to attach company_id filter
  const allTables = [q.from, ...(q.joins || []).map(j => j.table)];
  const companyTable = allTables.find(t => COMPANY_SCOPED_TABLES.has(t));
  if (companyTable) {
    whereParts.push(`"${companyTable}"."company_id" = $1`);
  }

  // User-specified filters
  for (const f of q.filters || []) {
    const { table, column } = parseQualifiedColumn(f.column);
    const qualified = `"${table}"."${column}"`;

    if (f.op === 'in') {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      const placeholders = arr.map(() => `$${paramIdx++}`);
      whereParts.push(`${qualified} IN (${placeholders.join(', ')})`);
      values.push(...arr);
    } else if (f.op === 'between') {
      const [lo, hi] = Array.isArray(f.value) ? f.value : [f.value, f.value];
      whereParts.push(`${qualified} BETWEEN $${paramIdx++} AND $${paramIdx++}`);
      values.push(lo, hi);
    } else {
      whereParts.push(`${qualified} ${f.op} $${paramIdx++}`);
      values.push(f.value);
    }
  }

  // GROUP BY
  let groupByClause = '';
  if (q.groupBy && q.groupBy.length > 0) {
    const groupParts = q.groupBy.map(g => {
      const { table, column } = parseQualifiedColumn(g);
      return `"${table}"."${column}"`;
    });
    groupByClause = `GROUP BY ${groupParts.join(', ')}`;
  }

  // ORDER BY (uses aliases since they refer to SELECT output)
  let orderByClause = '';
  if (q.orderBy && q.orderBy.length > 0) {
    const orderParts = q.orderBy.map(o => `"${o.column}" ${o.dir.toUpperCase()}`);
    orderByClause = `ORDER BY ${orderParts.join(', ')}`;
  }

  // LIMIT
  const limit = Math.min(q.limit || MAX_ROWS, MAX_ROWS);

  // Assemble
  const parts = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM ${fromClause}`,
    ...joinClauses,
    whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '',
    groupByClause,
    orderByClause,
    `LIMIT ${limit}`,
  ].filter(Boolean);

  const text = parts.join('\n');

  return { text, values };
}

/** Get the schema description for the AI system prompt */
export function getSchemaDescription(): string {
  const lines: string[] = ['Available tables and columns (all queries are automatically scoped to the user\'s company):\n'];

  for (const [table, columns] of Object.entries(SCHEMA)) {
    const scope = COMPANY_SCOPED_TABLES.has(table) ? '(company-scoped)' : '(join-scoped)';
    lines.push(`  ${table} ${scope}: ${columns.join(', ')}`);
  }

  lines.push('\nKnown join relationships:');
  for (const [fromTable, targets] of Object.entries(VALID_JOINS)) {
    for (const [toTable, [left, right]] of Object.entries(targets)) {
      lines.push(`  ${fromTable} → ${toTable}: ${left} = ${right}`);
    }
  }

  return lines.join('\n');
}

// Parser for the operator's room-map workbooks (one sheet of tables with
// strain + plant count, one sheet of bud-rot scores on the same layout).
//
// Layout conventions this reads (see __tests__/fixtures/papin-sheet.json):
//   row 0           "PAPIN 8/19/2026"            room name + date
//   section header  "East" … "Upper Deck" … "West"  compass words = column axis
//   bench pair      strain codes on one row, numbers on the next
//   legend column   "GSB4 - 105" cells at the right edge (ignored)
//   total row       "TOTAL:" ends the layout
// Positions come out 0-indexed: grid row = section offset + bench index,
// grid col = column − first data column.

export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetGrid = ReadonlyArray<ReadonlyArray<SheetCell>>;

export interface SheetStrainCount {
  strain: string;
  count: number | null;
}

export interface SheetTable {
  section: string;
  row: number;
  col: number;
  strains: SheetStrainCount[];
  plantCount: number;
  sourceCell: string;
}

export interface SheetScore {
  section: string;
  row: number;
  col: number;
  strain: string | null;
  /** The operator's 0.5–3 scale. */
  score: number;
  sourceCell: string;
}

export interface SheetSection {
  name: string;
  rowStart: number;
  rowCount: number;
}

export interface ParsedRoomSheet {
  roomName: string | null;
  /** YYYY-MM-DD from the title, if any. */
  observedAt: string | null;
  sections: SheetSection[];
  rows: number;
  cols: number;
  colStartLabel: string | null;
  colEndLabel: string | null;
  tables: SheetTable[];
  scores: SheetScore[];
  totalPlants: number;
  warnings: string[];
}

// ── Bud-rot score scale ─────────────────────────────────────────────────────

export interface RotScoreLevel {
  score: number;
  severity: number;
  label: string;
  meaning: string;
  /** Plant-health equivalent (0–100) for a table at this score, so table rooms roll up like plant rooms. */
  health: number;
}

/** The operator's bud-rot scale and what each level means for the harvest. */
export const ROT_SCORE_SCALE: readonly RotScoreLevel[] = [
  { score: 0.5, severity: 1, label: 'Early signs', meaning: 'First spots; watch and keep airflow on it.', health: 90 },
  { score: 1, severity: 2, label: 'Needs QC', meaning: 'Will have to be QC\'d at harvest.', health: 75 },
  { score: 2, severity: 4, label: 'Freeze tops', meaning: 'Likely freezing the tops.', health: 45 },
  { score: 3, severity: 5, label: 'All to frozen', meaning: 'Everything goes to frozen; nothing salvageable.', health: 10 },
];

/** Health (0–100) for a table at a bud-rot score; unknown scores take the nearest level below. */
export function rotScoreToHealth(score: number | null | undefined): number {
  if (score == null) return 100;
  const exact = ROT_SCORE_SCALE.find(l => l.score === score);
  if (exact) return exact.health;
  const below = [...ROT_SCORE_SCALE].reverse().find(l => l.score <= score);
  return below ? below.health : 100;
}

export interface TableHealthInput {
  plantCount: number;
  /** Latest active bud-rot score on the table, or null when unscored. */
  score: number | null;
}

/**
 * Room health for a table-granularity room: the plant-weighted mean of each
 * table's score health, unscored tables counting as 100. Mirrors how plant
 * rooms average plant_health, so the cards view reads the same for both.
 */
export function tableRoomHealth(tables: readonly TableHealthInput[]): { health: number; plants: number; scoredTables: number; scoredPlants: number } {
  let weighted = 0;
  let plants = 0;
  let scoredTables = 0;
  let scoredPlants = 0;
  for (const t of tables) {
    const n = Math.max(0, t.plantCount || 0);
    plants += n;
    weighted += n * rotScoreToHealth(t.score);
    if (t.score != null) { scoredTables++; scoredPlants += n; }
  }
  return { health: plants > 0 ? Math.round(weighted / plants) : 100, plants, scoredTables, scoredPlants };
}

export function rotScoreToSeverity(score: number): number {
  if (!Number.isFinite(score)) return 3;
  if (score >= 3) return 5;
  if (score >= 2) return 4;
  if (score >= 1.5) return 3;
  if (score >= 1) return 2;
  return 1;
}

export function severityToRotScore(severity: number): number {
  if (severity >= 5) return 3;
  if (severity >= 4) return 2;
  if (severity >= 3) return 1.5;
  if (severity >= 2) return 1;
  return 0.5;
}

export function rotScoreLabel(score: number): string {
  const exact = ROT_SCORE_SCALE.find(l => l.score === score);
  if (exact) return exact.label;
  const below = [...ROT_SCORE_SCALE].reverse().find(l => l.score <= score);
  return below ? `${below.label}+` : 'Early signs';
}

// ── Cell helpers ────────────────────────────────────────────────────────────

const COMPASS = new Set(['north', 'south', 'east', 'west', 'n', 's', 'e', 'w', 'front', 'back', 'left', 'right', 'door', 'wall']);
const SECTION_WORD = /\b(deck|level|tier|floor|bench|section|side|rack|row)\b/i;
const LEGEND = /^\s*[A-Za-z0-9 ]+?\s*-\s*\d+\s*$/;
const TOTAL = /^\s*total\b/i;
const DATE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;

const text = (v: SheetCell): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: SheetCell): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const colLetter = (c: number): string => {
  let s = '';
  let n = c + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};
const coord = (r: number, c: number) => `${colLetter(c)}${r + 1}`;

const isCompass = (s: string) => COMPASS.has(s.toLowerCase().replace(/[^a-z]/g, ''));
const isLegend = (s: string) => LEGEND.test(s);
const isSectionHeader = (s: string) => SECTION_WORD.test(s) && !isLegend(s);

/** "GSB4 7    ARS20  7" → [{GSB4,7},{ARS20,7}]; "ppn/bis" → [{PPN,null},{BIS,null}]; "PPN " → [{PPN,null}] */
export function parseStrainCell(raw: string): SheetStrainCount[] {
  const tokens = raw.trim().split(/[\s/,+&]+/).filter(Boolean);
  const out: SheetStrainCount[] = [];
  for (const t of tokens) {
    if (/^\d+(\.\d+)?$/.test(t)) {
      if (out.length) out[out.length - 1].count = Number(t);
      continue;
    }
    out.push({ strain: t.toUpperCase(), count: null });
  }
  // "ARS 20" style codes split by the whitespace: glue a bare number back on when it
  // immediately follows a short alpha token and nothing else is numeric.
  return out;
}

function parseTitle(grid: SheetGrid): { roomName: string | null; observedAt: string | null } {
  for (let r = 0; r < Math.min(grid.length, 3); r++) {
    for (const cell of grid[r] ?? []) {
      const s = text(cell);
      if (!s || isCompass(s) || isSectionHeader(s)) continue;
      const m = s.match(DATE);
      let observedAt: string | null = null;
      if (m) {
        const mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
        let y = parseInt(m[3], 10);
        if (y < 100) y += 2000;
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) observedAt = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      const roomName = s.replace(DATE, '').replace(/[-–—:]+\s*$/, '').trim() || null;
      return { roomName, observedAt };
    }
  }
  return { roomName: null, observedAt: null };
}

interface SectionAnchor {
  name: string;
  headerRow: number;
  firstLabelRow: number;
  endRow: number; // exclusive
}

function findSections(grid: SheetGrid): { anchors: SectionAnchor[]; colStart: string | null; colEnd: string | null } {
  const headerRows: Array<{ row: number; name: string }> = [];
  let colStart: string | null = null;
  let colEnd: string | null = null;
  let totalRow = grid.length;
  for (let r = 0; r < grid.length; r++) {
    const strings = (grid[r] ?? []).map((v, c) => ({ s: text(v), c })).filter((x): x is { s: string; c: number } => !!x.s);
    if (strings.some(x => TOTAL.test(x.s))) { totalRow = Math.min(totalRow, r); }
    const header = strings.find(x => isSectionHeader(x.s));
    if (header && r > 0) {
      headerRows.push({ row: r, name: header.s.replace(/\s+/g, ' ').trim() });
      const compass = strings.filter(x => isCompass(x.s)).sort((a, b) => a.c - b.c);
      if (compass.length) {
        colStart ??= compass[0].s;
        if (compass.length > 1) colEnd ??= compass[compass.length - 1].s;
      }
    }
  }
  const anchors: SectionAnchor[] = [];
  const rowHasLabels = (r: number) => (grid[r] ?? []).some(v => { const s = text(v); return !!s && !isCompass(s) && !isSectionHeader(s) && !isLegend(s) && !TOTAL.test(s); });
  if (headerRows.length === 0) {
    // Single unlabelled section: everything after the title.
    let first = 1;
    while (first < grid.length && !rowHasLabels(first)) first++;
    anchors.push({ name: 'Main', headerRow: 0, firstLabelRow: first, endRow: Math.min(totalRow, grid.length) });
    return { anchors, colStart, colEnd };
  }
  headerRows.forEach((h, i) => {
    const end = Math.min(i + 1 < headerRows.length ? headerRows[i + 1].row : grid.length, totalRow > h.row ? totalRow : grid.length);
    let first = h.row + 1;
    while (first < end && !rowHasLabels(first)) first++;
    anchors.push({ name: h.name, headerRow: h.row, firstLabelRow: first, endRow: end });
  });
  return { anchors, colStart, colEnd };
}

interface SheetParse {
  anchors: SectionAnchor[];
  minCol: number;
  maxCol: number;
  benchCounts: number[];
}

function dataColumns(grid: SheetGrid, anchors: SectionAnchor[]): { minCol: number; maxCol: number } {
  let minCol = Infinity, maxCol = -Infinity;
  for (const a of anchors) {
    for (let r = a.firstLabelRow; r < a.endRow; r++) {
      (grid[r] ?? []).forEach((v, c) => {
        const s = text(v);
        if (s) {
          if (isLegend(s) || isCompass(s) || isSectionHeader(s) || TOTAL.test(s)) return;
          minCol = Math.min(minCol, c); maxCol = Math.max(maxCol, c);
        } else if (num(v) != null) {
          minCol = Math.min(minCol, c); maxCol = Math.max(maxCol, c);
        }
      });
    }
  }
  return Number.isFinite(minCol) ? { minCol, maxCol } : { minCol: 0, maxCol: -1 };
}

/** Parse the table layout sheet (strain code row + plant count row per bench). */
export function parseLayoutSheet(grid: SheetGrid): ParsedRoomSheet & { _parse: SheetParse } {
  const warnings: string[] = [];
  const { roomName, observedAt } = parseTitle(grid);
  const { anchors, colStart, colEnd } = findSections(grid);
  const { minCol, maxCol } = dataColumns(grid, anchors);
  const tables: SheetTable[] = [];
  const sections: SheetSection[] = [];
  const benchCounts: number[] = [];
  let rowOffset = 0;
  for (const a of anchors) {
    let benches = 0;
    for (let r = a.firstLabelRow; r + 1 < a.endRow + 1 && r < a.endRow; r += 2) {
      const labelRow = grid[r] ?? [];
      const countRow = grid[r + 1] ?? [];
      const bench = Math.floor((r - a.firstLabelRow) / 2);
      let any = false;
      for (let c = minCol; c <= maxCol; c++) {
        const s = text(labelRow[c]);
        if (!s || isLegend(s) || isCompass(s) || TOTAL.test(s)) continue;
        const strains = parseStrainCell(s);
        if (!strains.length) continue;
        const rowCount = num(countRow[c]);
        const splitSum = strains.every(x => x.count != null) ? strains.reduce((n, x) => n + (x.count ?? 0), 0) : null;
        const plantCount = rowCount ?? splitSum ?? 0;
        if (rowCount == null && splitSum == null) warnings.push(`${coord(r, c)} "${s}" has no plant count.`);
        tables.push({ section: a.name, row: rowOffset + bench, col: c - minCol, strains, plantCount, sourceCell: coord(r, c) });
        any = true;
      }
      if (any || bench < benches) benches = Math.max(benches, bench + 1);
    }
    sections.push({ name: a.name, rowStart: rowOffset, rowCount: benches });
    benchCounts.push(benches);
    rowOffset += benches;
  }
  const totalPlants = tables.reduce((n, t) => n + t.plantCount, 0);
  return {
    roomName, observedAt, sections, rows: rowOffset, cols: maxCol >= minCol ? maxCol - minCol + 1 : 0,
    colStartLabel: colStart, colEndLabel: colEnd, tables, scores: [], totalPlants, warnings,
    _parse: { anchors, minCol, maxCol, benchCounts },
  };
}

/** Parse the score sheet against the layout sheet's anchors so sparse rows still land on the right bench. */
export function parseScoreSheet(grid: SheetGrid, layout: ReturnType<typeof parseLayoutSheet>): { scores: SheetScore[]; warnings: string[] } {
  const warnings: string[] = [];
  const own = findSections(grid);
  const sameTemplate = own.anchors.length === layout._parse.anchors.length
    && own.anchors.every((a, i) => a.headerRow === layout._parse.anchors[i].headerRow);
  const anchors = sameTemplate
    ? layout._parse.anchors.map((la, i) => ({ ...la, name: own.anchors[i].name || la.name }))
    : own.anchors;
  if (!sameTemplate) warnings.push('Score sheet uses a different row layout than the room map; benches were aligned by their own headers.');
  const { minCol } = layout._parse;
  const scores: SheetScore[] = [];
  let rowOffset = 0;
  anchors.forEach((a, i) => {
    const section = layout.sections[i];
    const benchCount = section?.rowCount ?? 0;
    for (let r = a.firstLabelRow; r < a.endRow; r += 2) {
      const labelRow = grid[r] ?? [];
      const valueRow = grid[r + 1] ?? [];
      const bench = Math.floor((r - a.firstLabelRow) / 2);
      for (let c = 0; c < Math.max(labelRow.length, valueRow.length); c++) {
        const v = num(valueRow[c]);
        if (v == null) continue;
        const s = text(labelRow[c]);
        if (s && (isLegend(s) || TOTAL.test(s))) continue;
        if (c < minCol || c > layout._parse.maxCol) continue;
        if (bench >= benchCount && benchCount > 0) { warnings.push(`${coord(r + 1, c)} score is below the last bench of ${a.name}; skipped.`); continue; }
        if (v < 0 || v > 3) { warnings.push(`${coord(r + 1, c)} score ${v} is outside 0.5–3; skipped.`); continue; }
        if (v === 0) continue;
        scores.push({ section: section?.name ?? a.name, row: rowOffset + bench, col: c - minCol, strain: s ? parseStrainCell(s)[0]?.strain ?? null : null, score: v, sourceCell: coord(r + 1, c) });
      }
    }
    rowOffset += benchCount;
  });
  return { scores, warnings };
}

const LAYOUT_SHEET = /map|layout|room|table/i;
const SCORE_SHEET = /health|score|rot|report|ipm/i;

/** Pick the layout and score sheets by name, parse both, and merge. */
export function parseRoomWorkbook(sheets: Record<string, SheetGrid>): ParsedRoomSheet {
  const names = Object.keys(sheets);
  if (names.length === 0) {
    return { roomName: null, observedAt: null, sections: [], rows: 0, cols: 0, colStartLabel: null, colEndLabel: null, tables: [], scores: [], totalPlants: 0, warnings: ['Workbook has no sheets.'] };
  }
  const layoutName = names.find(n => LAYOUT_SHEET.test(n) && !SCORE_SHEET.test(n)) ?? names[0];
  const scoreName = names.find(n => n !== layoutName && SCORE_SHEET.test(n)) ?? names.find(n => n !== layoutName) ?? null;
  const layout = parseLayoutSheet(sheets[layoutName]);
  const warnings = [...layout.warnings];
  let scores: SheetScore[] = [];
  if (scoreName) {
    const parsed = parseScoreSheet(sheets[scoreName], layout);
    scores = parsed.scores;
    warnings.push(...parsed.warnings);
    // A score on an empty table position is worth flagging.
    const occupied = new Set(layout.tables.map(t => `${t.row}:${t.col}`));
    for (const s of scores) if (!occupied.has(`${s.row}:${s.col}`)) warnings.push(`Score at ${scoreName}!${s.sourceCell} has no table on the room map.`);
  } else {
    warnings.push('No score sheet found; only the layout was read.');
  }
  if (layout.tables.length === 0) warnings.push(`No tables found on "${layoutName}". Expected rows of strain codes with plant counts underneath.`);
  const { _parse: _ignored, ...rest } = layout;
  void _ignored;
  return { ...rest, scores, warnings };
}

/**
 * Tiny YAML-subset frontmatter parser for markdown content files.
 *
 * Supports the shapes blog posts actually use — scalar strings (quoted or
 * bare), inline arrays (`[a, b]`), booleans, and numbers — without pulling a
 * YAML dependency into the client bundle. Anything fancier should be a real
 * YAML parser, not an extension of this.
 */

export type FrontmatterValue = string | number | boolean | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedMarkdown {
  data: Frontmatter;
  content: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function stripQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(raw: string): FrontmatterValue {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(stripQuotes).filter(Boolean);
  }
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return stripQuotes(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Only treat plain numerics as numbers; dates like 2026-09-18 stay strings.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function parseFrontmatter(source: string): ParsedMarkdown {
  const match = source.match(FRONTMATTER_RE);
  if (!match) return { data: {}, content: source };

  const [, block, content] = match;
  const data: Frontmatter = {};

  for (const line of block.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (!key) continue;
    data[key] = parseScalar(value);
  }

  return { data, content };
}

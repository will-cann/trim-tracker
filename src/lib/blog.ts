import { parseFrontmatter } from './frontmatter';

/**
 * Blog content loader.
 *
 * Posts live as markdown files in `src/content/blog/`. The filename is the
 * URL slug (`harvest-day-by-voice.md` -> `/blog/harvest-day-by-voice`). Each
 * file starts with a frontmatter block:
 *
 *   ---
 *   title: Harvest day with gloved hands
 *   description: One-sentence summary used on cards and in meta tags.
 *   date: 2026-09-18
 *   author: NeuroCann Team
 *   tags: [harvest, voice]
 *   ---
 *
 * Files are bundled at build time via `import.meta.glob`, so adding a post is
 * just adding a file — no database, no CMS, no deploy-time fetch.
 */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  author: string;
  tags: string[];
  /** Markdown body with frontmatter removed. */
  content: string;
  /** Estimated reading time in whole minutes (minimum 1). */
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 220;

const rawPosts = import.meta.glob('../content/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function slugFromPath(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.md$/, '');
}

export function estimateReadingMinutes(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) return [value];
  return [];
}

function buildPost(path: string, source: string): BlogPost {
  const { data, content } = parseFrontmatter(source);
  const slug = slugFromPath(path);
  const title = asString(data.title);
  const date = asString(data.date);

  if (!title) throw new Error(`Blog post "${slug}" is missing a title in its frontmatter.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Blog post "${slug}" needs a date in YYYY-MM-DD format (got "${date}").`);
  }

  return {
    slug,
    title,
    description: asString(data.description),
    date,
    author: asString(data.author, 'NeuroCann Team'),
    tags: asStringArray(data.tags),
    content: content.trim(),
    readingMinutes: estimateReadingMinutes(content),
  };
}

let cache: BlogPost[] | null = null;

/** All posts, newest first. Drafts (`draft: true`) are excluded. */
export function getAllPosts(): BlogPost[] {
  if (cache) return cache;
  cache = Object.entries(rawPosts)
    .filter(([, source]) => parseFrontmatter(source).data.draft !== true)
    .map(([path, source]) => buildPost(path, source))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  return cache;
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPosts().find((post) => post.slug === slug);
}

/** Up to `count` of the most recent posts — used for the landing page teaser. */
export function getLatestPosts(count: number): BlogPost[] {
  return getAllPosts().slice(0, count);
}

/** Neighbouring posts for prev/next navigation (older = next in reading order). */
export function getAdjacentPosts(slug: string): { newer?: BlogPost; older?: BlogPost } {
  const posts = getAllPosts();
  const index = posts.findIndex((post) => post.slug === slug);
  if (index === -1) return {};
  return {
    newer: index > 0 ? posts[index - 1] : undefined,
    older: index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

export function formatPostDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

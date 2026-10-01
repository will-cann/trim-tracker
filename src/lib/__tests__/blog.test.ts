import { describe, it, expect } from 'vitest';
import {
  getAllPosts,
  getPostBySlug,
  getLatestPosts,
  getAdjacentPosts,
  estimateReadingMinutes,
  formatPostDate,
} from '../blog';

describe('blog content', () => {
  const posts = getAllPosts();

  it('loads at least one post from src/content/blog', () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it('gives every post the fields the pages depend on', () => {
    for (const post of posts) {
      expect(post.slug).toMatch(/^[a-z0-9-]+$/);
      expect(post.title.length).toBeGreaterThan(0);
      expect(post.description.length).toBeGreaterThan(0);
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.author.length).toBeGreaterThan(0);
      expect(post.content.length).toBeGreaterThan(0);
      expect(post.readingMinutes).toBeGreaterThanOrEqual(1);
    }
  });

  it('has unique slugs', () => {
    const slugs = posts.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('sorts newest first', () => {
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i - 1].date >= posts[i].date).toBe(true);
    }
  });

  it('looks up posts by slug and returns undefined for unknown slugs', () => {
    expect(getPostBySlug(posts[0].slug)).toBe(posts[0]);
    expect(getPostBySlug('does-not-exist')).toBeUndefined();
  });

  it('returns the requested number of latest posts', () => {
    expect(getLatestPosts(2)).toEqual(posts.slice(0, 2));
    expect(getLatestPosts(99)).toEqual(posts);
  });

  it('computes adjacent posts in date order', () => {
    const first = getAdjacentPosts(posts[0].slug);
    expect(first.newer).toBeUndefined();
    expect(first.older).toBe(posts[1]);

    const last = getAdjacentPosts(posts[posts.length - 1].slug);
    expect(last.older).toBeUndefined();
    expect(last.newer).toBe(posts[posts.length - 2]);

    expect(getAdjacentPosts('does-not-exist')).toEqual({});
  });
});

describe('estimateReadingMinutes', () => {
  it('never returns less than one minute', () => {
    expect(estimateReadingMinutes('')).toBe(1);
    expect(estimateReadingMinutes('A few words.')).toBe(1);
  });

  it('scales with word count at roughly 220 wpm', () => {
    const words = Array.from({ length: 660 }, () => 'word').join(' ');
    expect(estimateReadingMinutes(words)).toBe(3);
  });
});

describe('formatPostDate', () => {
  it('formats an ISO date without timezone drift', () => {
    expect(formatPostDate('2026-09-24')).toBe('Sep 24, 2026');
    expect(formatPostDate('2026-01-01')).toBe('Jan 1, 2026');
  });
});

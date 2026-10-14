import { describe, it, expect } from 'vitest';
import { matchPublicRoute, blogPostPath, demoPath } from '../publicRouter';

describe('matchPublicRoute', () => {
  it('matches the blog index with or without a trailing slash', () => {
    expect(matchPublicRoute('/blog')).toEqual({ kind: 'blog-index' });
    expect(matchPublicRoute('/blog/')).toEqual({ kind: 'blog-index' });
  });

  it('matches a blog post slug and decodes it', () => {
    expect(matchPublicRoute('/blog/harvest-day')).toEqual({ kind: 'blog-post', slug: 'harvest-day' });
    expect(matchPublicRoute('/blog/harvest-day/')).toEqual({ kind: 'blog-post', slug: 'harvest-day' });
    expect(matchPublicRoute('/blog/caf%C3%A9')).toEqual({ kind: 'blog-post', slug: 'café' });
  });

  it('does not match nested paths or unrelated routes', () => {
    expect(matchPublicRoute('/blog/a/b')).toBeNull();
    expect(matchPublicRoute('/')).toBeNull();
    expect(matchPublicRoute('/blogger')).toBeNull();
    expect(matchPublicRoute('/settings')).toBeNull();
  });
});

describe('blogPostPath', () => {
  it('round-trips through matchPublicRoute', () => {
    const path = blogPostPath('where-every-gram-goes');
    expect(path).toBe('/blog/where-every-gram-goes');
    expect(matchPublicRoute(path)).toEqual({ kind: 'blog-post', slug: 'where-every-gram-goes' });
  });
});

describe('demo route', () => {
  it('matches /demo with or without a trailing slash', () => {
    expect(matchPublicRoute('/demo')).toEqual({ kind: 'demo' });
    expect(matchPublicRoute('/demo/')).toEqual({ kind: 'demo' });
    expect(matchPublicRoute('/demos')).toBeNull();
  });

  it('builds CTA links tagged with their source', () => {
    expect(demoPath('hero')).toBe('/demo?from=hero');
    expect(demoPath('blog post')).toBe('/demo?from=blog%20post');
  });
});

/**
 * Blog pages — index and post rendering.
 *
 * Run with:
 *     npx vitest run src/components/__tests__/Blog.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../../contexts/authContext', () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), logout: vi.fn(), getToken: async () => null }),
}));

afterEach(() => cleanup());

import { BlogIndex } from '../Blog/BlogIndex';
import { BlogPostPage } from '../Blog/BlogPostPage';
import { getAllPosts } from '../../lib/blog';

const posts = getAllPosts();

describe('BlogIndex', () => {
  it('renders every post title as a link to its post URL', () => {
    render(<BlogIndex />);
    for (const post of posts) {
      const link = screen.getByRole('link', { name: new RegExp(post.title) });
      expect(link.getAttribute('href')).toBe(`/blog/${post.slug}`);
    }
  });

  it('sets the document title', () => {
    render(<BlogIndex />);
    expect(document.title).toBe('Blog — NeuroCann');
  });

  it('marks the Blog nav item as current', () => {
    render(<BlogIndex />);
    const blogNav = screen.getAllByRole('link', { name: 'Blog' })[0];
    expect(blogNav.getAttribute('aria-current')).toBe('page');
  });
});

describe('BlogPostPage', () => {
  const post = posts[0];

  it('renders the article heading, meta, and markdown body', () => {
    render(<BlogPostPage slug={post.slug} />);
    expect(screen.getByRole('heading', { level: 1, name: post.title })).toBeTruthy();
    expect(screen.getByText(post.author)).toBeTruthy();
    expect(screen.getByText(`${post.readingMinutes} min read`)).toBeTruthy();
    // Every post has at least one H2 section in its body.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    expect(document.title).toBe(`${post.title} — NeuroCann Blog`);
  });

  it('links to the older post for prev/next navigation', () => {
    render(<BlogPostPage slug={post.slug} />);
    const older = posts[1];
    const link = screen.getByRole('link', { name: new RegExp(older.title) });
    expect(link.getAttribute('href')).toBe(`/blog/${older.slug}`);
  });

  it('renders a not-found state for an unknown slug', () => {
    render(<BlogPostPage slug="nope" />);
    expect(screen.getByText(/that post doesn.t exist/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /all posts/i }).getAttribute('href')).toBe('/blog');
  });

  it('navigates client-side when an internal link is clicked', () => {
    render(<BlogPostPage slug={post.slug} />);
    const pushState = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getAllByRole('link', { name: /all posts/i })[0]);
    expect(pushState).toHaveBeenCalledWith(null, '', '/blog');
    pushState.mockRestore();
  });
});

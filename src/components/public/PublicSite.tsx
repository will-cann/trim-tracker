import React from 'react';
import type { PublicRoute } from '../../lib/publicRouter';
import { BlogIndex } from '../Blog/BlogIndex';
import { BlogPostPage } from '../Blog/BlogPostPage';

/**
 * Renders a matched public route. Public pages are reachable whether or not
 * the visitor is signed in — they are the marketing site, not the app.
 */
export const PublicSite: React.FC<{ route: NonNullable<PublicRoute> }> = ({ route }) => {
  switch (route.kind) {
    case 'blog-index':
      return <BlogIndex />;
    case 'blog-post':
      return <BlogPostPage slug={route.slug} />;
  }
};

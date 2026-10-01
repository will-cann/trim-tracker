import React from 'react';
import type { BlogPost } from '../../lib/blog';
import { formatPostDate } from '../../lib/blog';
import { blogPostPath } from '../../lib/publicRouter';
import { Link } from '../public/Link';

interface BlogCardProps {
  post: BlogPost;
  /** `featured` renders a larger card for the newest post on the index. */
  variant?: 'default' | 'featured';
}

export const BlogCard: React.FC<BlogCardProps> = ({ post, variant = 'default' }) => {
  const featured = variant === 'featured';
  return (
    <Link
      href={blogPostPath(post.slug)}
      className={`group block h-full bg-white rounded-xl border border-gray-100 border-l-2 border-l-emerald-500 hover:shadow-md transition-shadow ${
        featured ? 'p-8 lg:p-10' : 'p-6'
      }`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
        <time dateTime={post.date}>{formatPostDate(post.date)}</time>
        <span className="text-gray-200">|</span>
        <span className="tabular-nums">{post.readingMinutes} min read</span>
      </div>
      <h3
        className={`font-black text-gray-900 tracking-tight group-hover:text-emerald-600 transition-colors ${
          featured ? 'text-3xl sm:text-4xl mb-4 leading-[1.08]' : 'text-lg mb-2 leading-snug'
        }`}
      >
        {post.title}
      </h3>
      <p className={`text-gray-500 leading-relaxed ${featured ? 'text-lg max-w-2xl mb-6' : 'text-sm mb-4'}`}>
        {post.description}
      </p>
      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span key={tag} className="text-[11px] font-bold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-md">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
};

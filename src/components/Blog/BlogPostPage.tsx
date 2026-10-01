import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getPostBySlug, getAdjacentPosts, formatPostDate, type BlogPost } from '../../lib/blog';
import { useDocumentHead } from '../../lib/documentHead';
import { BLOG_BASE_PATH, blogPostPath } from '../../lib/publicRouter';
import { PublicNav, DEMO_MAILTO } from '../public/PublicNav';
import { PublicFooter } from '../public/PublicFooter';
import { Link } from '../public/Link';
import { BlogMarkdown } from './BlogMarkdown';

const BackToBlog: React.FC = () => (
  <Link
    href={BLOG_BASE_PATH}
    className="group inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
  >
    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.5} />
    All posts
  </Link>
);

const NotFound: React.FC<{ slug: string }> = ({ slug }) => {
  useDocumentHead({ title: 'Post not found — NeuroCann Blog' });
  return (
    <main className="flex-1 flex items-center justify-center px-6 pt-16">
      <div className="text-center max-w-md">
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-gray-400 mb-4">404</p>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-3">That post doesn&apos;t exist.</h1>
        <p className="text-base text-gray-500 mb-8">
          Nothing is published at <code className="text-sm font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">/blog/{slug}</code>. It may have moved.
        </p>
        <BackToBlog />
      </div>
    </main>
  );
};

const AdjacentLink: React.FC<{ post: BlogPost; direction: 'newer' | 'older' }> = ({ post, direction }) => (
  <Link
    href={blogPostPath(post.slug)}
    className={`group flex flex-col gap-2 bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md transition-shadow ${
      direction === 'older' ? 'sm:text-right sm:items-end' : ''
    }`}
    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
  >
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
      {direction === 'newer' && <ArrowLeft className="w-3 h-3" strokeWidth={2.5} />}
      {direction === 'newer' ? 'Newer' : 'Older'}
      {direction === 'older' && <ArrowRight className="w-3 h-3" strokeWidth={2.5} />}
    </span>
    <span className="text-base font-black text-gray-900 leading-snug group-hover:text-emerald-600 transition-colors">{post.title}</span>
  </Link>
);

const Article: React.FC<{ post: BlogPost }> = ({ post }) => {
  const { newer, older } = getAdjacentPosts(post.slug);

  useDocumentHead({
    title: `${post.title} — NeuroCann Blog`,
    description: post.description,
    path: blogPostPath(post.slug),
    ogType: 'article',
  });

  return (
    <main className="flex-1">
      <article className="pt-28 lg:pt-36 pb-20 px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <header className="mb-12">
            <div className="mb-8">
              <BackToBlog />
            </div>
            {post.tags.length > 0 && (
              <div className="flex items-center gap-3 mb-5 text-emerald-600">
                <div className="w-10 h-0.5 bg-emerald-500 rounded-full" />
                <p className="text-xs font-bold tracking-[0.2em] uppercase">{post.tags.join(' · ')}</p>
              </div>
            )}
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-[1.05] tracking-tight mb-6">
              {post.title}
            </h1>
            {post.description && (
              <p className="text-xl text-gray-500 leading-relaxed mb-8">{post.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400 border-t border-gray-100 pt-5">
              <span className="font-bold text-gray-700">{post.author}</span>
              <span className="text-gray-200">|</span>
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              <span className="text-gray-200">|</span>
              <span className="tabular-nums">{post.readingMinutes} min read</span>
            </div>
          </header>

          <BlogMarkdown content={post.content} />

          <footer className="mt-16 pt-10 border-t border-gray-100">
            <div className="bg-gray-950 rounded-2xl px-8 py-10 relative overflow-hidden">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(59,181,112,0.14) 0%, transparent 70%)' }} />
              <div className="relative">
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Run your facility with your voice.</h2>
                <p className="text-base text-gray-400 mb-7 max-w-md">
                  See the loop from the post on your own rooms, harvests, and crew. Thirty minutes, no slides.
                </p>
                <a
                  href={DEMO_MAILTO}
                  className="group bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl transition-all text-sm inline-block shadow-lg shadow-emerald-500/25"
                >
                  Book a Demo
                  <span className="inline-block ml-2 transition-transform group-hover:translate-x-0.5">&rarr;</span>
                </a>
              </div>
            </div>

            {(newer || older) && (
              <nav aria-label="More posts" className="grid sm:grid-cols-2 gap-4 mt-10">
                <div>{newer && <AdjacentLink post={newer} direction="newer" />}</div>
                <div>{older && <AdjacentLink post={older} direction="older" />}</div>
              </nav>
            )}
          </footer>
        </div>
      </article>
    </main>
  );
};

export const BlogPostPage: React.FC<{ slug: string }> = ({ slug }) => {
  const post = getPostBySlug(slug);
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav variant="solid" active="blog" />
      {post ? <Article post={post} /> : <NotFound slug={slug} />}
      <PublicFooter />
    </div>
  );
};

export default BlogPostPage;

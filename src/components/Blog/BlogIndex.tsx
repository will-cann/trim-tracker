import React from 'react';
import { getAllPosts } from '../../lib/blog';
import { useDocumentHead } from '../../lib/documentHead';
import { BLOG_BASE_PATH } from '../../lib/publicRouter';
import { PublicNav, DEMO_MAILTO } from '../public/PublicNav';
import { PublicFooter } from '../public/PublicFooter';
import { Reveal } from '../public/Reveal';
import { Eyebrow } from '../public/Eyebrow';
import { BlogCard } from './BlogCard';

export const BlogIndex: React.FC = () => {
  const posts = getAllPosts();
  const [featured, ...rest] = posts;

  useDocumentHead({
    title: 'Blog — NeuroCann',
    description:
      'What we learned running rooms, harvests, trim floors, and extraction programs, and what the operators we work with have taught us since. Yields, batch sizes, sourcing, and compliance.',
    path: BLOG_BASE_PATH,
    ogType: 'website',
  });

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav variant="solid" active="blog" />

      <main className="flex-1">
        {/* ─── Header ─── */}
        <section className="relative pt-32 pb-14 lg:pt-40 lg:pb-20 px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] -translate-y-1/3 translate-x-1/3 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,181,112,0.07) 0%, rgba(59,181,112,0) 65%)' }} />
          <div className="max-w-7xl mx-auto relative">
            <div className="max-w-2xl">
              <div className="text-emerald-600" style={{ opacity: 0, animation: 'heroFadeIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.05s forwards' }}>
                <Eyebrow accent="bg-emerald-500" label="Blog" />
              </div>
              <h1
                className="text-5xl sm:text-6xl font-black text-gray-900 leading-[1.02] tracking-tight mb-6"
                style={{ opacity: 0, animation: 'heroFadeIn 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s forwards' }}
              >
                Notes from<br />the floor.
              </h1>
              <p
                className="text-lg text-gray-500 leading-relaxed"
                style={{ opacity: 0, animation: 'heroFadeIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.3s forwards' }}
              >
                What we learned running rooms, harvests, trim floors, and extraction programs, and what the operators we work with have taught us since. Yields, batch sizes, sourcing, and compliance, with the numbers where we have them.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Posts ─── */}
        <section className="px-6 lg:px-8 pb-28 lg:pb-36">
          <div className="max-w-7xl mx-auto">
            {posts.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-2xl py-20 text-center">
                <p className="text-base font-bold text-gray-900 mb-1">Nothing published yet.</p>
                <p className="text-sm text-gray-400">First posts are on the way.</p>
              </div>
            ) : (
              <>
                <Reveal>
                  <BlogCard post={featured} variant="featured" />
                </Reveal>
                {rest.length > 0 && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {rest.map((post, i) => (
                      <Reveal key={post.slug} delay={80 + i * 60} className="h-full">
                        <BlogCard post={post} />
                      </Reveal>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="border-t border-gray-100 bg-gray-50/80 py-20 px-6 lg:px-8">
          <Reveal>
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-2">See it run on your floor.</h2>
                <p className="text-base text-gray-500">Thirty minutes. Your harvest, your rooms, your workflow.</p>
              </div>
              <a
                href={DEMO_MAILTO}
                className="group self-start md:self-auto bg-gray-900 hover:bg-gray-800 text-white font-bold px-8 py-4 rounded-xl transition-colors text-sm inline-block"
              >
                Book a Demo
                <span className="inline-block ml-2 transition-transform group-hover:translate-x-0.5">&rarr;</span>
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      <PublicFooter />

      <style>{`
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default BlogIndex;

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Long-form article rendering for blog posts.
 *
 * The app's chat surfaces style markdown via `.ai-cmd-*` CSS. Articles want a
 * wider measure, larger type, and generous rhythm, so the element mapping is
 * defined here with Tailwind classes rather than reusing chat styles.
 */
const components: Components = {
  h2: ({ children }) => (
    <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mt-14 mb-5 leading-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xl font-black text-gray-900 tracking-tight mt-10 mb-3">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-bold text-gray-900 mt-8 mb-2">{children}</h4>
  ),
  p: ({ children }) => <p className="text-lg text-gray-600 leading-[1.75] mb-6">{children}</p>,
  a: ({ href, children }) => {
    const external = !!href && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className="text-emerald-700 font-bold underline decoration-emerald-200 decoration-2 underline-offset-[3px] hover:decoration-emerald-500 transition-colors"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-6 mb-6 space-y-2 marker:text-emerald-500">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-6 space-y-2 marker:text-gray-400 marker:font-bold">{children}</ol>,
  li: ({ children }) => <li className="text-lg text-gray-600 leading-[1.7] pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-emerald-500 pl-6 my-8 [&>p]:text-xl [&>p]:text-gray-900 [&>p]:font-bold [&>p]:leading-snug [&>p]:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-0 h-px bg-gray-200 my-12" />,
  code: ({ children, className }) => {
    const isBlock = !!className;
    if (isBlock) return <code className="text-sm text-gray-800 font-sans">{children}</code>;
    return <code className="text-[0.9em] font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 overflow-x-auto text-sm leading-relaxed">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-8 -mx-1 px-1">
      <table className="w-full text-left text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b-2 border-gray-200">{children}</thead>,
  th: ({ children }) => <th className="py-2.5 pr-4 text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</th>,
  td: ({ children }) => <td className="py-3 pr-4 text-gray-600 border-b border-gray-100 align-top leading-relaxed">{children}</td>,
  img: ({ src, alt }) => (
    <figure className="my-10">
      <img src={src} alt={alt ?? ''} className="w-full rounded-xl border border-gray-200" loading="lazy" />
      {alt && <figcaption className="text-xs text-gray-400 text-center mt-3">{alt}</figcaption>}
    </figure>
  ),
};

export const BlogMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <div className="blog-article">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  </div>
);

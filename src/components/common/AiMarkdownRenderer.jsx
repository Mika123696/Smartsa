import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';
import { useLanguage } from '../../context/useLanguage';
import { normalizeAiMarkdownText } from '../../utils/aiMarkdown';

function isSafeHttpUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function extractNodeText(node) {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractNodeText).join('');
  }
  if (node && typeof node === 'object' && node.props) {
    if (node.props.children !== undefined) {
      return extractNodeText(node.props.children);
    }
  }
  return '';
}

function extractCodeLanguage(children) {
  const childList = Array.isArray(children) ? children : [children];
  for (const child of childList) {
    const cls = child?.props?.className;
    if (typeof cls === 'string') {
      const match = cls.match(/language-([\w-]+)/i);
      if (match?.[1]) return match[1].toLowerCase();
    }
  }
  return '';
}

function MarkdownCodeBlock({ children }) {
  const { language } = useLanguage();
  const [copied, setCopied] = useState(false);

  const codeLanguage = extractCodeLanguage(children);
  const rawCode = extractNodeText(children).replace(/\n$/, '');

  const handleCopyCode = async () => {
    if (!rawCode) return;
    try {
      await navigator.clipboard?.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-[#2a384f] bg-slate-900 dark:bg-[#090d16] text-slate-100 shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/90 dark:bg-[#111827] border-b border-slate-700/80 text-[11px] font-mono">
        <span className="text-slate-300 uppercase tracking-wider">
          {codeLanguage || 'code'}
        </span>
        <button
          type="button"
          onClick={() => void handleCopyCode()}
          aria-label={language === 'en' ? 'Copy code block' : 'Salin blok kode'}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/70 hover:bg-slate-600 text-slate-200 transition text-[10px] font-semibold"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{language === 'en' ? 'Copied' : 'Disalin'}</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>{language === 'en' ? 'Copy' : 'Salin'}</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs font-mono leading-relaxed text-slate-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:border-0 [&_code]:text-inherit [&_code]:font-mono">
        {children}
      </pre>
    </div>
  );
}

const markdownComponents = {
  h1: ({ children }) => (
    <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 mt-4 mb-2 first:mt-0 tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 mt-4 mb-2 first:mt-0 tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1.5 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mt-2.5 mb-1 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-2 first:mt-0 last:mb-0 leading-relaxed text-slate-800 dark:text-slate-200">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-slate-900 dark:text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-slate-700 dark:text-slate-200">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="my-2 pl-5 list-disc space-y-1.5 text-slate-800 dark:text-slate-200">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 pl-5 list-decimal space-y-1.5 text-slate-800 dark:text-slate-200">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed [&>p]:my-0.5">{children}</li>
  ),
  hr: () => <hr className="my-4 border-t border-slate-200 dark:border-[#2a384f]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 pl-3.5 pr-3 py-2 border-l-3 border-indigo-400 dark:border-amber-400/70 bg-slate-100/80 dark:bg-[#0f1623] rounded-r-lg text-slate-700 dark:text-slate-300 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-[#2a384f]">
      <table className="w-full text-left text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-100 dark:bg-[#101725] text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-[#2a384f]">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-slate-200 dark:divide-[#232f42]">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-slate-100/60 dark:hover:bg-[#1c2536] transition-colors">{children}</tr>
  ),
  th: ({ children }) => <th className="py-2 px-3 font-semibold whitespace-nowrap">{children}</th>,
  td: ({ children }) => (
    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 align-top">{children}</td>
  ),
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 rounded-md bg-slate-200/75 dark:bg-[#0b101a] text-indigo-700 dark:text-sky-300 font-mono text-[12px] border border-slate-300/70 dark:border-[#26344a]">
      {children}
    </code>
  ),
  pre: ({ children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
  a: ({ href, children }) => {
    if (!isSafeHttpUrl(href)) {
      return <span className="text-slate-700 dark:text-slate-300">{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-sky-400 underline underline-offset-2 hover:opacity-80 break-all"
      >
        {children}
      </a>
    );
  },
};

/**
 * Renderer Markdown aman untuk balasan Asisten AI tanpa rehype-raw / dangerouslySetInnerHTML.
 */
export default function AiMarkdownRenderer({ content }) {
  const normalized = normalizeAiMarkdownText(content);
  if (!normalized.trim()) return null;

  return (
    <div className="ai-markdown-body text-xs sm:text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (isSafeHttpUrl(url) ? url : '')}
        components={markdownComponents}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

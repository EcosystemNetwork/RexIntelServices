/* eslint-disable @next/next/no-img-element */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Components } from "react-markdown";

/**
 * Server-rendered Markdown body for intel articles. GFM enabled (tables,
 * task lists, autolinks, strikethrough). Sanitized via rehype-sanitize with
 * the default schema augmented to allow `target` + `rel` on links so callers
 * don't have to lose external links in the rewrite.
 *
 * Falls back to plain whitespace-pre-wrap for legacy `bodyFormat: "plain"`
 * rows so the ~80 already-published articles render identically until we
 * backfill them.
 */
export function IntelArticleBody({
  body,
  format,
  className,
}: {
  body: string;
  format?: "plain" | "markdown";
  className?: string;
}) {
  if (format !== "markdown") {
    return (
      <div
        className={`text-[var(--rex-text-muted)] leading-relaxed whitespace-pre-wrap ${className ?? ""}`}
        style={{ fontSize: "15px" }}
      >
        {body}
      </div>
    );
  }
  return (
    <div className={`intel-prose ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              attributes: {
                ...defaultSchema.attributes,
                a: [
                  ...(defaultSchema.attributes?.a ?? []),
                  ["target"],
                  ["rel"],
                ],
                img: [
                  ...(defaultSchema.attributes?.img ?? []),
                  ["loading"],
                  ["decoding"],
                ],
              },
            },
          ],
        ]}
        components={INTEL_MD_COMPONENTS}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

const INTEL_MD_COMPONENTS: Components = {
  a: ({ href, children, ...rest }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
      {...rest}
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => {
    if (typeof src !== "string" || !src) return null;
    return (
      <figure className="my-6">
        <img
          src={src}
          alt={alt ?? ""}
          loading="lazy"
          decoding="async"
          className="block w-full h-auto border"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        />
        {alt && (
          <figcaption
            className="mt-2 text-[11px] font-mono italic"
            style={{ color: "var(--rex-text-dim)" }}
          >
            {alt}
          </figcaption>
        )}
      </figure>
    );
  },
  h2: ({ children }) => (
    <h2 className="font-display text-2xl text-white mt-10 mb-3 tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-xl text-white mt-8 mb-2 tracking-tight">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-[11px] font-mono uppercase tracking-widest mt-6 mb-2 text-[var(--rex-text-dim)]">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-[var(--rex-text-muted)] leading-relaxed my-4" style={{ fontSize: "15px" }}>
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-6 my-4 space-y-1.5 text-[var(--rex-text-muted)]" style={{ fontSize: "15px" }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 my-4 space-y-1.5 text-[var(--rex-text-muted)]" style={{ fontSize: "15px" }}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote
      className="border-l-2 pl-4 my-5 italic text-[var(--rex-text-muted)]"
      style={{ borderColor: "var(--rex-accent)", fontSize: "15px" }}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="font-mono text-xs leading-relaxed">{children}</code>
      );
    }
    return (
      <code
        className="font-mono text-[0.9em] px-1 py-[1px] rounded-sm"
        style={{
          background: "rgba(95,185,31,0.08)",
          color: "var(--rex-accent)",
          border: "1px solid rgba(95,185,31,0.18)",
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      className="my-5 p-4 overflow-x-auto rounded-sm font-mono text-xs leading-relaxed border"
      style={{
        background: "var(--rex-surface-2)",
        borderColor: "var(--rex-border-subtle)",
        color: "var(--rex-text-muted)",
      }}
    >
      {children}
    </pre>
  ),
  hr: () => (
    <hr
      className="my-8 border-0 border-t"
      style={{ borderColor: "var(--rex-border-subtle)" }}
    />
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full text-sm font-mono border-collapse">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead
      className="text-[10px] uppercase tracking-widest"
      style={{ color: "var(--rex-text-dim)" }}
    >
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th
      className="text-left px-3 py-2 border-b font-normal"
      style={{ borderColor: "var(--rex-border-subtle)" }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      className="px-3 py-2 border-b align-top text-[var(--rex-text-muted)]"
      style={{ borderColor: "var(--rex-border-subtle)" }}
    >
      {children}
    </td>
  ),
  strong: ({ children }) => (
    <strong className="text-white font-semibold">{children}</strong>
  ),
};

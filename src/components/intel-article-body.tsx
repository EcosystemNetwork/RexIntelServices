/* eslint-disable @next/next/no-img-element */
import { Children, type ReactNode } from "react";
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
        {linkifyEvmRefs(body)}
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

/**
 * Map a full chain address to the appropriate public block-explorer URL.
 * Only full-length addresses match — truncated/elided forms like
 * `0xabcd…1234` stay plain text. Returns null when the input isn't a
 * recognizable address pattern (so most inline code stays unlinked).
 *
 * Chain selection is deliberately conservative: EVM addresses default to
 * Etherscan even though they could be valid on Polygon/Base/Arbitrum/etc.
 * — the body usually surrounds the address with chain context, and the
 * Sources/Links block at the article tail has the chain-specific link.
 * Solana base58 → Solscan. BTC bech32 + base58 → mempool.space.
 */
function addressExplorerHref(text: string): string | null {
  const trimmed = text.trim();
  // EVM tx hash: 0x + 64 hex chars
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return `https://etherscan.io/tx/${trimmed}`;
  }
  // EVM address: 0x + 40 hex chars
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return `https://etherscan.io/address/${trimmed}`;
  }
  // BTC bech32 (segwit / taproot)
  if (/^bc1[a-z0-9]{38,87}$/.test(trimmed)) {
    return `https://mempool.space/address/${trimmed}`;
  }
  // BTC base58 (P2PKH starts with 1, P2SH starts with 3)
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed)) {
    return `https://mempool.space/address/${trimmed}`;
  }
  // Solana base58 (43-44 chars, base58 charset excludes 0/O/I/l)
  if (/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(trimmed)) {
    return `https://solscan.io/account/${trimmed}`;
  }
  return null;
}

/**
 * Linkify bare EVM references (addresses + tx hashes) inside free-flowing
 * text. Matches `0x` + 64 hex (tx) or `0x` + 40 hex (address) as standalone
 * tokens — bounded by non-hex-word chars so we don't slice into longer hex
 * runs. EVM-only by design: BTC/Solana patterns are too lenient to apply to
 * prose without false positives, so authors should backtick those.
 */
const EVM_REF_RE = /(?<![0-9a-fA-F])0x[a-fA-F0-9]{64}(?![0-9a-fA-F])|(?<![0-9a-fA-F])0x[a-fA-F0-9]{40}(?![0-9a-fA-F])/g;

function linkifyEvmRefs(input: string): ReactNode {
  EVM_REF_RE.lastIndex = 0;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = EVM_REF_RE.exec(input)) !== null) {
    if (m.index > last) parts.push(input.slice(last, m.index));
    const v = m[0];
    const href =
      v.length === 66
        ? `https://etherscan.io/tx/${v}`
        : `https://etherscan.io/address/${v}`;
    parts.push(
      <a
        key={`evm-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid break-all"
      >
        {v}
      </a>,
    );
    last = m.index + v.length;
  }
  if (last === 0) return input;
  if (last < input.length) parts.push(input.slice(last));
  return parts;
}

function linkifyChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" ? linkifyEvmRefs(child) : child,
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
    <h2 className="font-display text-2xl text-[var(--rex-text)] mt-10 mb-3 tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-xl text-[var(--rex-text)] mt-8 mb-2 tracking-tight">
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
      {linkifyChildren(children)}
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
  li: ({ children }) => <li className="leading-relaxed">{linkifyChildren(children)}</li>,
  blockquote: ({ children }) => (
    <blockquote
      className="border-l-2 pl-4 my-5 italic text-[var(--rex-text-muted)]"
      style={{ borderColor: "var(--rex-accent)", fontSize: "15px" }}
    >
      {linkifyChildren(children)}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="font-mono text-xs leading-relaxed">{children}</code>
      );
    }
    // Auto-link inline code that looks like a full chain address. Truncated
    // forms (`0xabcd…1234`) aren't valid lookup targets so they stay plain.
    const text =
      typeof children === "string"
        ? children
        : Array.isArray(children) &&
            children.length === 1 &&
            typeof children[0] === "string"
          ? children[0]
          : "";
    const href = addressExplorerHref(text);
    const codeEl = (
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
    if (!href) return codeEl;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="no-underline hover:opacity-80"
      >
        {codeEl}
      </a>
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
      {linkifyChildren(children)}
    </td>
  ),
  strong: ({ children }) => (
    <strong className="text-[var(--rex-text)] font-semibold">{linkifyChildren(children)}</strong>
  ),
  em: ({ children }) => <em>{linkifyChildren(children)}</em>,
};

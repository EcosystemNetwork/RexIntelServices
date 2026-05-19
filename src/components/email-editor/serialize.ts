/**
 * Tiptap JSON → email-safe HTML.
 *
 * The editor uses lightweight DOM shells (see nodes.ts) so writers can
 * point, click, and type. This serializer produces the RexIntel-branded
 * `<table>`-based, fully-inline-styled markup that Gmail/Outlook/Apple
 * actually render correctly. Anything not explicitly handled here falls
 * back to a sensible default — empty paragraphs, unknown nodes are
 * silently dropped.
 *
 * Output is wrapped in the 600px masthead frame so every visual-mode
 * campaign matches the RexIntel template aesthetic without the writer
 * having to remember the boilerplate.
 */

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttr = (s: string): string => s.replace(/"/g, "&quot;");

function inlineMarks(text: string, marks: TiptapNode["marks"]): string {
  let out = escapeHtml(text);
  if (!marks) return out;
  // Outside-in: text → bold inner, link outer, etc.
  for (const m of marks) {
    if (m.type === "bold") out = `<strong style="font-weight:700;">${out}</strong>`;
    else if (m.type === "italic") out = `<em>${out}</em>`;
    else if (m.type === "underline") out = `<u>${out}</u>`;
    else if (m.type === "code")
      out = `<code style="font-family:'Courier New',monospace;font-size:0.92em;background:#f4f4f7;padding:1px 5px;border-radius:3px;">${out}</code>`;
    else if (m.type === "link") {
      const href = String(m.attrs?.href ?? "#");
      out = `<a href="${escapeAttr(href)}" style="color:#5fb91f;text-decoration:underline;">${out}</a>`;
    }
  }
  return out;
}

function renderInline(content?: TiptapNode[]): string {
  if (!content) return "";
  return content
    .map((n) => {
      if (n.type === "text") return inlineMarks(n.text ?? "", n.marks);
      if (n.type === "hardBreak") return "<br>";
      if (n.type === "mergeTag") {
        const field = String(n.attrs?.field ?? "firstName");
        return `{{${field}}}`;
      }
      return "";
    })
    .join("");
}

function renderNode(node: TiptapNode): string {
  switch (node.type) {
    case "paragraph":
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#222;">${renderInline(node.content)}</p>`;

    case "heading": {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2)));
      const sizes = { 1: 26, 2: 20, 3: 17 } as const;
      const margins = { 1: "0 0 14px", 2: "26px 0 10px", 3: "20px 0 8px" } as const;
      return `<h${level} style="margin:${margins[level as 1 | 2 | 3]};font-size:${sizes[level as 1 | 2 | 3]}px;line-height:1.25;color:#111;font-weight:700;">${renderInline(node.content)}</h${level}>`;
    }

    case "bulletList":
      return `<ul style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.65;color:#222;">${(node.content ?? []).map(renderNode).join("")}</ul>`;

    case "orderedList":
      return `<ol style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.65;color:#222;">${(node.content ?? []).map(renderNode).join("")}</ol>`;

    case "listItem":
      return `<li style="margin-bottom:6px;">${(node.content ?? []).map(renderNode).join("")}</li>`;

    case "blockquote":
      return `<blockquote style="margin:16px 0;padding:8px 16px;border-left:3px solid #5fb91f;background:#f4f4f7;color:#444;font-style:italic;">${(node.content ?? []).map(renderNode).join("")}</blockquote>`;

    case "horizontalRule":
      return `<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0;">`;

    case "codeBlock":
      return `<pre style="font-family:'Courier New',monospace;font-size:13px;background:#f4f4f7;padding:12px;border-radius:4px;overflow-x:auto;margin:0 0 16px;">${renderInline(node.content)}</pre>`;

    case "sectionLabel":
      return `<div style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;margin:24px 0 8px;">▸ ${renderInline(node.content)}</div>`;

    case "statCardRow": {
      const cells = (node.attrs?.cells ?? []) as Array<{
        value: string;
        label: string;
        color: string;
      }>;
      const cellsHtml = cells
        .map(
          (c, i) =>
            `${i > 0 ? '<td width="6">&nbsp;</td>' : ""}<td width="33%" align="center" style="padding:14px 6px;background:#0a0a0f;border:1px solid #2a2a35;border-radius:6px;"><div style="font-family:'Courier New',monospace;font-size:22px;color:${escapeAttr(c.color || "#5fb91f")};font-weight:700;">${escapeHtml(c.value)}</div><div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.15em;color:#8888a0;text-transform:uppercase;margin-top:4px;">${escapeHtml(c.label)}</div></td>`,
        )
        .join("");
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:12px 0 20px;"><tr>${cellsHtml}</tr></table>`;
    }

    case "ctaButton": {
      const label = String(node.attrs?.label ?? "Read full report →");
      const href = String(node.attrs?.href ?? "#");
      const variant = String(node.attrs?.variant ?? "primary");
      const bg = variant === "inverse" ? "#0a0a0f" : "#5fb91f";
      const fg = variant === "inverse" ? "#5fb91f" : "#0a0a0f";
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0;"><tr><td align="center" style="padding:16px;background:${bg};border-radius:6px;"><a href="${escapeAttr(href)}" style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:${fg};font-weight:700;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
    }

    case "walletAddress": {
      const addr = String(node.attrs?.address ?? "");
      return `<div style="font-family:'Courier New',monospace;font-size:12px;color:#0a0a0f;background:#f4f4f7;border-left:3px solid #5fb91f;padding:12px 14px;margin:10px 0 16px;word-break:break-all;">${escapeHtml(addr)}</div>`;
    }

    default:
      return "";
  }
}

const MASTHEAD = (subject: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0a0a0f;padding:18px 32px;">
            <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.22em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              Rex Intel Services
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">`;

const FOOTER = `          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #e5e5e5;font-family:-apple-system,sans-serif;font-size:12px;color:#888;line-height:1.7;text-align:center;">
            <a href="https://x.com/rexintelservice" style="color:#888;text-decoration:underline;">@rexintelservice</a>
            &nbsp;·&nbsp;
            <a href="mailto:rexintelservices@proton.me" style="color:#888;text-decoration:underline;">rexintelservices@proton.me</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

export function serializeDocToEmail(doc: TiptapNode): string {
  if (doc.type !== "doc") {
    throw new Error("serializeDocToEmail expects a doc node");
  }
  const body = (doc.content ?? []).map(renderNode).join("\n");
  // Wrap in the RexIntel masthead frame. The masthead's subject slot isn't
  // wired yet — the campaign subject lives outside the body — but the frame
  // gives every visual-mode draft a consistent inbox look.
  return `${MASTHEAD("")}\n${body}\n${FOOTER}`;
}

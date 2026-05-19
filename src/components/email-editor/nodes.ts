import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Custom Tiptap nodes for the RexIntel email composer.
 *
 * These are EDITOR-SIDE schemas — they render into the contenteditable DOM
 * with simple, recognizable shells so writers can click + edit. The OUTPUT
 * (the actual HTML email that goes through Resend) is produced separately
 * by `serialize.ts`, which emits the table-based, inline-styled markup that
 * Gmail / Outlook / Apple Mail will actually render correctly.
 */

// --- Stat card row: three pillared metric cells ---

export const StatCardRow = Node.create({
  name: "statCardRow",
  group: "block",
  atom: false,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      cells: {
        default: [
          { value: "$9.4B", label: "Lost crypto tracked", color: "#5fb91f" },
          { value: "+83", label: "Wallets tagged", color: "#1fa8e0" },
          { value: "12", label: "New incidents", color: "#fbbf24" },
        ],
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-rex-statcard]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const cells = (node.attrs.cells ?? []) as Array<{
      value: string;
      label: string;
      color: string;
    }>;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-rex-statcard": "1",
        style:
          "display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0;",
      }),
      ...cells.map((c) => [
        "div",
        {
          style: `padding:14px 6px;background:#111118;border:1px solid #2a2a35;border-radius:6px;text-align:center;`,
        },
        [
          "div",
          {
            style: `font-family:'Courier New',monospace;font-size:22px;color:${c.color};font-weight:700;`,
          },
          c.value,
        ],
        [
          "div",
          {
            style: `font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.15em;color:#8888a0;text-transform:uppercase;margin-top:4px;`,
          },
          c.label,
        ],
      ]),
    ];
  },
});

// --- CTA button: branded link block ---

export const CTAButton = Node.create({
  name: "ctaButton",
  group: "block",
  atom: false,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      label: { default: "Read full report →" },
      href: { default: "https://rexintelservices.com" },
      // 'primary' (green-on-dark) or 'inverse' (dark-on-green for body cells)
      variant: { default: "primary" },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-rex-cta]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const isInverse = node.attrs.variant === "inverse";
    return [
      "div",
      { style: "margin:14px 0;text-align:center;" },
      [
        "a",
        mergeAttributes(HTMLAttributes, {
          "data-rex-cta": "1",
          href: node.attrs.href,
          style: `display:inline-block;padding:16px 28px;background:${isInverse ? "#0a0a0f" : "#5fb91f"};color:${isInverse ? "#5fb91f" : "#0a0a0f"};font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;text-decoration:none;border-radius:6px;`,
        }),
        node.attrs.label,
      ],
    ];
  },
});

// --- Wallet address: monospace evidence chip ---

export const WalletAddress = Node.create({
  name: "walletAddress",
  group: "block",
  atom: false,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      address: { default: "0x0000000000000000000000000000000000000000" },
    };
  },

  parseHTML() {
    return [{ tag: "code[data-rex-wallet]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "code",
      mergeAttributes(HTMLAttributes, {
        "data-rex-wallet": "1",
        style: `display:block;font-family:'Courier New',monospace;font-size:12px;color:#1fa8e0;background:#111118;border:1px solid #2a2a35;border-radius:4px;padding:10px 12px;margin:10px 0;word-break:break-all;`,
      }),
      node.attrs.address,
    ];
  },
});

// --- Section label: the ▸ eyebrow above sections ---

export const SectionLabel = Node.create({
  name: "sectionLabel",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-rex-section]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-rex-section": "1",
        style: `font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;margin:18px 0 6px;`,
      }),
      ["span", "▸ "],
      ["span", { contenteditable: "true" }, 0],
    ];
  },
});

// --- Merge tag: inline atom for {{firstName}} etc. ---

export const MergeTag = Node.create({
  name: "mergeTag",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      field: { default: "firstName" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-rex-merge]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-rex-merge": "1",
        style: `display:inline-block;padding:0 6px;background:rgba(95,185,31,0.12);color:#5fb91f;border:1px solid rgba(95,185,31,0.35);border-radius:3px;font-family:'Courier New',monospace;font-size:0.85em;`,
      }),
      `{{${node.attrs.field}}}`,
    ];
  },
});

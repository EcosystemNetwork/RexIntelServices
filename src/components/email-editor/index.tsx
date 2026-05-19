"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  StatCardRow,
  CTAButton,
  WalletAddress,
  SectionLabel,
  MergeTag,
} from "./nodes";
import { serializeDocToEmail, type TiptapNode } from "./serialize";

export interface EmailEditorProps {
  initialDoc: TiptapNode | null;
  onChange: (doc: TiptapNode, html: string) => void;
  disabled?: boolean;
}

/**
 * Block-based composer for RexIntel newsletters. Stores edits as a Tiptap
 * document; serializes to email-safe HTML on every keystroke so the
 * campaign's htmlBody is always send-ready.
 *
 * The visual editor + serializer are intentionally one-way: writers see
 * a simple WYSIWYG (paragraphs, headings, lists, stat cards, CTAs, wallets,
 * merge tags) and the OUTPUT is the inline-styled table HTML email clients
 * actually render. Importing arbitrary external HTML back into the visual
 * editor is not supported — that's what HTML mode is for.
 */
export default function EmailEditor({
  initialDoc,
  onChange,
  disabled,
}: EmailEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We provide our own block-level primitives (statCardRow, ctaButton,
        // walletAddress, sectionLabel) that StarterKit doesn't know about.
        // Disable starter's link so our extension config wins.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { style: "color:#5fb91f;text-decoration:underline;" },
      }),
      Placeholder.configure({
        placeholder: "Start writing or use Insert ▾ for stat cards, CTAs, wallets…",
      }),
      StatCardRow,
      CTAButton,
      WalletAddress,
      SectionLabel,
      MergeTag,
    ],
    content:
      initialDoc ??
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Hey " },
              { type: "mergeTag", attrs: { field: "firstName" } },
              { type: "text", text: ", here's what we're watching." },
            ],
          },
        ],
      },
    editable: !disabled,
    onUpdate({ editor }) {
      const doc = editor.getJSON() as TiptapNode;
      const html = serializeDocToEmail(doc);
      onChange(doc, html);
    },
    immediatelyRender: false,
  });

  // Surface the same content on mount so the campaign row stays in sync even
  // if the operator clicks Save without touching the editor.
  useEffect(() => {
    if (editor && initialDoc) {
      const html = serializeDocToEmail(initialDoc);
      onChange(initialDoc, html);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) {
    return (
      <div style={{ color: "var(--rex-text-dim)" }} className="text-sm p-4">
        Loading editor…
      </div>
    );
  }

  return (
    <div
      className="rex-card overflow-hidden"
      style={{ background: "var(--rex-bg)" }}
    >
      <Toolbar editor={editor} disabled={disabled} />
      <div
        style={{
          maxHeight: "60vh",
          minHeight: 360,
          overflowY: "auto",
          padding: "20px 24px",
          background: "white",
          color: "#111",
        }}
        className="rex-email-editor-host"
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  disabled,
}: {
  editor: Editor;
  disabled?: boolean;
}) {
  const btn = (label: string, onClick: () => void, active = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? "var(--rex-accent)" : "var(--rex-border)",
        background: active ? "rgba(95,185,31,0.12)" : "transparent",
        color: active ? "var(--rex-accent)" : "var(--rex-text-muted)",
        fontFamily:
          label.startsWith("{") || label.startsWith("✦")
            ? "'Courier New', monospace"
            : undefined,
      }}
    >
      {label}
    </button>
  );

  function insertStatCard() {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "statCardRow",
        attrs: {
          cells: [
            { value: "$X.X M", label: "Loss", color: "#f87171" },
            { value: "+N", label: "Wallets tagged", color: "#1fa8e0" },
            { value: "N", label: "Incidents", color: "#5fb91f" },
          ],
        },
      })
      .run();
  }
  function insertCta() {
    const label = prompt("Button label", "Read full report →") ?? undefined;
    const href = prompt("Button URL", "https://rexintelservices.com") ?? undefined;
    if (!label || !href) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "ctaButton",
        attrs: { label, href, variant: "primary" },
      })
      .run();
  }
  function insertWallet() {
    const address = prompt(
      "Wallet address",
      "0x0000000000000000000000000000000000000000",
    );
    if (!address) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "walletAddress",
        attrs: { address },
      })
      .run();
  }
  function insertSection() {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "sectionLabel",
        content: [{ type: "text", text: "Section" }],
      })
      .run();
  }
  function insertMergeTag(field: "firstName" | "lastName" | "email") {
    editor
      .chain()
      .focus()
      .insertContent({ type: "mergeTag", attrs: { field } })
      .run();
  }
  function setLink() {
    const href = prompt("Link URL", "https://");
    if (!href) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 p-2 border-b"
      style={{
        borderColor: "var(--rex-border-subtle)",
        background: "var(--rex-surface)",
      }}
    >
      {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {btn(
        "H1",
        () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        editor.isActive("heading", { level: 1 }),
      )}
      {btn(
        "H2",
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        editor.isActive("heading", { level: 2 }),
      )}
      {btn(
        "•",
        () => editor.chain().focus().toggleBulletList().run(),
        editor.isActive("bulletList"),
      )}
      {btn(
        "1.",
        () => editor.chain().focus().toggleOrderedList().run(),
        editor.isActive("orderedList"),
      )}
      {btn("Link", setLink, editor.isActive("link"))}
      {btn("―", () => editor.chain().focus().setHorizontalRule().run())}
      <div className="w-px self-stretch mx-1" style={{ background: "var(--rex-border)" }} />
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Insert
      </span>
      {btn("✦ Stat card", insertStatCard)}
      {btn("✦ CTA button", insertCta)}
      {btn("✦ Wallet", insertWallet)}
      {btn("✦ Section", insertSection)}
      <div className="w-px self-stretch mx-1" style={{ background: "var(--rex-border)" }} />
      {btn("{{firstName}}", () => insertMergeTag("firstName"))}
      {btn("{{lastName}}", () => insertMergeTag("lastName"))}
      {btn("{{email}}", () => insertMergeTag("email"))}
    </div>
  );
}

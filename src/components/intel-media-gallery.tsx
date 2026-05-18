/* eslint-disable @next/next/no-img-element */
import type { IntelMedia } from "@/lib/db/schema";
import { detectVideoEmbed, isAllowedEmbedHost } from "@/lib/media-embed";

/**
 * Renders the `media[]` array from an IntelPayload as a stacked gallery
 * below the article body. Image figures get caption + credit; videos try
 * the embed-detector first and fall back to `<video>`; embeds are gated
 * by `isAllowedEmbedHost` so a malformed payload can't escape the iframe
 * allowlist.
 */
export function IntelMediaGallery({ media }: { media: IntelMedia[] }) {
  if (!media.length) return null;
  return (
    <div
      className="border-t pt-5 mt-5"
      style={{ borderColor: "var(--rex-border-subtle)" }}
    >
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-3"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Evidence
      </div>
      <div className="space-y-6">
        {media.map((m, i) => (
          <MediaFigure key={i} item={m} />
        ))}
      </div>
    </div>
  );
}

function MediaFigure({ item }: { item: IntelMedia }) {
  return (
    <figure>
      <div
        className="relative overflow-hidden border"
        style={{
          borderColor: "var(--rex-border-subtle)",
          background: "var(--rex-surface-2)",
        }}
      >
        <MediaBody item={item} />
      </div>
      {(item.caption || item.credit) && (
        <figcaption
          className="mt-2 text-[11px] font-mono px-1 flex items-baseline justify-between gap-3"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {item.caption && (
            <span className="italic leading-snug">{item.caption}</span>
          )}
          {item.credit && (
            <span className="uppercase tracking-widest whitespace-nowrap ml-auto">
              {item.credit}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

function MediaBody({ item }: { item: IntelMedia }) {
  if (item.kind === "image") {
    return (
      <img
        src={item.url}
        alt={item.alt ?? item.caption ?? ""}
        loading="lazy"
        className="block w-full h-auto"
      />
    );
  }
  if (item.kind === "video") {
    const embed = detectVideoEmbed(item.url);
    if (embed) {
      return (
        <div style={{ aspectRatio: "16 / 9" }}>
          <iframe
            src={embed.src}
            title={item.caption ?? "Embedded video"}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full"
            style={{ border: 0 }}
          />
        </div>
      );
    }
    return (
      <video
        src={item.url}
        poster={item.poster}
        controls
        preload="metadata"
        playsInline
        className="block w-full h-auto"
        aria-label={item.caption ?? "Embedded video"}
      />
    );
  }
  // kind === "embed"
  if (!isAllowedEmbedHost(item.url)) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-4 font-mono text-xs text-[var(--rex-accent)] hover:underline break-all"
      >
        {item.url}
      </a>
    );
  }
  const embed = detectVideoEmbed(item.url);
  const src = embed?.src ?? item.url;
  return (
    <div style={{ aspectRatio: "16 / 9" }}>
      <iframe
        src={src}
        title={item.caption ?? "Embedded content"}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        className="w-full h-full"
        style={{ border: 0 }}
      />
    </div>
  );
}

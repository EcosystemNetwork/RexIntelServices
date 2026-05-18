/* eslint-disable @next/next/no-img-element */
import type { IntelPayload } from "@/lib/db/schema";
import { detectVideoEmbed } from "@/lib/media-embed";

/**
 * Hero block for an intel article. Picks video over image when both set so
 * an in-house breakdown clip beats a static thumbnail. Falls back gracefully
 * to nothing — pages without hero render the headline at the top as before.
 */
export function IntelHero({ payload }: { payload: IntelPayload }) {
  const hasVideo = !!payload.heroVideoUrl;
  const hasImage = !!payload.heroImageUrl;
  if (!hasVideo && !hasImage) return null;

  return (
    <figure className="mb-8 -mx-4 sm:mx-0">
      <div
        className="relative overflow-hidden border mx-auto"
        style={{
          borderColor: "var(--rex-border-subtle)",
          background: "var(--rex-surface-2)",
          // Cap the hero at a sensible reading-flow height so the article
          // body is still close to the top of the viewport on first paint.
          // Banner-style hero PNGs (Casper Final Round, etc.) and the
          // typographic stat-card SVGs both fit cleanly in this envelope.
          maxHeight: "320px",
          aspectRatio: "21 / 9",
        }}
      >
        {hasVideo ? (
          <HeroVideo
            url={payload.heroVideoUrl!}
            poster={payload.heroPoster}
            alt={payload.heroAlt ?? payload.headline}
          />
        ) : (
          <img
            src={payload.heroImageUrl!}
            alt={payload.heroAlt ?? payload.headline}
            loading="eager"
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
      </div>
      {(payload.heroCaption || payload.heroCredit) && (
        <figcaption
          className="mt-2 text-[11px] font-mono px-1 flex items-baseline justify-between gap-3"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {payload.heroCaption && (
            <span className="italic leading-snug">
              {payload.heroCaption}
            </span>
          )}
          {payload.heroCredit && (
            <span className="uppercase tracking-widest whitespace-nowrap ml-auto">
              {payload.heroCredit}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

function HeroVideo({
  url,
  poster,
  alt,
}: {
  url: string;
  poster?: string;
  alt: string;
}) {
  const embed = detectVideoEmbed(url);
  if (embed) {
    return (
      <iframe
        src={embed.src}
        title={alt}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
        style={{ border: 0 }}
      />
    );
  }
  // Direct video file (mp4/webm). Controls + poster, no autoplay — autoplay
  // hurts perceived performance on an article hero and most readers want
  // the still until they decide to play.
  return (
    <video
      src={url}
      poster={poster}
      controls
      preload="metadata"
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
      aria-label={alt}
    />
  );
}

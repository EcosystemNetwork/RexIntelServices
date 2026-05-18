/* eslint-disable @next/next/no-img-element */

/**
 * Shared hero-banner for program-lane detail pages (accelerators,
 * fellowships, grants, capital, perks, jobs, residencies, pop-up cities,
 * hackathons). Renders nothing when imageUrl is missing — so the 80 rows
 * the OG-scrape couldn't reach degrade silently to the old text-only
 * layout instead of showing a broken-image box.
 *
 * Keep this in sync with the IntelHero component visually so the two
 * surfaces feel like one product. Aspect ratio is 21:9 here (vs 16:9 on
 * intel) because program cards are mostly logos/team shots and 16:9
 * leaves too much dead space.
 */
export function ProgramHero({
  imageUrl,
  alt,
  caption,
}: {
  imageUrl?: string;
  alt: string;
  caption?: string;
}) {
  if (!imageUrl) return null;
  return (
    <figure className="mb-6 -mx-4 sm:mx-0">
      <div
        className="relative overflow-hidden border"
        style={{
          borderColor: "var(--rex-border-subtle)",
          background: "var(--rex-surface-2)",
          aspectRatio: "21 / 9",
        }}
      >
        <img
          src={imageUrl}
          alt={alt}
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      {caption && (
        <figcaption
          className="mt-2 text-[11px] font-mono italic px-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

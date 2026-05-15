/* eslint-disable @next/next/no-img-element */
import Image from "next/image";

/**
 * External-image wrapper. Picks next/image for hosts on our remotePatterns
 * allowlist (configured in next.config.js) so we get on-the-fly
 * optimization + CDN caching; falls back to a plain <img> for unknown
 * hosts so submissions from any source still render.
 *
 * Keep KNOWN_HOSTS in sync with next.config.js — when a host isn't on
 * BOTH lists, next/image throws at runtime. Misses are cheap (just an
 * unoptimized image), false positives are expensive (broken page).
 *
 * Used on event / pop-up-city / hackathon detail banners + card
 * thumbnails. Width / height should be the largest size the component
 * actually renders at — next/image generates srcsets from that.
 */

const KNOWN_HOSTS: RegExp[] = [
  /(^|\.)lumacdn\.com$/i,
  /^cdn\.evbuc\.com$/i,
  /^img\.evbuc\.com$/i,
  /^ethglobal\.b-cdn\.net$/i,
  /^ethglobal\.com$/i,
  /(^|\.)cloudinary\.com$/i,
  /(^|\.)cloudfront\.net$/i,
  /(^|\.)imgix\.net$/i,
  /(^|\.)devpost\.com$/i,
  /^images\.unsplash\.com$/i,
];

function isKnownHost(src: string): boolean {
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return false;
    return KNOWN_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  /** Forces unoptimized rendering even for known hosts. Useful for SVGs. */
  unoptimized?: boolean;
  priority?: boolean;
};

export function ProxiedImage({
  src,
  alt,
  width,
  height,
  className,
  unoptimized,
  priority,
}: Props) {
  if (!src) return null;
  if (!isKnownHost(src) || unoptimized) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}

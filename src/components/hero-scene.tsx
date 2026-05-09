"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// UnicornStudio touches `window` on mount, so it can't be SSR'd. Dynamic
// import with ssr:false also keeps the ~1MB SDK out of the initial JS bundle —
// the landing-page hero stays interactive immediately while the scene streams
// in afterwards. The `/next` entry is the package's Next.js-tuned build.
const UnicornScene = dynamic(
  () => import("unicornstudio-react/next").then((m) => m.UnicornScene),
  { ssr: false },
);

const PROJECT_ID = "tlOtPGd5onVJvvZ6KcoD";
const SDK_URL =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@2.1.12/dist/unicornStudio.umd.js";

// Wordmark + subtitle are baked into the scene at these exact pixel positions.
// Stretching the canvas to other aspect ratios collapses the gap between them
// and produces visible text overlap, so we render at native size and CSS-scale
// uniformly to fit narrower viewports.
const NATIVE_W = 1440;
const NATIVE_H = 900;

/**
 * Animated background scene for hero areas. Renders at native 1440×900 and
 * uniformly scales down (via CSS transform) to fit the container width so the
 * baked wordmark/subtitle keep their designed spacing on every breakpoint.
 * Falls back to nothing when the user prefers reduced motion — the underlying
 * `tactical-bg` keeps the page on-brand even without the scene.
 */
export function HeroScene({
  height = "100vh",
  // Pixels to drop the scene below the top of its container. Lets the page's
  // classification bar + header sit above the scene's baked-in wordmark
  // instead of clipping it.
  topOffset = 0,
}: {
  height?: string;
  topOffset?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      // Fit by width so the wordmark + subtitle never get cropped horizontally.
      // Cap at 1 so we don't upscale the scene above its native resolution on
      // ultra-wide displays.
      setScale(Math.min(1, r.width / NATIVE_W));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="absolute left-0 right-0 overflow-hidden pointer-events-none"
      style={{
        zIndex: 0,
        top: topOffset,
        height: topOffset
          ? `calc(${height} - ${topOffset}px)`
          : height,
      }}
    >
      {!reducedMotion && (
        <div
          className="absolute left-1/2 top-0"
          style={{
            width: `${NATIVE_W}px`,
            height: `${NATIVE_H}px`,
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          <UnicornScene
            projectId={PROJECT_ID}
            width={`${NATIVE_W}px`}
            height={`${NATIVE_H}px`}
            scale={1}
            dpi={1.5}
            sdkUrl={SDK_URL}
          />
        </div>
      )}
      {/* Soft fade so hero text stays readable over busy areas of the scene */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(10,10,15,0) 0%, rgba(10,10,15,0.55) 70%, rgba(10,10,15,0.85) 100%)",
        }}
      />
    </div>
  );
}

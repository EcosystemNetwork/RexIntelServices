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

/**
 * Animated background scene for hero areas. Sized to fill its parent band
 * via ResizeObserver so the scene tracks viewport changes instead of being
 * clipped at the native 1440×900. Falls back to nothing when the user
 * prefers reduced motion — the underlying `tactical-bg` keeps the page
 * on-brand even without the scene.
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
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
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
      // Round up to avoid sub-pixel blur on the canvas backing store.
      setSize({ w: Math.ceil(r.width), h: Math.ceil(r.height) });
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
      // Constrain to the requested height so the canvas doesn't run for the
      // whole scrollable page (anything below this band falls back to the
      // static tactical-bg). Sits above the base bg, below all text/UI.
      style={{
        zIndex: 0,
        top: topOffset,
        height: topOffset
          ? `calc(${height} - ${topOffset}px)`
          : height,
      }}
    >
      {!reducedMotion && size && (
        <UnicornScene
          projectId={PROJECT_ID}
          width={`${size.w}px`}
          height={`${size.h}px`}
          scale={1}
          dpi={1.5}
          sdkUrl={SDK_URL}
        />
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

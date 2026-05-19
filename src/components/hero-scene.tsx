"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// UnicornStudio touches `window` on mount, so it can't be SSR'd. Dynamic
// import with ssr:false keeps the ~1MB SDK out of the initial JS bundle —
// the landing-page hero stays interactive immediately while the scene streams
// in afterwards.
const UnicornScene = dynamic(
  () => import("unicornstudio-react").then((m) => m.default ?? m),
  { ssr: false },
);

const PROJECT_ID = "tlOtPGd5onVJvvZ6KcoD";
const SDK_URL =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.1.12/dist/unicornStudio.umd.js";

/**
 * Animated background scene for hero areas. Renders the UnicornStudio scene
 * to fill its container. Falls back to nothing when the user prefers reduced
 * motion — the underlying `tactical-bg` keeps the page on-brand without it.
 */
export function HeroScene({
  height = "100vh",
  // Pixels to drop the scene below the top of its container. Lets the page's
  // classification bar + header sit above the scene instead of clipping it.
  topOffset = 0,
}: {
  height?: string;
  topOffset?: number;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div
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
        <div className="absolute inset-0">
          <UnicornScene
            projectId={PROJECT_ID}
            width="100%"
            height="100%"
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

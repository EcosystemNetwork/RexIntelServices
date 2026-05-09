"use client";

import dynamic from "next/dynamic";

// UnicornStudio touches `window` on mount, so it can't be SSR'd. Dynamic
// import with ssr:false keeps the SDK out of the initial JS bundle too.
const UnicornScene = dynamic(() => import("unicornstudio-react"), {
  ssr: false,
});

/**
 * Animated background scene for hero areas. Renders the UnicornStudio scene
 * at its native 1440×900 and centers it within a `height`-tall band pinned
 * to the top of its `relative` parent. Anything wider/taller than the band
 * is clipped by `overflow-hidden`.
 */
export function HeroScene({ height = "100vh" }: { height?: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 left-0 right-0 overflow-hidden pointer-events-none flex items-center justify-center"
      style={{ zIndex: 0, height }}
    >
      <UnicornScene
        projectId="tlOtPGd5onVJvvZ6KcoD"
        width="1440px"
        height="900px"
        scale={1}
        dpi={1.5}
        sdkUrl="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@2.1.12/dist/unicornStudio.umd.js"
      />
    </div>
  );
}

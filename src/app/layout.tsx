import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

// metadataBase is what Next uses to resolve any relative OG/Twitter image
// path (like "/rex-banner.png") to an absolute URL in the rendered <meta>
// tags. Without this, Twitter/Slack/Discord previews fall back to no image.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Rex Intel Services",
  description:
    "Crypto intelligence, curated events, grants, accelerators, and pop-up cities — one operations channel for the field.",
  keywords: [
    "intelligence",
    "newsletter",
    "briefing",
    "crypto",
    "events",
    "grants",
    "accelerators",
    "hackathons",
    "Rex Intel Services",
  ],
  manifest: "/favicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Rex Intel Services",
    description:
      "Crypto intelligence, curated events, grants, accelerators, and pop-up cities.",
    type: "website",
    url: "/",
    siteName: "Rex Intel Services",
    images: [
      {
        url: "/rex-banner.png",
        width: 1200,
        height: 630,
        alt: "Rex Intel Services — crypto intelligence + field calendar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rex Intel Services",
    description:
      "Crypto intelligence, curated events, grants, accelerators, and pop-up cities.",
    images: ["/rex-banner.png"],
  },
  alternates: {
    // Surfaced to feed-reader auto-discovery via <link rel="alternate"> tags.
    types: {
      "application/rss+xml": [
        { url: "/intel/feed.xml", title: "Rex Intel — Intel Wire" },
        { url: "/events/feed.xml", title: "Rex Intel — Field Calendar" },
      ],
      "text/calendar": [
        { url: "/events/calendar.ics", title: "Rex Intel — Field Calendar (iCal)" },
      ],
    },
  },
};

// Runs synchronously in <head> before paint, so `data-theme` is on <html>
// before any CSS or React hydrates. Avoids the white-flash you'd otherwise
// get when the theme is "light" and CSS vars don't switch until after JS
// runs. localStorage read is wrapped in try/catch because some embedded
// browsers (and SSR re-hydration during prefetch) can throw on access.
const themeInitScript = `
(function(){try{var t=localStorage.getItem('rex-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased noise-bg">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

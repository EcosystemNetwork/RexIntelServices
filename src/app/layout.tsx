import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rex Intel Services",
  description:
    "Monthly intelligence briefings delivered straight to your inbox. Market analysis, alpha signals, and curated intel from the front lines.",
  keywords: ["intelligence", "newsletter", "briefing", "analysis", "Rex Intel Services"],
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
      "Monthly intelligence briefings delivered straight to your inbox.",
    type: "website",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased noise-bg">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

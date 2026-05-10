import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased noise-bg">{children}</body>
    </html>
  );
}

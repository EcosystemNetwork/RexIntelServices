import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rex Intel Services",
  description:
    "Monthly intelligence briefings delivered straight to your inbox. Market analysis, alpha signals, and curated intel from the front lines.",
  keywords: ["intelligence", "newsletter", "briefing", "analysis", "Rex Intel Services"],
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newsletter",
  description: "Send better email.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-neutral-900 bg-white">{children}</body>
    </html>
  );
}

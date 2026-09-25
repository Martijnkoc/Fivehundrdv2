import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./wall.css";

export const metadata: Metadata = {
  title: "fivehundrd. the wall",
  appleWebApp: { capable: true, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Inter and Fraunces, self-hosted (BUILD_BRIEF §1.2); see scripts/prepare-reference.mjs */}
        <link rel="stylesheet" href="/fonts/fonts.css" precedence="default" />
        {children}
      </body>
    </html>
  );
}

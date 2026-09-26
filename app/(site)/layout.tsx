import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

/*
 * The reference's CSS, inlined byte for byte as in reference.html. It is not
 * imported through Next's CSS pipeline on purpose: Lightning CSS rewrites
 * values (rgba(13,13,13,.5) becomes #0d0d0d80, alpha 0.502) and reorders
 * declarations, which changes pixels.
 */
const css = (file: string) => readFile(path.join(process.cwd(), "app", "wall", file), "utf8");
const wallCss = css("wall.css");
/* Approved changes on top of the reference (see the file's header). */
const overridesCss = css("overrides.css");

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: await wallCss }} />
        <style dangerouslySetInnerHTML={{ __html: await overridesCss }} />
      </head>
      <body>
        {/* Inter and Fraunces, self-hosted (BUILD_BRIEF §1.2); see scripts/prepare-reference.mjs */}
        <link rel="stylesheet" href="/fonts/fonts.css" precedence="default" />
        {children}
      </body>
    </html>
  );
}

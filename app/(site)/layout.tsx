import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NAME, orgJsonLd, POSITIONING, SITE_URL, TAGLINE } from "../../lib/site/facts";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${NAME}. The Wall: 500 spots per lane, 72 hours each`, template: `%s · ${NAME}` },
  description: `${POSITIONING.replace("Fivehundrd is a", "A")} 500 spots per lane, 72 hours each.`,
  applicationName: NAME,
  category: "discovery",
  keywords: [
    "discover new music",
    "indie books",
    "indie games",
    "independent creators",
    "new podcasts",
    "newsletters",
    "promote your work",
    "showcase for makers",
    "no algorithm",
  ],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: NAME, title: `${NAME}. ${TAGLINE}`, description: POSITIONING, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: `${NAME}. ${TAGLINE}`, description: POSITIONING },
  robots: { index: true, follow: true },
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
        {/* who and what Fivehundrd is, for search and answer engines (lib/site/facts.ts) */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd()).replace(/</g, "\\u003c") }} />
        {children}
      </body>
    </html>
  );
}

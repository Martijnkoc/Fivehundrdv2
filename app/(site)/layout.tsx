import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { NAME, orgJsonLd, POSITIONING, SITE_URL, TAGLINE } from "../../lib/site/facts";
import { wallStyles } from "../wall/styles";

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

/* The latin faces the first screen is set in, fetched with the page instead of after the CSS, so the text doesn't reflow when they arrive. */
const FIRST_FONTS = ["inter-latin-wght-normal", "fraunces-latin-opsz-normal", "fraunces-latin-opsz-italic"];

export default async function RootLayout({ children }: { children: ReactNode }) {
  for (const f of FIRST_FONTS) preload(`/fonts/${f}.woff2`, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="en">
      <body>
        {/* the reference's CSS and the approved changes, one cacheable file (app/wall/styles.ts) */}
        <link rel="stylesheet" href={`/wall.css?v=${(await wallStyles()).version}`} precedence="default" />
        {/* Inter and Fraunces, self-hosted (BUILD_BRIEF §1.2); see scripts/prepare-reference.mjs */}
        <link rel="stylesheet" href="/fonts/fonts.css" precedence="default" />
        {/* who and what Fivehundrd is, for search and answer engines (lib/site/facts.ts) */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd()).replace(/</g, "\\u003c") }} />
        {children}
      </body>
    </html>
  );
}

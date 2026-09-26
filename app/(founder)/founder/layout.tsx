import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./founder.css";

export const metadata: Metadata = {
  title: { default: "Control Room · fivehundrd.", template: "%s · Control Room" },
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3f0" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
};

/* the chosen theme, before the first paint (a per-browser preference) */
const theme = `try{var t=localStorage.getItem("fh-cr-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * The Control Room's own root layout: its own styles, fonts and code. The
 * public site (app/(site)) never loads any of it, and it loads nothing of the wall.
 */
export default function FounderLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>
        <link rel="stylesheet" href="/fonts/fonts.css" precedence="default" />
        {children}
      </body>
    </html>
  );
}

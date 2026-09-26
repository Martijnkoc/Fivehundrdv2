import type { Metadata } from "next";

/*
 * Any address nothing answers, on the site or in the Control Room. The site
 * and /founder have their own root layouts, so this page brings its own
 * (small) styles instead of the wall's.
 */
export const metadata: Metadata = { title: "Not on fivehundrd." };

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f6f4ef", color: "#1a1917", font: "16px/1.5 Inter, system-ui, sans-serif" }}>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <main style={{ padding: 24, textAlign: "center", maxWidth: 420 }}>
          <p style={{ font: "600 22px Fraunces, Georgia, serif", margin: "0 0 12px" }}>
            Fivehundrd<span style={{ color: "#ff3d8b" }}>.</span>
          </p>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Nothing lives at this address.</h1>
          <p style={{ margin: "0 0 20px", color: "#5f5b53" }}>There are 500 spots on the wall right now.</p>
          <a href="/" style={{ display: "inline-block", padding: "12px 20px", borderRadius: 999, background: "#1a1917", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
            See the wall
          </a>
        </main>
      </body>
    </html>
  );
}

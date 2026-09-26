import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { BIND } from "../../lib/wall/model";
import { LANES } from "../../lib/site/facts";

/*
 * The link preview for the site itself (home, lanes, info pages); a story's
 * lasting link has its own (s/[lane]/[no]/[slug]/opengraph-image.tsx). Drawn
 * once at build time, in the wall's fonts and lane colours.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Fivehundrd. The Wall: music, books, games, creators, podcasts and newsletters, 72 hours each.";

const font = (f: string) => readFile(path.join(process.cwd(), "assets/og", f));

export default async function Image() {
  const [inter700, fraunces800, fraunces500i] = await Promise.all([
    font("inter-latin-700-normal.woff"),
    font("fraunces-latin-800-normal.woff"),
    font("fraunces-latin-500-italic.woff"),
  ]);
  const ink = "#1c1b18";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fbf9f4", padding: 72, color: ink }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 800, fontSize: 104, letterSpacing: -2 }}>
            Fivehundrd<span style={{ color: "#ff7bc3" }}>.</span>
          </div>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontStyle: "italic", fontWeight: 500, fontSize: 40 }}>Discover before the crowd.</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {LANES.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                alignItems: "flex-end",
                width: 160,
                height: 150,
                padding: 14,
                borderRadius: 12,
                border: `2px solid ${ink}`,
                background: BIND[l.id].c1,
                color: BIND[l.id].c3,
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: 22,
              }}
            >
              {l.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 700, fontSize: 30 }}>The Wall · 500 spots per lane · 72 hours each</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: inter700, weight: 700, style: "normal" },
        { name: "Fraunces", data: fraunces800, weight: 800, style: "normal" },
        { name: "Fraunces", data: fraunces500i, weight: 500, style: "italic" },
      ],
    },
  );
}

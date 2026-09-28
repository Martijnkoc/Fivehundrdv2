import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { Tier } from "../wall/scout";

/*
 * The shareable Scout Card as an image (the link preview, and what Instagram
 * or X show), drawn on the server: warm paper, printed ink, the tier's ink as
 * the outline. No glow, no trophies.
 */
export const OG_SIZE = { width: 1200, height: 630 };
const font = (f: string) => readFile(path.join(process.cwd(), "assets/og", f));
export const TIER_INK: Record<Tier | "none", string> = { gold: "#a4812f", silver: "#7a8086", bronze: "#9b5d3a", none: "#1c1b18" };

export async function scoutImage(o: { kicker?: string; title: string; lines: string[]; name: string; standing: string; tier: Tier | null }) {
  const [inter700, inter900, fraunces800, fraunces500i] = await Promise.all([
    font("inter-latin-700-normal.woff"),
    font("inter-latin-900-normal.woff"),
    font("fraunces-latin-800-normal.woff"),
    font("fraunces-latin-500-italic.woff"),
  ]);
  const ink = "#1c1b18";
  const edge = TIER_INK[o.tier ?? "none"];
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fbf9f4", fontFamily: "Inter", color: ink }}>
      <div
        style={{
          width: 1040,
          height: 500,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "44px 56px",
          background: "#f3e9d6",
          border: `4px solid ${edge}`,
          boxShadow: `10px 10px 0 ${edge}`,
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 800, fontSize: 34 }}>
            Fivehundrd<span style={{ color: "#ff7bc3" }}>.</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 4, textTransform: "uppercase", color: edge }}>Scout</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {o.kicker && <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase" }}>{o.kicker}</div>}
          <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: -4, lineHeight: 1 }}>{o.title}</div>
          {o.lines.map((l) => (
            <div key={l} style={{ fontFamily: "Fraunces", fontStyle: "italic", fontWeight: 500, fontSize: 32, color: "#5d564a" }}>
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26, fontWeight: 700 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 900 }}>{o.name}</span>
            <span style={{ color: edge }}>{o.standing}</span>
          </div>
          <span style={{ color: "#5d564a" }}>Discover before the crowd.</span>
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Inter", data: inter700, weight: 700, style: "normal" },
        { name: "Inter", data: inter900, weight: 900, style: "normal" },
        { name: "Fraunces", data: fraunces800, weight: 800, style: "normal" },
        { name: "Fraunces", data: fraunces500i, weight: 500, style: "italic" },
      ],
    },
  );
}

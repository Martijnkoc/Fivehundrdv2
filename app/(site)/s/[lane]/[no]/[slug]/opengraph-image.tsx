import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { storyBySlug } from "../../../../../../lib/server/story";
import { genArt } from "../../../../../../lib/wall/art";
import { mediaURL } from "../../../../../../lib/wall/live";
import { BIND, LANE, pad } from "../../../../../../lib/wall/model";
import { PAL } from "../../../../../../lib/wall/demo";

/*
 * The link preview (what X, WhatsApp, iMessage and Slack show for a pasted
 * link). Link previews are fetched by the platforms' servers, which can't
 * run the wall, so this one card is drawn on the server: the Wide share card
 * (app/wall/shareCard.tsx), from the same story data, lane colours, pattern
 * and fonts, laid out the same way.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A spot on the Fivehundrd wall";

const font = (f: string) => readFile(path.join(process.cwd(), "assets/og", f));

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await storyBySlug(slug);
  const [inter700, inter900, fraunces800, fraunces500i] = await Promise.all([
    font("inter-latin-700-normal.woff"),
    font("inter-latin-900-normal.woff"),
    font("fraunces-latin-800-normal.woff"),
    font("fraunces-latin-500-italic.woff"),
  ]);
  const fonts = [
    { name: "Inter", data: inter700, weight: 700 as const, style: "normal" as const },
    { name: "Inter", data: inter900, weight: 900 as const, style: "normal" as const },
    { name: "Fraunces", data: fraunces800, weight: 800 as const, style: "normal" as const },
    { name: "Fraunces", data: fraunces500i, weight: 500 as const, style: "italic" as const },
  ];
  const ink = "#1c1b18";
  const brand = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 800, fontSize: 46, color: ink, letterSpacing: -0.5 }}>
        Fivehundrd<span style={{ color: "#ff7bc3" }}>.</span>
      </div>
      <div style={{ fontFamily: "Fraunces", fontStyle: "italic", fontWeight: 500, fontSize: 24, color: "#5d564a" }}>Discover before the crowd.</div>
    </div>
  );
  if (!s)
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fbf9f4" }}>{brand}</div>,
      { ...size, fonts },
    );

  const lane = BIND[s.lane] ?? BIND.writers;
  const art = mediaURL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", "art", s.artwork ?? s.logo) ?? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(genArt(s.seed, PAL[s.pal] ?? PAL[0]));
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "fivehundrd.com";
  const tileW = 300;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 60, padding: "0 70px 0 80px", background: "#fbf9f4", fontFamily: "Inter", color: ink }}>
      {/* the wall tile: artwork, number, name strip in the lane's colour */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: tileW,
          flex: "none",
          transform: "rotate(-1.6deg)",
          background: "#f3e9d6",
          border: "3px solid #ddd1b9",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 36px 44px -26px rgba(28,27,24,.45)",
        }}
      >
        <div style={{ display: "flex", position: "relative", width: tileW - 6, height: tileW - 6, background: lane.c1 }}>
          <img src={art} width={tileW - 6} height={tileW - 6} style={{ objectFit: "cover" }} alt="" />
          <div style={{ position: "absolute", right: 14, top: 14, background: "#fbf7ee", color: ink, fontWeight: 900, fontSize: 24, padding: "3px 10px", borderRadius: 7 }}>
            {pad(s.no)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "16px 20px 20px", borderTop: `8px solid ${lane.c1}` }}>
          <div style={{ fontWeight: 900, fontSize: 32, letterSpacing: -1.2, lineHeight: 1.05, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{s.name}</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: "#5d564a" }}>{LANE[s.lane]}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1, minWidth: 0 }}>
        {brand}
        <div style={{ display: "flex" }}>
          <div style={{ background: ink, color: "#fbf7ee", fontWeight: 900, fontSize: 22, borderRadius: 999, padding: "8px 18px" }}>
            {`No. ${pad(s.no)} of 500 · ${LANE[s.lane]}`}
          </div>
        </div>
        <div style={{ fontWeight: 900, fontSize: s.name.length > 18 ? 64 : 84, letterSpacing: -3.5, lineHeight: 0.95 }}>{s.name}</div>
        {s.snippet && (
          <div style={{ fontFamily: "Fraunces", fontStyle: "italic", fontWeight: 500, fontSize: 30, lineHeight: 1.25, color: "#3d3830", maxHeight: 76, overflow: "hidden" }}>
            {s.snippet}
          </div>
        )}
        <div style={{ display: "flex" }}>
          <div style={{ background: "#d8ff45", fontWeight: 900, fontSize: 22, borderRadius: 999, padding: "8px 18px" }}>{`${host}/s/${s.lane}/${s.no}/${s.slug}`}</div>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DEVICES, KINDS, KIND_LABEL, LANE_IDS, LANE_LABEL, RANGES, RANGE_LABEL, withParams } from "../../../../lib/founder/filters";
import { useGo } from "./Shell";

const SOURCES = ["direct", "instagram", "tiktok", "x", "facebook", "threads", "youtube", "google", "reddit", "whatsapp", "email", "linkedin", "producthunt"];

type Which = "range" | "lane" | "kind" | "visitor" | "source" | "device" | "country";

/**
 * The global filters, one row above everything: range, then the slices. They
 * live in the address; changing one reloads the page's numbers on the server
 * while the current view stays on screen, dimmed.
 */
export function Filters({ label, show = ["range", "lane", "kind", "visitor", "source", "device", "country"] }: { label: string; show?: Which[] }) {
  const sp = useSearchParams();
  const path = usePathname();
  const go = useGo();
  const cur = Object.fromEntries(sp.entries());
  const set = (changes: Record<string, string | null>) => go(withParams(cur, changes, path));
  const range = cur.range ?? "today";
  const [from, setFrom] = useState(cur.from ?? "");
  const [to, setTo] = useState(cur.to ?? "");
  const [country, setCountry] = useState(cur.country ?? "");
  const any = ["lane", "kind", "visitor", "source", "device", "country"].some((k) => cur[k]);

  const sel = (key: string, opts: [string, string][], all: string) => (
    <label className={`fsel${cur[key] ? " on" : ""}`}>
      <span className="sr">{all}</span>
      <select value={cur[key] ?? ""} onChange={(e) => set({ [key]: e.target.value || null })}>
        <option value="">{all}</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
        {cur[key] && !opts.some(([v]) => v === cur[key]) && <option value={cur[key]}>{cur[key]}</option>}
      </select>
    </label>
  );

  return (
    <div className="filters" role="toolbar" aria-label="Filters">
      {show.includes("range") && (
        <div className="seg" role="group" aria-label="Period">
          {RANGES.filter((r) => r !== "custom").map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => set({ range: r === "today" ? null : r })}>
              {RANGE_LABEL[r]}
            </button>
          ))}
          <button type="button" aria-pressed={range === "custom"} onClick={() => set({ range: "custom", from: from || new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10), to: to || new Date().toISOString().slice(0, 10) })}>
            Custom
          </button>
        </div>
      )}
      {show.includes("range") && range === "custom" && (
        <form
          className="custom-range"
          onSubmit={(e) => {
            e.preventDefault();
            set({ range: "custom", from, to });
          }}
        >
          <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">–</span>
          <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="chip-btn" type="submit">
            Apply
          </button>
        </form>
      )}
      {show.includes("lane") && sel("lane", LANE_IDS.map((l) => [l, LANE_LABEL[l]]), "All lanes")}
      {show.includes("kind") && sel("kind", KINDS.map((k) => [k, KIND_LABEL[k]]), "All spot types")}
      {show.includes("visitor") && sel("visitor", [["new", "New visitors"], ["returning", "Returning visitors"]], "New & returning")}
      {show.includes("source") && sel("source", SOURCES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]), "All sources")}
      {show.includes("device") && sel("device", DEVICES.map((d) => [d, d[0].toUpperCase() + d.slice(1)]), "All devices")}
      {show.includes("country") && (
        <form
          className={`fsel text${cur.country ? " on" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            const c = country.trim().toUpperCase();
            set({ country: /^[A-Z]{2}$/.test(c) ? c : null });
          }}
        >
          <label>
            <span className="sr">Country (two letters)</span>
            <input value={country} maxLength={2} placeholder="Country" onChange={(e) => setCountry(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
          </label>
        </form>
      )}
      {any && (
        <button className="clear" type="button" onClick={() => (setCountry(""), set({ lane: null, kind: null, visitor: null, source: null, device: null, country: null }))}>
          Clear filters
        </button>
      )}
      <span className="period">{label}</span>
    </div>
  );
}

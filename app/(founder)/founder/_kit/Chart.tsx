"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, longLabel, tickLabel, type Fmt } from "../../../../lib/founder/format";
import { useGo } from "./Shell";


export type Series = {
  name: string;
  values: (number | null)[];
  /** categorical slot 1–6 (fixed per entity), or "prev" for the previous period */
  slot?: number | "prev";
};

type Props = {
  labels: string[];
  bucket: "hour" | "day";
  series: Series[];
  format?: Fmt;
  height?: number;
  /** stack the series as areas (parts of a whole) */
  stacked?: boolean;
  /** a soft fill under a single line */
  area?: boolean;
  /** where clicking a point leads (drill-down), per point */
  hrefs?: (string | null)[];
  hint?: string;
  /** previous-period labels, shown in the tooltip beside the "prev" series */
  prevLabels?: string[];
  /** the last point is still filling up (today, this hour): drawn dashed */
  partial?: boolean;
};

const color = (s: Series) => (s.slot === "prev" ? "var(--ink3)" : `var(--s${s.slot ?? 1})`);

function niceMax(m: number) {
  if (m <= 0) return 4;
  const raw = m / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw)!;
  return step * 4;
}

/**
 * Lines and stacked areas over time, drawn in SVG: 2px lines, hairline grid,
 * one axis, a crosshair with every series' value on hover, a table view, and
 * (when given) click-through to the slice behind a point.
 */
export function LineChart({ labels, bucket, series, format = "int", height = 220, stacked, area, hrefs, hint, prevLabels, partial }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const go = useGo();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const main = series.filter((s) => s.slot !== "prev");
  const sums = useMemo(() => labels.map((_, i) => main.reduce((a, s) => a + (s.values[i] ?? 0), 0)), [labels, main]);
  const max = niceMax(Math.max(0, ...(stacked ? sums : series.flatMap((s) => s.values.map((v) => v ?? 0)))));
  const left = format === "money" ? 52 : 40,
    right = 10,
    top = 8,
    bottom = 24;
  const iw = w - left - right,
    ih = height - top - bottom;
  const x = (i: number) => left + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => top + ih - (v / max) * ih;
  const ticksY = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
  const ticksX = labels.map((_, i) => i).filter((i) => i % every === 0);
  const clickable = !!hrefs?.some(Boolean);

  const path = (vals: (number | null)[], base?: number[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) return (pen = false);
      const yy = y(v + (base?.[i] ?? 0));
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${yy.toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  /* stacked areas: each series sits on the ones before it */
  const layers = useMemo(() => {
    if (!stacked) return [];
    const base = labels.map(() => 0);
    return main.map((s) => {
      const lo = [...base];
      s.values.forEach((v, i) => (base[i] += v ?? 0));
      return { s, lo, hi: [...base] };
    });
  }, [stacked, labels, main]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px / r.width) * (n - 1)))));
  };

  if (!n) return null;
  const tipLeft = hover != null ? x(hover) : 0;
  const flip = tipLeft > w * 0.6;

  return (
    <div className="chart-wrap">
      <div className="card-h" style={{ marginBottom: 6 }}>
        <div className="legend">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.name}>
                <i className={`sw ${s.slot === "prev" ? "line dash" : stacked ? "" : "line"}`} style={{ background: color(s), borderColor: color(s) }} />
                {s.name}
              </span>
            ))}
        </div>
        <div className="tools">
          <button className="chip-btn tbl-toggle" type="button" aria-pressed={table} onClick={() => setTable(!table)}>
            {table ? "Chart" : "Table"}
          </button>
        </div>
      </div>
      {table ? (
        <DataGrid labels={labels} bucket={bucket} series={series} format={format} prevLabels={prevLabels} />
      ) : (
        <div ref={box} className={`chart${clickable ? " clickable" : ""}`} style={{ height }}>
          <svg width={w} height={height} role="img" aria-label={`${series.map((s) => s.name).join(", ")} over time`}>
            {ticksY.map((t, k) => (
              <g key={k}>
                <line className={k ? "grid-line" : "base-line"} x1={left} x2={w - right} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
                <text className="tick" x={left - 8} y={y(t) + 4} textAnchor="end">
                  {fmt(format, t, true)}
                </text>
              </g>
            ))}
            {ticksX.map((i) => (
              <text key={i} className="tick" x={x(i)} y={height - 6} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}>
                {tickLabel(labels[i], bucket)}
              </text>
            ))}
            {stacked
              ? layers.map(({ s, lo, hi }) => (
                  <path
                    key={s.name}
                    d={`${path(hi)}L${x(n - 1)},${y(lo[n - 1])}${lo
                      .map((v, i) => `L${x(n - 1 - i)},${y(lo[n - 1 - i])}`)
                      .join("")}Z`}
                    fill={color(s)}
                    fillOpacity={0.88}
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                ))
              : series.map((s) => (
                  <g key={s.name}>
                    {area && s.slot !== "prev" && (
                      <path d={`${path(s.values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={color(s)} fillOpacity={0.09} />
                    )}
                    <path
                      d={path(partial && s.slot !== "prev" && n > 1 ? [...s.values.slice(0, -1), null] : s.values)}
                      fill="none"
                      stroke={color(s)}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray={s.slot === "prev" ? "4 4" : undefined}
                    />
                    {partial && s.slot !== "prev" && n > 1 && s.values[n - 1] != null && s.values[n - 2] != null && (
                      <path d={`M${x(n - 2)},${y(s.values[n - 2]!)}L${x(n - 1)},${y(s.values[n - 1]!)}`} stroke={color(s)} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
                    )}
                  </g>
                ))}
            {hover != null && (
              <g pointerEvents="none">
                <line className="cross" x1={x(hover)} x2={x(hover)} y1={top} y2={top + ih} />
                {(stacked ? layers.map((l) => ({ s: l.s, v: l.hi[hover] })) : series.map((s) => ({ s, v: s.values[hover] }))).map(
                  ({ s, v }) => v != null && <circle key={s.name} className="dot" cx={x(hover)} cy={y(v)} r={4} fill={color(s)} />,
                )}
              </g>
            )}
            <rect
              className="hit"
              x={left}
              y={top}
              width={iw}
              height={ih}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onClick={() => hover != null && hrefs?.[hover] && go(hrefs[hover]!)}
            />
          </svg>
          {hover != null && (
            <div className="tip" style={{ top: 4, [flip ? "right" : "left"]: flip ? w - tipLeft + 12 : tipLeft + 12 } as React.CSSProperties}>
              <div className="tt">
                {longLabel(labels[hover], bucket)}
                {partial && hover === n - 1 ? " (so far)" : ""}
              </div>
              {series.map((s) => (
                <div className="tr" key={s.name}>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <i className={`sw ${s.slot === "prev" ? "line dash" : ""}`} style={{ background: color(s), borderColor: color(s) }} />
                    {s.slot === "prev" && prevLabels?.[hover] ? `${s.name} (${longLabel(prevLabels[hover], bucket)})` : s.name}
                  </span>
                  <b>{fmt(format, s.values[hover])}</b>
                </div>
              ))}
              {stacked && main.length > 1 && (
                <div className="tr">
                  <span>Total</span>
                  <b>{fmt(format, sums[hover])}</b>
                </div>
              )}
              {hrefs?.[hover] && <div className="hint">{hint ?? "Click to see what happened"}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataGrid({ labels, bucket, series, format, prevLabels }: { labels: string[]; bucket: "hour" | "day"; series: Series[]; format: Fmt; prevLabels?: string[] }) {
  return (
    <div className="dt-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
      <table className="dt">
        <thead>
          <tr>
            <th>{bucket === "hour" ? "Hour" : "Day"}</th>
            {series.map((s) => (
              <th key={s.name} className="num">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}>
              <td>{longLabel(l, bucket)}</td>
              {series.map((s) => (
                <td key={s.name} className="num" title={s.slot === "prev" && prevLabels?.[i] ? longLabel(prevLabels[i], bucket) : undefined}>
                  {fmt(format, s.values[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


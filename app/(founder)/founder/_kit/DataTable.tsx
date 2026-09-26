"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LANE_LABEL } from "../../../../lib/founder/filters";
import { fmt } from "../../../../lib/founder/format";

export type Col = {
  key: string;
  label: string;
  type?: "text" | "int" | "dec" | "money" | "pct" | "date" | "datetime" | "lane" | "status" | "mono";
  /** a link for the cell, with {field} placeholders, e.g. /founder/spots/{id} */
  href?: string;
  /** the value comes from other fields: ratio of two numbers */
  ratio?: [string, string];
};

const SLOT: Record<string, number> = { music: 1, art: 2, writers: 3, podcasts: 4, games: 5, letters: 6 };
type Row = Record<string, unknown>;

const valueOf = (r: Row, c: Col): unknown => {
  if (c.ratio) {
    const a = Number(r[c.ratio[0]]),
      b = Number(r[c.ratio[1]]);
    return b > 0 ? a / b : null;
  }
  return r[c.key];
};
const numeric = (c: Col) => ["int", "dec", "money", "pct"].includes(c.type ?? "");

function show(v: unknown, c: Col) {
  if (v == null || v === "") return <span className="muted">—</span>;
  switch (c.type) {
    case "int":
      return fmt("int", Number(v));
    case "dec":
      return Number(v).toFixed(2);
    case "money":
      return fmt("money", Number(v));
    case "pct":
      return fmt("pct", Number(v));
    case "date":
      return new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    case "datetime":
      return new Date(String(v)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    case "lane":
      return (
        <span className="lane-tag">
          <i className="sw" style={{ background: `var(--s${SLOT[String(v)] ?? 1})` }} />
          {LANE_LABEL[String(v)] ?? String(v)}
        </span>
      );
    case "status":
      return <span className={`status ${String(v)}`}>{String(v)}</span>;
    case "mono":
      return <span className="mono">{String(v)}</span>;
    default:
      return Array.isArray(v) ? v.map((x) => LANE_LABEL[x] ?? x).join(", ") : String(v);
  }
}

/**
 * Exact rows behind a chart: sort by any column, search, filter by a column's
 * values, and page through. Rows link on to the object they describe.
 */
export function DataTable({
  rows,
  cols,
  sort: initial,
  search = [],
  facet,
  pageSize = 25,
  empty = "No rows for this view.",
}: {
  rows: Row[];
  cols: Col[];
  sort?: string;
  search?: string[];
  facet?: string;
  pageSize?: number;
  empty?: string;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: initial ?? "", desc: true });
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("");
  const [n, setN] = useState(pageSize);
  const facets = useMemo(() => (facet ? [...new Set(rows.map((r) => String(r[facet] ?? "")))].filter(Boolean).sort() : []), [rows, facet]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter(
      (r) => (!needle || search.some((k) => String(r[k] ?? "").toLowerCase().includes(needle))) && (!only || String(r[facet!] ?? "") === only),
    );
    const c = cols.find((x) => x.key === sort.key);
    if (c) {
      out = [...out].sort((a, b) => {
        const x = valueOf(a, c),
          y = valueOf(b, c);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort.desc ? -d : d;
      });
    }
    return out;
  }, [rows, cols, sort, q, only, search, facet]);

  /** the row's link, or none when a field it needs is missing */
  const link = (tpl: string, r: Row) => {
    let ok = true;
    const out = tpl.replace(/\{(\w+)\}/g, (_, k) => {
      if (r[k] == null || r[k] === "") ok = false;
      return encodeURIComponent(String(r[k] ?? ""));
    });
    return ok ? out : null;
  };

  return (
    <div>
      {(search.length > 0 || facets.length > 1) && (
        <div className="dt-tools">
          {search.length > 0 && (
            <input className="dt-search" type="search" placeholder="Search…" aria-label="Search the table" value={q} onChange={(e) => (setQ(e.target.value), setN(pageSize))} />
          )}
          {facets.length > 1 && (
            <div className="seg" role="group" aria-label={`Filter by ${facet}`}>
              <button type="button" aria-pressed={!only} onClick={() => setOnly("")}>
                All
              </button>
              {facets.map((f) => (
                <button key={f} type="button" aria-pressed={only === f} onClick={() => setOnly(f)}>
                  {LANE_LABEL[f] ?? f.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          )}
          <span className="note" style={{ marginLeft: "auto" }}>
            {shown.length.toLocaleString("en-US")} {shown.length === 1 ? "row" : "rows"}
          </span>
        </div>
      )}
      {shown.length ? (
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={numeric(c) ? "num" : undefined} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                    <button type="button" onClick={() => setSort({ key: c.key, desc: sort.key === c.key ? !sort.desc : numeric(c) })}>
                      {c.label}
                      {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, n).map((r, i) => (
                <tr key={String(r.id ?? i)}>
                  {cols.map((c) => {
                    const v = show(valueOf(r, c), c);
                    const href = c.href ? link(c.href, r) : null;
                    return (
                      <td key={c.key} className={numeric(c) ? "num" : undefined}>
                        {href ? <Link href={href}>{v}</Link> : v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{q || only ? "Nothing matches that search." : empty}</div>
      )}
      {shown.length > n && (
        <div className="dt-more">
          <button className="chip-btn" type="button" onClick={() => setN(n + pageSize * 2)}>
            Show more ({(shown.length - n).toLocaleString("en-US")} left)
          </button>
        </div>
      )}
    </div>
  );
}

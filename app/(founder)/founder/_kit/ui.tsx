import Link from "next/link";
import type { ReactNode } from "react";
import type { Alert } from "../../../../lib/founder/alerts";
import { LANE_LABEL } from "../../../../lib/founder/filters";
import { change, fmt, type Fmt } from "../../../../lib/founder/format";
import { Icons } from "./icons";

/* Server-rendered pieces of the Control Room: cards, KPIs, bars, funnels, heatmaps, alerts, empty states. */

export const LANE_SLOT: Record<string, number> = { music: 1, art: 2, writers: 3, podcasts: 4, games: 5, letters: 6 };

export function LaneTag({ lane }: { lane: string }) {
  return (
    <span className="lane-tag">
      <i className="sw" style={{ background: `var(--s${LANE_SLOT[lane] ?? 1})` }} />
      {LANE_LABEL[lane] ?? lane}
    </span>
  );
}

export function Card({ title, desc, tools, children, className = "" }: { title?: ReactNode; desc?: ReactNode; tools?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || tools) && (
        <div className="card-h">
          <div>
            {title && <h3>{title}</h3>}
            {desc && <p>{desc}</p>}
          </div>
          {tools && <div className="tools">{tools}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, desc, actions }: { title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="cr-head">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/**
 * A headline number: the value, its change against the previous period
 * (green when that's good news), the previous value, and a sparkline.
 */
export function Kpi({
  label,
  value,
  prev,
  format = "int",
  kind = "count",
  spark,
  href,
  lowerIsBetter,
  sub,
  slot = 1,
}: {
  label: string;
  value: number | null;
  prev?: number | null;
  format?: Fmt;
  kind?: "count" | "rate" | "money";
  spark?: number[];
  href?: string;
  lowerIsBetter?: boolean;
  sub?: ReactNode;
  slot?: number;
}) {
  const c = change(value, prev, kind);
  const dir = !c || Math.abs(c.value) < 0.0005 ? "flat" : (c.value > 0) !== !!lowerIsBetter ? "up" : "down";
  const body = (
    <>
      <span className="k-label">
        <span>{label}</span>
        {spark ? <Spark values={spark} slot={slot} w={72} h={22} /> : href && <span className="go">{Icons.arrow}</span>}
      </span>
      <span className="k-value">{fmt(format, value)}</span>
      {c ? (
        <span className={`delta ${dir}`}>
          {c.value > 0 ? "▲" : c.value < 0 ? "▼" : "•"} {c.label}
        </span>
      ) : (
        <span className="delta flat">{prev === undefined ? "\u00a0" : "no earlier period"}</span>
      )}
      <span className="k-sub">{sub ?? (prev != null ? `was ${fmt(format, prev)}` : "\u00a0")}</span>
    </>
  );
  return href ? (
    <Link className="card kpi" href={href}>
      {body}
    </Link>
  ) : (
    <div className="card kpi">{body}</div>
  );
}

export type BarItem = { key: string; label: ReactNode; value: number; sub?: ReactNode; href?: string; slot?: number };
/** Horizontal bars for comparing categories: label, value, and a thin bar. */
export function Bars({ items, format = "int", max }: { items: BarItem[]; format?: Fmt; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((i) => {
        const inner = (
          <>
            <span className="bl">
              <span>{i.label}</span>
            </span>
            <span className="bv">
              {fmt(format, i.value)}
              {i.sub != null && <small>{i.sub}</small>}
            </span>
            <span className="track">
              <span className="fill" style={{ display: "block", width: `${Math.max(0.5, (i.value / m) * 100)}%`, background: `var(--s${i.slot ?? 1})` }} />
            </span>
          </>
        );
        return i.href ? (
          <Link key={i.key} className="bar-row" href={i.href}>
            {inner}
          </Link>
        ) : (
          <div key={i.key} className="bar-row">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export type Step = { label: string; value: number; href?: string; note?: string; /** compare with this step instead of the previous one */ of?: number };
/** A funnel: each step's count, its share of the previous step and of the first. */
export function Funnel({ steps, mini }: { steps: Step[]; mini?: boolean }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className={`funnel${mini ? " mini" : ""}`}>
      {steps.map((s, i) => {
        const base = s.of != null ? steps[s.of] : i ? steps[i - 1] : null;
        const prev = base ? base.value : null;
        const inner = (
          <>
            <span className="fl">{s.label}</span>
            <span className="fb" aria-hidden="true">
              <i style={{ width: `${Math.max(0.4, (s.value / top) * 100)}%` }} />
            </span>
            <span className="fv">
              <b>{fmt("int", s.value)}</b>
              <small>{i === 0 ? (s.note ?? "") : prev ? `${fmt("pct", s.value / prev)} of ${s.of != null ? base!.label.toLowerCase() : "previous"}` : "—"}</small>
            </span>
          </>
        );
        return s.href ? (
          <Link key={s.label} className="fstep" href={s.href}>
            {inner}
          </Link>
        ) : (
          <div key={s.label} className="fstep">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** Explains why a view is empty instead of drawing a broken chart. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Alerts({ alerts, empty = "Nothing needs attention. Traffic, payments, events and errors are within their usual range." }: { alerts: Alert[]; empty?: string }) {
  if (!alerts.length)
    return (
      <div className="all-clear">
        {Icons.check}
        <span>{empty}</span>
      </div>
    );
  return (
    <div className="alerts">
      {alerts.map((a) => (
        <Link key={a.id} className={`alert ${a.level}`} href={a.href}>
          {a.level === "notice" ? Icons.info : Icons.alert}
          <span>
            <b>{a.title}</b>
            <p>{a.detail}</p>
          </span>
          <span className="lvl">{a.level}</span>
        </Link>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export type Health = "ok" | "warn" | "bad" | "none";
export function State({ s, label }: { s: Health; label?: string }) {
  return (
    <span className={`state ${s}`}>
      {s === "ok" ? Icons.check : s === "none" ? Icons.info : Icons.alert}
      {label ?? (s === "ok" ? "Healthy" : s === "warn" ? "Degraded" : s === "bad" ? "Failing" : "No data")}
    </span>
  );
}
export function HealthCell({ label, s, value, sub }: { label: string; s: Health; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="hcell">
      <div className="hl">
        <span>{label}</span>
        <State s={s} />
      </div>
      <div className="hv">{value}</div>
      {sub && <div className="hs">{sub}</div>}
    </div>
  );
}

/** Retention cohorts: one row per first-visit week, cells shaded by the share that came back. */
export function Heatmap({ rows }: { rows: { week: string; size: number; d1: number; d7: number; d30: number; weeks: number[] | null }[] }) {
  const cell = (n: number | null, size: number, key: string) => {
    if (n == null) return <td key={key} className="na">·</td>;
    const r = size ? n / size : 0;
    return (
      <td key={key} className="c" title={`${n} of ${size}`} style={{ background: `color-mix(in oklab, var(--s1) ${Math.round(Math.min(1, r / 0.5) * 70) + 4}%, var(--surface))` }}>
        {fmt("pct", r)}
      </td>
    );
  };
  const fmtWeek = (w: string) => new Date(w + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const ageDays = (w: string) => (Date.now() - Date.parse(w)) / 864e5;
  return (
    <div className="dt-wrap" style={{ margin: 0 }}>
      <table className="heat">
        <thead>
          <tr>
            <th>First visit, week of</th>
            <th>People</th>
            <th>Day 1</th>
            <th>Day 7</th>
            <th>Day 30</th>
            {Array.from({ length: 8 }, (_, k) => (
              <th key={k}>Wk {k + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.week}>
              <td>{fmtWeek(r.week)}</td>
              <td className="size">{fmt("int", r.size)}</td>
              {cell(ageDays(r.week) > 2 ? r.d1 : null, r.size, "d1")}
              {cell(ageDays(r.week) > 8 ? r.d7 : null, r.size, "d7")}
              {cell(ageDays(r.week) > 31 ? r.d30 : null, r.size, "d30")}
              {Array.from({ length: 8 }, (_, k) => cell(r.weeks?.[k] ?? null, r.size, "w" + k))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A tiny trend line for KPI cards (no axes; the card carries the numbers). */
export function Spark({ values, slot = 1, w = 96, h = 30 }: { values: number[]; slot?: number; w?: number; h?: number }): ReactNode {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${((i * (w - 4)) / (values.length - 1) + 2).toFixed(1)},${(h - 3 - ((v - min) / (max - min || 1)) * (h - 6)).toFixed(1)}`);
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={`var(--s${slot})`} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

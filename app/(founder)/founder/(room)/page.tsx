import type { Metadata } from "next";
import { evaluate } from "../../../../lib/founder/alerts";
import { alertInputs, feed, kpis, live, series, TZ } from "../../../../lib/founder/data";
import { dayOf, dayStart } from "../../../../lib/founder/filters";
import { change, int, money, pct, rate } from "../../../../lib/founder/format";
import { LineChart } from "../_kit/Chart";
import { LiveFeed } from "../_kit/LiveFeed";
import { NoData, room, type Params } from "../_kit/page";
import { Alerts, Card } from "../_kit/ui";

export const metadata: Metadata = { title: "Pulse" };

/**
 * Pulse: the opening screen. Today in a handful of sentences, the last 24
 * hours by hour, who's here right now, and anything that needs attention.
 */
export default async function Pulse({ searchParams }: { searchParams: Promise<Params> }) {
  const { ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const now = Date.now();
  const start = dayStart(dayOf(now, TZ), TZ);
  const iso = (t: number) => new Date(t).toISOString();
  const [today, yday, day, items, l, inputs] = await Promise.all([
    kpis(iso(start), iso(now), "{}"),
    kpis(iso(start - 864e5), iso(now - 864e5), "{}"),
    series(iso(Math.floor(now / 3600e3) * 3600e3 - 23 * 3600e3), iso(now), "hour", "{}"),
    feed(iso(now - 3 * 3600e3), 40),
    live(),
    alertInputs(),
  ]);
  const alerts = evaluate(inputs);
  const returned = rate(today.visitors - today.newVisitors, today.visitors);
  const vs = (a: number, b: number) => {
    const c = change(a, b);
    return c ? `${c.label} vs yesterday by now` : "";
  };
  const lines: { value: string; label: string; sub: string; href: string }[] = [
    { value: int(today.visitors), label: today.visitors === 1 ? "person here today" : "people here today", sub: vs(today.visitors, yday.visitors), href: "/founder/growth" },
    {
      value: pct(returned, 0),
      label: "returned",
      sub: `${int(today.visitors - today.newVisitors)} came back · ${int(today.newVisitors)} new`,
      href: "/founder/retention",
    },
    { value: int(today.opens), label: "discoveries opened", sub: vs(today.opens, yday.opens), href: "/founder/wall?metric=opens" },
    { value: int(today.saves), label: "saved", sub: vs(today.saves, yday.saves), href: "/founder/wall?metric=saves" },
    { value: int(today.shares), label: "shared", sub: vs(today.shares, yday.shares), href: "/founder/shares" },
    { value: int(today.createStarts), label: today.createStarts === 1 ? "creator started" : "creators started", sub: vs(today.createStarts, yday.createStarts), href: "/founder/creators" },
    {
      value: int(today.paid),
      label: `${today.paid === 1 ? "spot" : "spots"} purchased — ${money(today.gross)}`,
      sub: vs(today.gross, yday.gross),
      href: "/founder/revenue",
    },
  ];
  const date = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });

  return (
    <div className="cr-body">
      <div className="pulse-hero">
        <h1>
          Pulse <em>· today</em>
        </h1>
        <span className="when">
          {date} · {TZ}
        </span>
      </div>
      <div className="pulse-lines">
        {lines.map((x) => (
          <a key={x.label} href={x.href}>
            <b>{x.value}</b>
            <span>{x.label}</span>
            <small>{x.sub}</small>
          </a>
        ))}
      </div>
      <div className="grid g-21 section">
        <Card title="The last 24 hours" desc="People and discoveries opened, by hour">
          <LineChart
            labels={day.map((d) => d.t)}
            bucket="hour"
            series={[
              { name: "People", values: day.map((d) => d.visitors), slot: 1 },
              { name: "Opens", values: day.map((d) => d.opens), slot: 2 },
            ]}
            height={330}
            partial
          />
        </Card>
        <Card title="Live now">
          <LiveFeed initial={items} live={l} limit={11} />
        </Card>
      </div>
      <div className="section">
        <h2>Needs attention</h2>
        <Alerts alerts={alerts} />
      </div>
    </div>
  );
}

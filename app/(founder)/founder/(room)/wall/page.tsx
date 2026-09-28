import type { Metadata } from "next";
import { kpisFor, lanes, series, seriesFor, spots } from "../../../../../lib/founder/data";
import { LANE_IDS, LANE_LABEL } from "../../../../../lib/founder/filters";
import { pct, rate } from "../../../../../lib/founder/format";
import type { Point } from "../../../../../lib/founder/types";
import { LineChart } from "../../_kit/Chart";
import { DataTable } from "../../_kit/DataTable";
import { Filters } from "../../_kit/Filters";
import { dayRange, NoData, room, type Params } from "../../_kit/page";
import { Bars, Card, Empty, Kpi, LANE_SLOT, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Wall" };

const METRICS = { opens: "Opens", saves: "Saves", shares: "Shares", clicks: "Link clicks", impressions: "Impressions" } as const;
type Metric = keyof typeof METRICS;

/**
 * Is the wall working? Lanes, and which spots people open, save and share.
 * The drill-down: pick a metric, click a day, see the spots behind it, open one.
 */
export default async function Wall({ searchParams }: { searchParams: Promise<Params> }) {
  const { p, v, to, partial, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const metric: Metric = (Object.keys(METRICS) as Metric[]).includes(p.metric as Metric) ? (p.metric as Metric) : "opens";
  const byLane = !v.f.lane;
  /* a search (a creator, a name, a code) looks across all time */
  const q = typeof p.q === "string" ? p.q.slice(0, 100) : "";
  const [{ now: k, prev }, s, l, rows, laneSeries] = await Promise.all([
    kpisFor(v),
    seriesFor(v),
    lanes(v),
    spots(v, metric, q, 1000),
    byLane
      ? Promise.all(LANE_IDS.map((id) => series(v.period.from, v.period.to, v.period.bucket, JSON.stringify({ ...v.f, lane: id }))))
      : Promise.resolve(null as Point[][] | null),
  ]);
  const b = v.period.bucket;
  const day = p.range === "custom" && p.from === p.to && p.from ? String(p.from) : null;
  const laneRows = l.filter((x) => !v.f.lane || x.lane === v.f.lane).sort((a, b) => LANE_IDS.indexOf(a.lane as never) - LANE_IDS.indexOf(b.lane as never));
  const laneValue = (x: (typeof l)[number]) => (metric === "clicks" ? 0 : metric === "impressions" ? x.impressions : x[metric]);

  return (
    <div className="cr-body">
      <PageHead title="Wall" desc="Which lanes fill up, and which spots people open, save and share." />
      <Filters label={v.period.label} />
      <div className="grid g-6">
        <Kpi label="Live spots" value={k.liveSpots} prev={prev?.liveSpots} sub={`${pct(k.liveSpots / (v.f.lane ? 500 : 3000))} of ${v.f.lane ? "the lane" : "3,000"} filled`} />
        <Kpi label="Impressions" value={k.impressions} prev={prev?.impressions} spark={s.map((x) => x.impressions)} sub={`${k.viewers.toLocaleString("en-US")} people saw a tile`} />
        <Kpi label="Opens" value={k.opens} prev={prev?.opens} spark={s.map((x) => x.opens)} slot={2} />
        <Kpi label="Open rate" value={rate(k.opens, k.impressions)} prev={prev ? rate(prev.opens, prev.impressions) : undefined} format="pct" kind="rate" sub="opens per tile seen" />
        <Kpi label="Save rate" value={rate(k.saves, k.opens)} prev={prev ? rate(prev.saves, prev.opens) : undefined} format="pct" kind="rate" sub="saves per open" />
        <Kpi label="Outbound CTR" value={rate(k.clicks, k.opens)} prev={prev ? rate(prev.clicks, prev.opens) : undefined} format="pct" kind="rate" sub="link clicks per open" />
      </div>

      <div className="section">
        <Card
          title={`${METRICS[metric]} over time`}
          desc={day ? `Showing ${day}. The table below lists the spots behind it.` : "Click a day to see which spots caused it."}
          tools={
            <div className="seg" role="group" aria-label="Metric">
              {(Object.keys(METRICS) as Metric[]).map((m) => (
                <a key={m} href={to("/founder/wall", { metric: m })} aria-current={m === metric ? "true" : undefined}>
                  {METRICS[m]}
                </a>
              ))}
            </div>
          }
        >
          <LineChart
            labels={s.map((x) => x.t)}
            bucket={b}
            area
            partial={partial}
            series={[{ name: METRICS[metric], values: s.map((x) => x[metric]), slot: 1 }]}
            hrefs={b === "day" ? s.map((x) => to("/founder/wall", { ...dayRange(x.t), metric })) : undefined}
            hint="Click to see which spots caused it"
            height={240}
          />
        </Card>
      </div>

      <div className="grid g-2 section">
        <Card title="Lane fill" desc="Live spots of 500 per lane, right now">
          <div className="stack" style={{ gap: 12 }}>
            {laneRows.map((x) => (
              <a key={x.lane} href={to("/founder/wall", { lane: x.lane })} style={{ display: "grid", gap: 6 }}>
                <span style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span className="lane-tag">
                    <i className="sw" style={{ background: `var(--s${LANE_SLOT[x.lane]})` }} />
                    {x.label}
                  </span>
                  <span>
                    <b>{x.live.toLocaleString("en-US")}</b> <span className="muted">/ 500 · {pct(x.live / 500)}</span>
                  </span>
                </span>
                <span className="meter">
                  <i style={{ width: `${(x.live / 500) * 100}%`, background: `var(--s${LANE_SLOT[x.lane]})` }} />
                </span>
              </a>
            ))}
          </div>
        </Card>
        <Card title={`${METRICS[metric]} by lane`} desc={metric === "clicks" ? "Link clicks per lane are in the table below." : "In this period. Click a lane to filter everything by it."}>
          {metric === "clicks" ? (
            <Empty title="Not broken down by lane.">Sort the spots table by link clicks to see where people leave for the maker's site.</Empty>
          ) : (
            <Bars
              items={[...laneRows]
                .sort((a, b) => laneValue(b) - laneValue(a))
                .map((x) => ({
                  key: x.lane,
                  label: x.label,
                  value: laneValue(x),
                  sub: metric === "saves" ? `${pct(rate(x.saves, x.opens))} of opens` : metric === "opens" ? `${pct(rate(x.opens, x.impressions))} open rate` : undefined,
                  slot: LANE_SLOT[x.lane],
                  href: to("/founder/wall", { lane: x.lane }),
                }))}
            />
          )}
        </Card>
      </div>

      {laneSeries && (
        <div className="section">
          <Card title="Lane contribution" desc={`${METRICS[metric]} per lane, stacked`}>
            <LineChart
              labels={s.map((x) => x.t)}
              bucket={b}
              stacked
              series={LANE_IDS.map((id, i) => ({ name: LANE_LABEL[id], values: laneSeries[i].map((x) => x[metric]), slot: LANE_SLOT[id] }))}
              height={240}
            />
          </Card>
        </div>
      )}

      <div className="section">
        <Card title={q ? `Spots matching “${q}”` : day ? `Spots on ${day}` : "Spots"} desc={`Every spot that was live in this period, by ${METRICS[metric].toLowerCase()}. Open one for its full story.`}>
          <DataTable
            rows={rows}
            sort={metric}
            search={["name", "creator", "slug"]}
            facet="status"
            cols={[
              { key: "no", label: "No.", type: "int", href: "/founder/spots/{id}" },
              { key: "name", label: "Spot", href: "/founder/spots/{id}" },
              { key: "lane", label: "Lane", type: "lane" },
              { key: "status", label: "Status", type: "status" },
              { key: "impressions", label: "Impr.", type: "int" },
              { key: "opens", label: "Opens", type: "int" },
              { key: "openRate", label: "Open rate", type: "pct", ratio: ["opens", "impressions"] },
              { key: "saves", label: "Saves", type: "int" },
              { key: "saveRate", label: "Save rate", type: "pct", ratio: ["saves", "opens"] },
              { key: "shares", label: "Shares", type: "int" },
              { key: "clicks", label: "Clicks", type: "int" },
              { key: "ctr", label: "CTR", type: "pct", ratio: ["clicks", "opens"] },
              { key: "shareVisits", label: "Share visits", type: "int" },
              { key: "creator", label: "Creator" },
            ]}
            empty="No spots were live in this period."
          />
        </Card>
      </div>
    </div>
  );
}

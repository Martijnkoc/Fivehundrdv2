import type { Metadata } from "next";
import { kpisFor, seriesFor, spots } from "../../../../../lib/founder/data";
import { rate } from "../../../../../lib/founder/format";
import { LineChart } from "../../_kit/Chart";
import { DataTable } from "../../_kit/DataTable";
import { Filters } from "../../_kit/Filters";
import { dayRange, NoData, room, type Params } from "../../_kit/page";
import { Bars, Card, Empty, Kpi, LANE_SLOT, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Shares" };

/** Is the flywheel turning? Shares, the visits they bring back, and the spots people pass on. */
export default async function Shares({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, to, partial, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, s, rows] = await Promise.all([kpisFor(v), seriesFor(v), spots(v, "shares", "", 500)]);
  const shared = rows.filter((r) => r.shares > 0 || r.shareVisits > 0);
  const b = v.period.bucket;
  return (
    <div className="cr-body">
      <PageHead title="Shares" desc="Every share is a chance at a new visitor. This is how often it pays off." />
      <Filters label={v.period.label} />
      <div className="grid g-6">
        <Kpi label="Shares" value={k.shares} prev={prev?.shares} spark={s.map((x) => x.shares)} slot={5} />
        <Kpi label="Share rate" value={rate(k.shares, k.opens)} prev={prev ? rate(prev.shares, prev.opens) : undefined} format="pct" kind="rate" sub="shares per open" />
        <Kpi label="People sharing" value={k.sharers} prev={prev?.sharers} />
        <Kpi label="Visits from shared links" value={k.fromShares} prev={prev?.fromShares} spark={s.map((x) => x.fromShares)} slot={3} />
        <Kpi label="Visits per share" value={k.shares ? k.fromShares / k.shares : null} prev={prev && prev.shares ? prev.fromShares / prev.shares : undefined} format="dec" sub="how far a share travels" />
        <Kpi label="Link entries" value={k.entries} prev={prev?.entries} sub="spot opened straight from its link" />
      </div>
      <div className="grid g-21 section">
        <Card title="Shares and the visits they bring" desc="Click a day to see which spots were shared">
          <LineChart
            labels={s.map((x) => x.t)}
            bucket={b}
            partial={partial}
            series={[
              { name: "Shares", values: s.map((x) => x.shares), slot: 5 },
              { name: "Visits from shared links", values: s.map((x) => x.fromShares), slot: 3 },
            ]}
            hrefs={b === "day" ? s.map((x) => to("/founder/shares", dayRange(x.t))) : undefined}
            height={260}
          />
        </Card>
        <Card title="Most shared" desc="Spots by shares in this period">
          {shared.length ? (
            <Bars items={shared.slice(0, 8).map((r) => ({ key: r.id, label: `No. ${r.no} · ${r.name}`, value: r.shares, sub: `${r.shareVisits} visits back`, slot: LANE_SLOT[r.lane], href: `/founder/spots/${r.id}` }))} />
          ) : (
            <Empty title="Nothing shared in this period.">Shares are counted when someone uses Share on a spot (the card or the link).</Empty>
          )}
        </Card>
      </div>
      <div className="section">
        <Card title="Share performance by spot" desc="Shares, and visits that arrived through each spot's lasting link">
          <DataTable
            rows={shared}
            sort="shares"
            search={["name", "creator"]}
            facet="lane"
            cols={[
              { key: "no", label: "No.", type: "int", href: "/founder/spots/{id}" },
              { key: "name", label: "Spot", href: "/founder/spots/{id}" },
              { key: "lane", label: "Lane", type: "lane" },
              { key: "opens", label: "Opens", type: "int" },
              { key: "shares", label: "Shares", type: "int" },
              { key: "shareRate", label: "Share rate", type: "pct", ratio: ["shares", "opens"] },
              { key: "shareVisits", label: "Visits back", type: "int" },
              { key: "perShare", label: "Visits / share", type: "dec", ratio: ["shareVisits", "shares"] },
              { key: "creator", label: "Creator" },
            ]}
            empty="Nothing shared in this period."
          />
        </Card>
      </div>
    </div>
  );
}

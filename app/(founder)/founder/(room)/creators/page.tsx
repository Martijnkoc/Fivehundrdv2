import type { Metadata } from "next";
import { createFunnel, creators, kpisFor, seriesFor } from "../../../../../lib/founder/data";
import { pct, rate } from "../../../../../lib/founder/format";
import { LineChart } from "../../_kit/Chart";
import { DataTable } from "../../_kit/DataTable";
import { Filters } from "../../_kit/Filters";
import { dayRange, NoData, room, type Params } from "../../_kit/page";
import { Bars, Card, Empty, Funnel, Kpi, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Creators" };

/* the phone Create flow's steps (app/wall/Claim.tsx, STEPS), 1-based */
const STEP = ["", "Lane", "Artwork", "Name", "Description", "Links", "Preview"];

/** Are creators posting? Who, how often, and where the Create flow loses people. */
export default async function Creators({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, to, partial, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, s, rows, fun] = await Promise.all([kpisFor(v), seriesFor(v), creators(v), createFunnel(v.period)]);
  const inPeriod = rows.filter((r) => r.spotsInPeriod > 0);
  const repeat = inPeriod.filter((r) => r.spots > 1).length;
  const b = v.period.bucket;
  return (
    <div className="cr-body">
      <PageHead title="Creators" desc="Who puts work on the wall, how often they come back, and where Create loses people." />
      <Filters label={v.period.label} show={["range", "lane", "kind"]} />
      <div className="grid g-6">
        <Kpi label="Creators" value={k.creators} prev={prev?.creators} sub="posted a paid spot" />
        <Kpi label="New creators" value={k.newCreators} prev={prev?.newCreators} sub="first spot ever" />
        <Kpi label="Repeat rate" value={rate(repeat, inPeriod.length)} format="pct" kind="rate" sub={`${repeat} of ${inPeriod.length} have posted before`} />
        <Kpi label="Started Create" value={k.createStarts} prev={prev?.createStarts} spark={s.map((x) => x.createStarts)} slot={4} />
        <Kpi label="Create → checkout" value={rate(k.checkouts, k.createStarts)} prev={prev ? rate(prev.checkouts, prev.createStarts) : undefined} format="pct" kind="rate" sub={`${k.checkouts.toLocaleString("en-US")} checkouts started`} />
        <Kpi label="Checkout → paid" value={rate(k.paid, k.checkouts)} prev={prev ? rate(prev.paid, prev.checkouts) : undefined} format="pct" kind="rate" sub={`${k.paid.toLocaleString("en-US")} spots bought`} href={to("/founder/revenue")} />
      </div>
      <div className="grid g-2 section">
        <Card title="Create funnel" desc="People who opened Create, and how far they got. Steps are the phone flow; desktop goes straight to checkout.">
          {fun.started ? (
            <Funnel
              steps={[
                { label: "Opened Create", value: fun.started, note: "people" },
                ...fun.steps.filter((x) => x.step >= 2).map((x) => ({ label: STEP[x.step] ?? `Step ${x.step}`, value: x.visitors })),
                { label: "Checkout", value: fun.checkouts, href: to("/founder/revenue") },
                { label: "Paid", value: fun.paid, href: to("/founder/revenue") },
              ]}
            />
          ) : (
            <Empty title="Nobody opened Create in this period.">Create is counted from the moment someone taps Create or an open spot on the live wall.</Empty>
          )}
        </Card>
        <Card title="Spots bought over time" desc="Click a day for its transactions">
          <LineChart
            labels={s.map((x) => x.t)}
            bucket={b}
            partial={partial}
            series={[
              { name: "Started Create", values: s.map((x) => x.createStarts), slot: 4 },
              { name: "Checkouts", values: s.map((x) => x.checkouts), slot: 2 },
              { name: "Paid", values: s.map((x) => x.paid), slot: 3 },
            ]}
            hrefs={b === "day" ? s.map((x) => to("/founder/revenue", dayRange(x.t))) : undefined}
            height={260}
          />
        </Card>
      </div>
      <div className="grid g-12 section">
        <Card title="Top creators" desc="By revenue in this period">
          {inPeriod.length ? (
            <Bars
              format="money"
              items={inPeriod.slice(0, 8).map((r) => ({ key: r.creator, label: r.creator, value: r.revenue, sub: `${r.spotsInPeriod} ${r.spotsInPeriod === 1 ? "spot" : "spots"}`, slot: 3 }))}
            />
          ) : (
            <Empty title="No paid spots in this period." />
          )}
        </Card>
        <Card title="All creators" desc={`${inPeriod.length.toLocaleString("en-US")} posted in this period · ${pct(rate(repeat, inPeriod.length))} have posted more than once`}>
          <DataTable
            rows={inPeriod.map((r) => ({ ...r, id: r.creator }))}
            sort="revenue"
            search={["creator"]}
            cols={[
              { key: "creator", label: "Creator", href: "/founder/wall?range=all&q={creator}" },
              { key: "spotsInPeriod", label: "Spots (period)", type: "int" },
              { key: "spots", label: "Spots (ever)", type: "int" },
              { key: "revenue", label: "Revenue", type: "money" },
              { key: "opens", label: "Opens", type: "int" },
              { key: "saves", label: "Saves", type: "int" },
              { key: "lanes", label: "Lanes" },
              { key: "lastAt", label: "Last spot", type: "date" },
            ]}
            empty="No creators posted in this period."
          />
        </Card>
      </div>
    </div>
  );
}

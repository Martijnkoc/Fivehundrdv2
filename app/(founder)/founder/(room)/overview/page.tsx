import type { Metadata } from "next";
import { evaluate } from "../../../../../lib/founder/alerts";
import { alertInputs, kpisFor, prevSeriesFor, seriesFor } from "../../../../../lib/founder/data";
import { rate } from "../../../../../lib/founder/format";
import { LineChart } from "../../_kit/Chart";
import { Filters } from "../../_kit/Filters";
import { dayRange, NoData, room, type Params } from "../../_kit/page";
import { Alerts, Card, Funnel, Kpi, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Overview" };

/** The executive view: six numbers that answer the six questions, the trend, the funnel, and what needs attention. */
export default async function Overview({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, to, partial, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, s, ps, inputs] = await Promise.all([kpisFor(v), seriesFor(v), prevSeriesFor(v), alertInputs()]);
  const alerts = evaluate(inputs);
  const b = v.period.bucket;
  const saveRate = (x: { saves: number; opens: number }) => rate(x.saves, x.opens);
  const ret = (x: { returned7: number; cohort: number }) => rate(x.returned7, x.cohort);

  return (
    <div className="cr-body">
      <PageHead title="Overview" desc="Are we growing, discovering, returning, posting, earning, and healthy?" />
      <Filters label={v.period.label} />
      <div className="grid g-6">
        <Kpi label="Unique visitors" value={k.visitors} prev={prev?.visitors} spark={s.map((x) => x.visitors)} href={to("/founder/growth")} />
        <Kpi label="Spot opens" value={k.opens} prev={prev?.opens} spark={s.map((x) => x.opens)} href={to("/founder/wall", { metric: "opens" })} />
        <Kpi
          label="Save rate"
          value={saveRate(k)}
          prev={prev ? saveRate(prev) : undefined}
          format="pct"
          kind="rate"
          spark={s.map((x) => (x.opens ? x.saves / x.opens : 0))}
          sub={`${k.saves.toLocaleString("en-US")} saves of ${k.opens.toLocaleString("en-US")} opens`}
          href={to("/founder/wall", { metric: "saves" })}
        />
        <Kpi
          label="7-day return rate"
          value={ret(k)}
          prev={prev ? ret(prev) : undefined}
          format="pct"
          kind="rate"
          sub={k.cohort ? `${k.returned7.toLocaleString("en-US")} of ${k.cohort.toLocaleString("en-US")} came back within a week` : "Needs a week of visitors"}
          href={to("/founder/retention")}
        />
        <Kpi label="Live spots" value={k.liveSpots} prev={prev?.liveSpots} sub={`of 3,000 · ${((k.liveSpots / 3000) * 100).toFixed(0)}% of the wall`} href={to("/founder/wall")} />
        <Kpi
          label="Revenue"
          value={k.gross - k.refunds}
          prev={prev ? prev.gross - prev.refunds : undefined}
          format="money"
          kind="money"
          spark={s.map((x) => x.gross)}
          sub={`${k.paid.toLocaleString("en-US")} spots, after refunds`}
          href={to("/founder/revenue")}
        />
      </div>

      <div className="grid g-21 section">
        <Card title="Visitors" desc={ps ? "Unique visitors, against the previous period (dashed). Click a day to drill in." : "Unique visitors. Click a day to drill in."}>
          <LineChart
            labels={s.map((x) => x.t)}
            prevLabels={ps?.map((x) => x.t)}
            bucket={b}
            area
            partial={partial}
            series={[
              { name: "Visitors", values: s.map((x) => x.visitors), slot: 1 },
              ...(ps ? [{ name: "Previous period", values: s.map((_, i) => ps[i]?.visitors ?? null), slot: "prev" as const }] : []),
            ]}
            hrefs={b === "day" ? s.map((x) => to("/founder/wall", { ...dayRange(x.t), metric: "opens" })) : undefined}
            hint="Click to see which spots people opened that day"
            height={280}
          />
        </Card>
        <Card title="Needs attention" desc="Last 24 hours against the week before">
          <Alerts alerts={alerts} />
        </Card>
      </div>

      <div className="grid g-2 section">
        <Card title="From visit to live spot" desc="Distinct people at each step in this period. Click a step for its section.">
          <Funnel
            steps={[
              { label: "Visit", value: k.visitors, href: to("/founder/growth"), note: "people" },
              { label: "Spot open", value: k.openers, href: to("/founder/wall", { metric: "opens" }) },
              { label: "Save", value: k.savers, href: to("/founder/wall", { metric: "saves" }) },
              { label: "Share", value: k.sharers, href: to("/founder/shares") },
              { label: "Create", value: k.createStarts, href: to("/founder/creators") },
              { label: "Checkout", value: k.checkouts, href: to("/founder/revenue") },
              { label: "Live", value: k.paid, href: to("/founder/revenue") },
            ]}
          />
        </Card>
        <Card title="Revenue" desc="Gross sales per day, before refunds and fees">
          <LineChart
            labels={s.map((x) => x.t)}
            bucket={b}
            format="money"
            area
            partial={partial}
            series={[{ name: "Gross", values: s.map((x) => x.gross), slot: 3 }]}
            hrefs={b === "day" ? s.map((x) => to("/founder/revenue", dayRange(x.t))) : undefined}
            hint="Click to see that day's transactions"
            height={250}
          />
        </Card>
      </div>
    </div>
  );
}

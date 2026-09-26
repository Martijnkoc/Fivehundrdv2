import type { Metadata } from "next";
import { cohorts, kpisFor } from "../../../../../lib/founder/data";
import { rate } from "../../../../../lib/founder/format";
import { LineChart } from "../../_kit/Chart";
import { Filters } from "../../_kit/Filters";
import { NoData, room, type Params } from "../../_kit/page";
import { Card, Empty, Heatmap, Kpi, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Retention" };

/** Do people come back? Weekly cohorts by first visit, and the return rates that matter. */
export default async function Retention({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, rows] = await Promise.all([kpisFor(v), cohorts(12)]);
  /* averages only over cohorts old enough to have had the chance */
  const age = (w: string) => (Date.now() - Date.parse(w)) / 864e5;
  const avg = (key: "d1" | "d7" | "d30", days: number) => {
    const ok = rows.filter((r) => age(r.week) > days + 7);
    const size = ok.reduce((a, r) => a + r.size, 0);
    return size ? ok.reduce((a, r) => a + r[key], 0) / size : null;
  };
  const trend = rows.filter((r) => age(r.week) > 14);
  return (
    <div className="cr-body">
      <PageHead title="Retention" desc="Of the people who found Fivehundrd in a week, how many came back, and when." />
      <Filters label={v.period.label} show={["range", "source", "device", "country"]} />
      <div className="grid g-6">
        <Kpi label="Day 1 return" value={avg("d1", 1)} format="pct" kind="rate" sub="came back the next day" />
        <Kpi label="Day 7 return" value={avg("d7", 7)} format="pct" kind="rate" sub="came back within a week" />
        <Kpi label="Day 30 return" value={avg("d30", 30)} format="pct" kind="rate" sub="came back within a month" />
        <Kpi
          label="7-day return rate"
          value={rate(k.returned7, k.cohort)}
          prev={prev ? rate(prev.returned7, prev.cohort) : undefined}
          format="pct"
          kind="rate"
          sub={`first seen 7–14 days before the period's end (${k.cohort.toLocaleString("en-US")} people)`}
        />
        <Kpi label="Returning visitors" value={k.visitors - k.newVisitors} prev={prev ? prev.visitors - prev.newVisitors : undefined} sub={`${Math.round((100 * (k.visitors - k.newVisitors)) / Math.max(1, k.visitors))}% of this period's visitors`} />
        <Kpi label="Saves per saver" value={k.savers ? k.saves / k.savers : null} format="dec" sub="saving is the reason to return" />
      </div>
      <div className="section">
        <Card title="Weekly cohorts" desc="Each row is the people first seen that week (Monday to Sunday); cells show the share active again. Empty cells haven't happened yet. Cohorts use all visitors, not the filters above.">
          {rows.length ? <Heatmap rows={rows} /> : <Empty title="No cohorts yet.">Cohorts appear once visits are being recorded; day 7 needs a week, day 30 a month.</Empty>}
        </Card>
      </div>
      <div className="section">
        <Card title="Day 7 return by cohort" desc="Is each new week's crowd stickier than the last?">
          {trend.length > 1 ? (
            <LineChart
              labels={trend.map((r) => r.week + "T00:00")}
              bucket="day"
              format="pct"
              series={[
                { name: "Day 7", values: trend.map((r) => (r.size ? r.d7 / r.size : null)), slot: 1 },
                { name: "Day 1", values: trend.map((r) => (r.size ? r.d1 / r.size : null)), slot: 2 },
              ]}
              height={220}
            />
          ) : (
            <Empty title="Not enough weeks yet.">This line needs at least two cohorts older than two weeks.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { kpisFor, prevSeriesFor, seriesFor } from "../../../../../lib/founder/data";
import { LineChart } from "../../_kit/Chart";
import { DataTable } from "../../_kit/DataTable";
import { Filters } from "../../_kit/Filters";
import { dayRange, NoData, room, type Params } from "../../_kit/page";
import { Card, Kpi, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Growth" };

/** Are we growing? People, new against returning, accounts and new creators. */
export default async function Growth({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, to, partial, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, s, ps] = await Promise.all([kpisFor(v), seriesFor(v), prevSeriesFor(v)]);
  const b = v.period.bucket;
  const drill = b === "day" ? s.map((x) => to("/founder/wall", { ...dayRange(x.t), metric: "opens" })) : undefined;
  return (
    <div className="cr-body">
      <PageHead title="Growth" desc="How many people find Fivehundrd, and how many of them are new." />
      <Filters label={v.period.label} />
      <div className="grid g-6">
        <Kpi label="Unique visitors" value={k.visitors} prev={prev?.visitors} spark={s.map((x) => x.visitors)} />
        <Kpi label="New visitors" value={k.newVisitors} prev={prev?.newVisitors} spark={s.map((x) => x.newVisitors)} slot={2} />
        <Kpi label="Returning visitors" value={k.visitors - k.newVisitors} prev={prev ? prev.visitors - prev.newVisitors : undefined} spark={s.map((x) => x.visitors - x.newVisitors)} slot={3} href={to("/founder/retention")} />
        <Kpi label="Visits" value={k.visits} prev={prev?.visits} spark={s.map((x) => x.visits)} sub={`${(k.visits / Math.max(1, k.visitors)).toFixed(2)} visits per person`} />
        <Kpi label="Accounts created" value={k.accounts} prev={prev?.accounts} sub="Keep my card sign-ins" />
        <Kpi label="New creators" value={k.newCreators} prev={prev?.newCreators} sub={`${k.creators.toLocaleString("en-US")} creators posted`} href={to("/founder/creators")} />
      </div>
      <div className="grid g-2 section">
        <Card title="New and returning" desc="Unique visitors, stacked: first seen in this bucket, or seen before. Click a day to drill in.">
          <LineChart
            labels={s.map((x) => x.t)}
            bucket={b}
            stacked
            series={[
              { name: "Returning", values: s.map((x) => x.visitors - x.newVisitors), slot: 3 },
              { name: "New", values: s.map((x) => x.newVisitors), slot: 2 },
            ]}
            hrefs={drill}
            height={260}
          />
        </Card>
        <Card title="Visitors against the previous period" desc="The dashed line is the same stretch just before this one.">
          <LineChart
            labels={s.map((x) => x.t)}
            prevLabels={ps?.map((x) => x.t)}
            bucket={b}
            partial={partial}
            series={[
              { name: "Visitors", values: s.map((x) => x.visitors), slot: 1 },
              ...(ps ? [{ name: "Previous period", values: s.map((_, i) => ps[i]?.visitors ?? null), slot: "prev" as const }] : []),
            ]}
            hrefs={drill}
            height={260}
          />
        </Card>
      </div>
      <div className="section">
        <Card title="Creators joining" desc="People starting Create and spots bought, per bucket">
          <LineChart
            labels={s.map((x) => x.t)}
            bucket={b}
            partial={partial}
            series={[
              { name: "Started Create", values: s.map((x) => x.createStarts), slot: 4 },
              { name: "Spots bought", values: s.map((x) => x.paid), slot: 3 },
            ]}
            hrefs={b === "day" ? s.map((x) => to("/founder/revenue", dayRange(x.t))) : undefined}
            height={220}
          />
        </Card>
      </div>
      <div className="section">
        <Card title="By day" desc="The numbers behind the charts">
          <DataTable
            rows={s.map((x) => ({ ...x, id: x.t, returning: x.visitors - x.newVisitors, day: x.t.replace("T", " ").replace(" 00:00", "") }))}
            cols={[
              { key: "day", label: b === "hour" ? "Hour" : "Day", type: "mono" },
              { key: "visitors", label: "Visitors", type: "int" },
              { key: "newVisitors", label: "New", type: "int" },
              { key: "returning", label: "Returning", type: "int" },
              { key: "visits", label: "Visits", type: "int" },
              { key: "opens", label: "Opens", type: "int" },
              { key: "saves", label: "Saves", type: "int" },
              { key: "paid", label: "Spots bought", type: "int" },
            ]}
            sort="day"
            pageSize={15}
          />
        </Card>
      </div>
    </div>
  );
}

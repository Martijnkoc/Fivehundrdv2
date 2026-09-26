import type { Metadata } from "next";
import { breakdown, kpisFor, series, seriesFor } from "../../../../../lib/founder/data";
import { pct, rate } from "../../../../../lib/founder/format";
import { sourceName } from "../../../../../lib/founder/feedText";
import { LineChart } from "../../_kit/Chart";
import { DataTable } from "../../_kit/DataTable";
import { Filters } from "../../_kit/Filters";
import { NoData, room, type Params } from "../../_kit/page";
import { Bars, Card, Empty, Kpi, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Acquisition" };

/** Where people come from: sources, devices, countries and landing pages. Click one to filter everything by it. */
export default async function Acquisition({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, to, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, s, src, dev, ctry, land] = await Promise.all([
    kpisFor(v),
    seriesFor(v),
    breakdown(v, "source"),
    breakdown(v, "device"),
    breakdown(v, "country"),
    breakdown(v, "landing"),
  ]);
  /* the five biggest sources over time, the rest as Other (never a 7th colour) */
  const top = v.f.source ? [] : src.slice(0, 5).map((x) => x.key);
  const perSource = await Promise.all(top.map((key) => series(v.period.from, v.period.to, v.period.bucket, JSON.stringify({ ...v.f, source: key }))));
  const other = s.map((x, i) => Math.max(0, x.visitors - perSource.reduce((a, ps) => a + (ps[i]?.visitors ?? 0), 0)));
  const mobile = dev.find((d) => d.key === "mobile");
  const shared = land.find((d) => d.key === "Shared spot link");
  const bar = (rows: typeof src, dim: string, label = (k: string) => k) =>
    rows.slice(0, 10).map((x) => ({
      key: x.key,
      label: label(x.key),
      value: x.visitors,
      sub: `${(x.opens / Math.max(1, x.visitors)).toFixed(2)} opens each`,
      href: ["source", "device", "country"].includes(dim) && !x.key.startsWith("(") ? to("/founder/acquisition", { [dim]: x.key }) : undefined,
    }));

  return (
    <div className="cr-body">
      <PageHead title="Acquisition" desc="Where people come from and what they do once they're here. Click a source, device or country to filter every page by it." />
      <Filters label={v.period.label} show={["range", "visitor", "source", "device", "country"]} />
      <div className="grid g-6">
        <Kpi label="Visitors" value={k.visitors} prev={prev?.visitors} spark={s.map((x) => x.visitors)} />
        <Kpi label="Top source" value={src[0] ? src[0].visitors : null} sub={src[0] ? `${sourceName(src[0].key)} · ${pct(rate(src[0].visitors, k.visitors))} of visitors` : "No visits yet"} />
        <Kpi label="On mobile" value={rate(mobile?.visitors ?? 0, k.visitors)} format="pct" kind="rate" sub={`${(mobile?.visitors ?? 0).toLocaleString("en-US")} people`} />
        <Kpi label="Countries" value={ctry.filter((c) => c.key !== "(unknown)").length} sub={ctry[0] ? `most from ${ctry[0].key}` : ""} />
        <Kpi label="Via shared links" value={shared?.visits ?? 0} prev={prev?.fromShares} sub="visits that landed on a spot's link" href={to("/founder/shares")} />
        <Kpi label="Opens per visitor" value={k.visitors ? k.opens / k.visitors : null} format="dec" sub={`${k.opens.toLocaleString("en-US")} opens`} />
      </div>

      {top.length > 0 && (
        <div className="section">
          <Card title="Sources over time" desc="Unique visitors by source, stacked; everything outside the top five is Other">
            <LineChart
              labels={s.map((x) => x.t)}
              bucket={v.period.bucket}
              stacked
              series={[
                ...top.map((key, i) => ({ name: sourceName(key), values: perSource[i].map((x) => x.visitors), slot: i + 1 })),
                { name: "Other", values: other, slot: 6 },
              ]}
              height={260}
            />
          </Card>
        </div>
      )}

      <div className="grid g-2 section">
        <Card title="Sources" desc="Referring site or utm_source, by visitors">
          {src.length ? <Bars items={bar(src, "source", sourceName)} /> : <Empty title="No visits in this period." />}
        </Card>
        <Card title="Countries" desc="From the platform's geo header; country only">
          {ctry.length ? <Bars items={bar(ctry, "country")} /> : <Empty title="No visits in this period." />}
        </Card>
        <Card title="Devices">{dev.length ? <Bars items={bar(dev, "device", (k) => k[0].toUpperCase() + k.slice(1))} /> : <Empty title="No visits in this period." />}</Card>
        <Card title="Landing" desc="Where visits start: the wall, or a spot's shared link">{land.length ? <Bars items={bar(land, "landing")} /> : <Empty title="No visits in this period." />}</Card>
      </div>

      <div className="section">
        <Card title="All sources">
          <DataTable
            rows={src.map((x) => ({ ...x, id: x.key, name: sourceName(x.key) }))}
            sort="visitors"
            search={["name"]}
            cols={[
              { key: "name", label: "Source" },
              { key: "visitors", label: "Visitors", type: "int" },
              { key: "visits", label: "Visits", type: "int" },
              { key: "new_visits", label: "New visits", type: "int" },
              { key: "opens", label: "Opens", type: "int" },
              { key: "opr", label: "Opens / visitor", type: "dec", ratio: ["opens", "visitors"] },
            ]}
            empty="No visits in this period."
          />
        </Card>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { cohorts, kpisFor, loop } from "../../../../../lib/founder/data";
import { fmt, rate } from "../../../../../lib/founder/format";
import type { Loop } from "../../../../../lib/founder/types";
import { LineChart } from "../../_kit/Chart";
import { Filters } from "../../_kit/Filters";
import { NoData, room, type Params } from "../../_kit/page";
import { Card, Empty, Heatmap, Kpi, PageHead, Stat } from "../../_kit/ui";

export const metadata: Metadata = { title: "Retention" };

/** Do people come back? Weekly cohorts by first visit, and the return rates that matter. */
export default async function Retention({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, rows, l] = await Promise.all([kpisFor(v), cohorts(12), loop(v.period)]);
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
      <LoopCards l={l} />
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

const pct = (v: number | null) => fmt("pct", v);
const vs = (a: number | null, b: number | null) => (a == null || b == null ? "not enough data yet" : `${pct(a)} against ${pct(b)}`);

/**
 * The retention loop (docs/retention.md), one product question per number:
 * Discover → Keep → Leave → something changes → Return → see what changed.
 */
function LoopCards({ l }: { l: Loop }) {
  const s = l.since,
    t = l.taps,
    r = l.returns;
  return (
    <div className="section">
      <Card
        title="The retention loop"
        desc="Each number answers one question about why people come back. Found Early and the since line are private to each visitor; nothing here is shown on the wall. (Call it was replaced by Scout on 2026-09-28; its numbers are no longer shown.)"
      >
        <div className="stats">
          <Stat
            label="Does the since line deepen a visit?"
            value={s.opensShown == null ? "—" : `${fmt("dec", s.opensShown)} opens`}
            sub={`in 30 min after it showed; ${s.opensHoldout == null ? "control: no data yet" : `control ${fmt("dec", s.opensHoldout)}`}`}
          />
          <Stat label="Does it bring people back?" value={pct(s.backShown)} sub={`back within 7 days; ${vs(s.backShown, s.backHoldout)} for the 10% control`} />
          <Stat label="Do people act on it?" value={pct(rate(s.taps, s.shown))} sub={`${fmt("int", s.taps)} taps on ${fmt("int", s.shown)} returning visits`} />
          <Stat
            label="Do Hotspots lead to keeps?"
            value={pct(rate(t.hotKept, t.hot))}
            sub={`saved or shared after a Hotspot tap (${fmt("int", t.hot)}); the wall: ${pct(rate(t.wallKept, t.wallOpens))} of opens`}
          />
          <Stat label="Does Newest?" value={pct(rate(t.newKept, t.new))} sub={`saved or shared after a Newest tap (${fmt("int", t.new)})`} />
          <Stat label="Is Found Early rare and real?" value={pct(rate(l.early.early, l.early.saves))} sub={`of ${fmt("int", l.early.saves)} saves on stories that ended in the period`} />
          <Stat
            label="Do people with Finds return more?"
            value={vs(rate(r.savedBack, r.saved), rate(r.notSavedBack, r.notSaved))}
            sub={`7-day return, saved on day one or not (${fmt("int", r.visitors)} new visitors); a correlation, not proof`}
          />
        </div>
      </Card>
    </div>
  );
}

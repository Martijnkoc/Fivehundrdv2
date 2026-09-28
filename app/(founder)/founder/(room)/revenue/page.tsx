import type { Metadata } from "next";
import { kpisFor, lanes, prevSeriesFor, seriesFor, transactions } from "../../../../../lib/founder/data";
import { money, pct, rate } from "../../../../../lib/founder/format";
import { LineChart } from "../../_kit/Chart";
import { DataTable } from "../../_kit/DataTable";
import { ExportButton } from "../../_kit/ExportButton";
import { Filters } from "../../_kit/Filters";
import { dayRange, NoData, room, type Params } from "../../_kit/page";
import { Bars, Card, Kpi, LANE_SLOT, PageHead, Stat } from "../../_kit/ui";

export const metadata: Metadata = { title: "Revenue" };

/**
 * The CFO's page: gross to net, per unit, per lane, over time, and every
 * transaction with its Stripe ids so the numbers reconcile.
 */
export default async function Revenue({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, to, partial, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const [{ now: k, prev }, s, ps, l, tx] = await Promise.all([kpisFor(v), seriesFor(v), prevSeriesFor(v), lanes(v), transactions(v)]);
  const net = (x: typeof k) => x.gross - x.refunds - x.fees - x.disputes;
  const noFee = tx.filter((t) => t.fee == null).length;
  const b = v.period.bucket;
  return (
    <div className="cr-body">
      <PageHead
        title="Revenue"
        desc="From gross to net, per unit and per lane. Payments by the time they were made; refunds and chargebacks by when they happened."
        actions={
          <>
            <ExportButton dataset="transactions" format="csv" label="CSV" />
            <ExportButton dataset="financial" format="xlsx" label="Financial workbook" />
          </>
        }
      />
      <Filters label={v.period.label} show={["range", "lane", "kind"]} />
      <div className="grid g-6">
        <Kpi label="Gross revenue" value={k.gross} prev={prev?.gross} format="money" kind="money" spark={s.map((x) => x.gross)} slot={3} />
        <Kpi label="Net revenue" value={net(k)} prev={prev ? net(prev) : undefined} format="money" kind="money" sub="after refunds, chargebacks and fees" />
        <Kpi label="Payments" value={k.paid} prev={prev?.paid} spark={s.map((x) => x.paid)} />
        <Kpi label="Average order" value={k.paid ? k.gross / k.paid : null} prev={prev && prev.paid ? prev.gross / prev.paid : undefined} format="money" kind="money" />
        <Kpi label="Checkout conversion" value={rate(k.paid, k.checkouts)} prev={prev ? rate(prev.paid, prev.checkouts) : undefined} format="pct" kind="rate" sub={`${k.paid} paid of ${k.checkouts} started`} />
        <Kpi label="Refunds & chargebacks" value={k.refunds + k.disputes} prev={prev ? prev.refunds + prev.disputes : undefined} format="money" kind="money" lowerIsBetter />
      </div>

      <div className="section stats">
        <Stat label="Gross" value={money(k.gross, true)} sub={`${k.paid} payments`} />
        <Stat label="Refunds" value={money(-k.refunds, true)} sub={pct(rate(k.refunds, k.gross))} />
        <Stat label="Chargebacks" value={money(-k.disputes, true)} />
        <Stat label="Stripe fees" value={money(-k.fees, true)} sub={noFee ? `${noFee} payments without a recorded fee` : pct(rate(k.fees, k.gross))} />
        <Stat label="Net" value={money(net(k), true)} sub="gross − refunds − chargebacks − fees" />
        <Stat label="Revenue per visitor" value={money(k.visitors ? (k.gross - k.refunds) / k.visitors : null, true)} sub={`${k.visitors.toLocaleString("en-US")} visitors`} />
        <Stat label="Revenue per creator" value={money(k.creators ? (k.gross - k.refunds) / k.creators : null, true)} sub={`${k.creators} creators`} />
        <Stat label="Revenue per live spot" value={money(k.liveSpots ? (k.gross - k.refunds) / k.liveSpots : null, true)} sub={`${k.liveSpots} live at the end of the period`} />
      </div>

      <div className="grid g-21 section">
        <Card title="Revenue trend" desc={ps ? "Gross per bucket, against the previous period (dashed). Click a day for its transactions." : "Gross per bucket. Click a day for its transactions."}>
          <LineChart
            labels={s.map((x) => x.t)}
            prevLabels={ps?.map((x) => x.t)}
            bucket={b}
            format="money"
            area
            partial={partial}
            series={[
              { name: "Gross", values: s.map((x) => x.gross), slot: 3 },
              ...(ps ? [{ name: "Previous period", values: s.map((_, i) => ps[i]?.gross ?? null), slot: "prev" as const }] : []),
            ]}
            hrefs={b === "day" ? s.map((x) => to("/founder/revenue", dayRange(x.t))) : undefined}
            hint="Click to see that day's transactions"
            height={260}
          />
        </Card>
        <Card title="Revenue by lane" desc="After refunds">
          <Bars
            format="money"
            items={[...l]
              .filter((x) => !v.f.lane || x.lane === v.f.lane)
              .sort((a, c) => c.revenue - a.revenue)
              .map((x) => ({ key: x.lane, label: x.label, value: x.revenue, sub: `${x.paid} spots`, slot: LANE_SLOT[x.lane], href: to("/founder/revenue", { lane: x.lane }) }))}
          />
        </Card>
      </div>

      <div className="section">
        <Card
          title="Transactions"
          desc="One row per paid spot, with its Stripe payment id. Sum of Net equals the Net above; reconcile against Stripe's balance report for the same dates."
        >
          <DataTable
            rows={tx}
            sort="paidAt"
            search={["name", "creator", "paymentIntent"]}
            facet="lane"
            cols={[
              { key: "paidAt", label: "Paid", type: "datetime" },
              { key: "no", label: "No.", type: "int", href: "/founder/spots/{id}" },
              { key: "name", label: "Spot", href: "/founder/spots/{id}" },
              { key: "lane", label: "Lane", type: "lane" },
              { key: "creator", label: "Creator" },
              { key: "amount", label: "Amount", type: "money" },
              { key: "fee", label: "Fee", type: "money" },
              { key: "refund", label: "Refund", type: "money" },
              { key: "dispute", label: "Chargeback", type: "money" },
              { key: "net", label: "Net", type: "money" },
              { key: "paymentIntent", label: "Stripe payment", type: "mono" },
            ]}
            empty="No payments in this period."
          />
        </Card>
      </div>
    </div>
  );
}

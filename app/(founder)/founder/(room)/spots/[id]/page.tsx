import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireFounder } from "../../../../../../lib/founder/auth";
import { hasData, spot, TZ } from "../../../../../../lib/founder/data";
import { LANE_LABEL } from "../../../../../../lib/founder/filters";
import { int, money, pct, rate } from "../../../../../../lib/founder/format";
import { sourceName } from "../../../../../../lib/founder/feedText";
import { LineChart } from "../../../_kit/Chart";
import { DataTable } from "../../../_kit/DataTable";
import { NoData } from "../../../_kit/page";
import { Bars, Card, Empty, Funnel, LANE_SLOT, Stat } from "../../../_kit/ui";

export const metadata: Metadata = { title: "Spot" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }) : "—";

/** One spot's complete story: reach, engagement, money, where its visitors came from, and every event. */
export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFounder();
  if (!hasData()) return <NoData />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const d = await spot(id);
  if (!d) notFound();
  const { story: s, totals: t } = d;
  const revenue = (s.amount ?? 0) - (s.refund ?? 0);
  const publicUrl = `/s/${s.lane}/${s.no}/${s.slug}`;
  const hours = d.timeline.length;

  return (
    <div className="cr-body">
      <div className="crumbs">
        <a href="/founder/wall">Wall</a>
        <span>›</span>
        <a href={`/founder/wall?lane=${s.lane}`}>{LANE_LABEL[s.lane]}</a>
        <span>›</span>
        <span>No. {s.no}</span>
      </div>
      <div className="cr-head">
        <div className="spot-head">
          <span className="spot-swatch" style={{ background: `var(--s${LANE_SLOT[s.lane] ?? 1})`, color: "#fff" }}>
            {String(s.no).padStart(3, "0")}
          </span>
          <div>
            <h1>{s.name}</h1>
            <p>
              No. {s.no} of 500 · {LANE_LABEL[s.lane]} · <span className={`status ${s.status}`}>{s.status}</span> · by {s.creator}
            </p>
          </div>
        </div>
        <div className="actions">
          <a className="btn ghost" href={publicUrl} target="_blank" rel="noreferrer">
            Open on the wall ↗
          </a>
        </div>
      </div>

      <div className="stats s6">
        <Stat label="Impressions" value={int(t.impressions)} sub="tile seen (per person per day)" />
        <Stat label="Unique viewers" value={int(t.viewers)} />
        <Stat label="Opens" value={int(t.opens)} sub={`${int(t.openers)} people`} />
        <Stat label="Open rate" value={pct(rate(t.opens, t.impressions))} sub="opens per impression" />
        <Stat label="Saves" value={int(t.saves)} />
        <Stat label="Save rate" value={pct(rate(t.saves, t.opens))} sub="saves per open" />
        <Stat label="Shares" value={int(t.shares)} />
        <Stat label="Share rate" value={pct(rate(t.shares, t.opens))} sub="shares per open" />
        <Stat label="Outbound clicks" value={int(t.clicks)} />
        <Stat label="Outbound CTR" value={pct(rate(t.clicks, t.opens))} sub="clicks per open" />
        <Stat label="Visits from its shares" value={int(t.shareVisits)} sub={`${int(t.entries)} opened from the link`} />
        <Stat label="Revenue" value={money(revenue, true)} sub={s.refund ? `refunded ${money(s.refund, true)}` : s.fee != null ? `fee ${money(s.fee, true)}` : undefined} />
      </div>

      <div className="grid g-21 section">
        <Card title="Timeline" desc={`By hour, over its ${hours} ${hours === 1 ? "hour" : "hours"} on the wall`}>
          {t.impressions + t.opens ? (
            <LineChart
              labels={d.timeline.map((x) => x.t)}
              bucket="hour"
              series={[
                { name: "Impressions", values: d.timeline.map((x) => x.impressions), slot: 1 },
                { name: "Opens", values: d.timeline.map((x) => x.opens), slot: 2 },
                { name: "Saves", values: d.timeline.map((x) => x.saves), slot: 3 },
              ]}
              height={240}
              partial={s.status === "live"}
            />
          ) : (
            <Empty title="Nobody has seen this spot yet.">Impressions start when its tile is on someone's screen on the live wall.</Empty>
          )}
        </Card>
        <Card title="Its funnel">
          <Funnel
            mini
            steps={[
              { label: "Saw it", value: t.viewers, note: "people" },
              { label: "Opened", value: t.openers },
              { label: "Saved", value: t.saves },
              { label: "Shared", value: t.shares, of: 1 },
              { label: "Clicked out", value: t.clicks, of: 1 },
            ]}
          />
        </Card>
      </div>

      <div className="grid g-12 section">
        <Card title="Details">
          <dl className="facts">
            <dt>Creator</dt>
            <dd>{s.creator}</dd>
            <dt>Lane</dt>
            <dd>{LANE_LABEL[s.lane]}</dd>
            <dt>Wall number</dt>
            <dd>No. {s.no}</dd>
            <dt>Bought</dt>
            <dd>{when(s.createdAt)}</dd>
            <dt>Live from</dt>
            <dd>{when(s.startsAt)}</dd>
            <dt>Expires</dt>
            <dd>{when(s.endsAt)}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`status ${s.status}`}>{s.status}</span>
            </dd>
            <dt>Paid</dt>
            <dd>{s.amount ? money(s.amount, true) : "—"}</dd>
            <dt>Stripe fee</dt>
            <dd>{s.fee != null ? money(s.fee, true) : "not recorded"}</dd>
            {s.dispute ? (
              <>
                <dt>Chargeback</dt>
                <dd>{money(s.dispute, true)}</dd>
              </>
            ) : null}
            <dt>Check</dt>
            <dd>{s.moderation ? `${s.moderation.verdict} · ${s.moderation.reason}` : "—"}</dd>
            <dt>Links</dt>
            <dd>{s.links?.length ? s.links.map((l) => l.label || l.url).join(", ") : "—"}</dd>
            <dt>Lasting link</dt>
            <dd className="mono">{publicUrl}</dd>
          </dl>
        </Card>
        <Card title="Where its share traffic came from" desc="Visits that arrived through this spot's link">
          {d.sources.length ? (
            <Bars items={d.sources.map((x) => ({ key: x.key, label: sourceName(x.key), value: x.visits, slot: 3 }))} />
          ) : (
            <Empty title="No visits through its link yet.">When someone shares this spot and others open the link, they show up here by source.</Empty>
          )}
        </Card>
      </div>

      <div className="section">
        <Card title="Event history" desc="The latest 200 events; visitors are shown only as a short anonymous code">
          <DataTable
            rows={d.events.map((e, i) => ({ ...e, id: `${e.at}-${i}` }))}
            sort="at"
            facet="kind"
            pageSize={20}
            cols={[
              { key: "at", label: "When", type: "datetime" },
              { key: "kind", label: "Event", type: "mono" },
              { key: "visitor", label: "Visitor", type: "mono" },
            ]}
            empty="No events yet."
          />
        </Card>
      </div>
    </div>
  );
}

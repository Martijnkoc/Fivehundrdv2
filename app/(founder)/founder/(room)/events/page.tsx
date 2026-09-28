import type { Metadata } from "next";
import { feed, live } from "../../../../../lib/founder/data";
import { phraseText } from "../../../../../lib/founder/feedText";
import { DataTable } from "../../_kit/DataTable";
import { LiveFeed } from "../../_kit/LiveFeed";
import { NoData, room, type Params } from "../../_kit/page";
import { Card, PageHead, Stat } from "../../_kit/ui";

export const metadata: Metadata = { title: "Events" };

/** What is happening: the live stream, and the last hours as a table to search and filter. */
export default async function Events({ searchParams }: { searchParams: Promise<Params> }) {
  const { ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const now = Date.now();
  const [recent, hour, l] = await Promise.all([feed(new Date(now - 6 * 3600e3).toISOString(), 500), feed(new Date(now - 3600e3).toISOString(), 500), live()]);
  const perMin = hour.length / 60;
  const count = (k: string) => hour.filter((i) => i.kind === k).length;
  return (
    <div className="cr-body">
      <PageHead title="Events" desc="Fivehundrd as it happens. Visitors appear only as where they came from." />
      <div className="stats s6">
        <Stat label="Events per minute" value={perMin.toFixed(1)} sub="last hour" />
        <Stat label="Visits" value={count("visit")} sub="last hour" />
        <Stat label="Opens" value={count("open")} sub="last hour" />
        <Stat label="Saves" value={count("save")} sub="last hour" />
        <Stat label="Shares" value={count("share")} sub="last hour" />
        <Stat label="Payments" value={count("paid")} sub="last hour" />
      </div>
      <div className="grid g-12 section">
        <Card title="Live">
          <LiveFeed initial={recent.slice(0, 40)} live={l} limit={40} every={4000} />
        </Card>
        <Card title="The last six hours" desc="Up to 500 most recent moments of each kind; search a spot, source or country">
          <DataTable
            rows={recent.map((i, n) => ({ ...i, id: `${i.at}-${n}`, what: phraseText(i), spot: i.no != null ? `No. ${i.no}` : "" }))}
            sort="at"
            search={["what", "name", "source", "country", "spot"]}
            facet="kind"
            pageSize={30}
            cols={[
              { key: "at", label: "When", type: "datetime" },
              { key: "kind", label: "Kind", type: "mono" },
              { key: "what", label: "What happened" },
              { key: "name", label: "Spot", href: "/founder/spots/{story}" },
              { key: "source", label: "Source" },
              { key: "device", label: "Device" },
              { key: "country", label: "Country" },
            ]}
            empty="Nothing happened in the last six hours."
          />
        </Card>
      </div>
    </div>
  );
}

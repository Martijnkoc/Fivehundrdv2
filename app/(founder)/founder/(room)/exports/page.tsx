import type { Metadata } from "next";
import { exportList } from "../../../../../lib/founder/data";
import { DATASETS } from "../../../../../lib/founder/exports";
import { Exports } from "../../_kit/Exports";
import { Filters } from "../../_kit/Filters";
import { NoData, room, type Params } from "../../_kit/page";
import { Card, PageHead } from "../../_kit/ui";

export const metadata: Metadata = { title: "Exports" };

/** Take the numbers along: CSV for analysis, XLSX for finance, a PDF founder report for updates. */
export default async function ExportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { v, ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const history = await exportList();
  return (
    <div className="cr-body">
      <PageHead title="Exports" desc="Files are made on the server, kept privately, and listed here. Every export uses the range and filters below." />
      <Filters label={v.period.label} />
      <Exports datasets={Object.entries(DATASETS).map(([id, d]) => ({ id, label: d.label, formats: [...d.formats] }))} initial={history} period={v.period.label} />
      <div className="grid g-3 section">
        <Card title="Daily founder summary" desc="Every morning (about 07:00 in Amsterdam)">
          <p className="note">Yesterday&apos;s founder report as a PDF: the headline numbers against the day before, the funnel, lanes, top spots and alerts.</p>
        </Card>
        <Card title="Weekly growth report" desc="Mondays">
          <p className="note">The last 7 days as a PDF founder report, plus daily metrics as a workbook for your own charts.</p>
        </Card>
        <Card title="Monthly financial report" desc="On the 1st">
          <p className="note">
            The financial workbook (summary, transactions with Stripe ids, lanes, days) and the PDF report. Scheduled reports appear in the history with their schedule; they run from{" "}
            <code>/api/cron/reports</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}

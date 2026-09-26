import type { Metadata } from "next";
import { ops } from "../../../../../lib/founder/data";
import { ago, bytes, int, ms, pct, rate } from "../../../../../lib/founder/format";
import { LineChart } from "../../_kit/Chart";
import { DataTable } from "../../_kit/DataTable";
import { NoData, room, type Params } from "../../_kit/page";
import { Card, Empty, HealthCell, PageHead, type Health } from "../../_kit/ui";

export const metadata: Metadata = { title: "Operations" };
export const dynamic = "force-dynamic";

/**
 * The CTO's control room: is the product healthy right now? Green, amber and
 * red only where they describe an actual operational state.
 */
export default async function Operations({ searchParams }: { searchParams: Promise<Params> }) {
  const { ready } = await room(searchParams);
  if (!ready) return <NoData />;
  const o = await ops();
  const now = Date.now();
  const req = o.hours.reduce((a, h) => a + h.requests, 0);
  const err = o.hours.reduce((a, h) => a + h.errors, 0);
  const slow = o.hours.reduce((a, h) => a + h.slow, 0);
  const errRate = rate(err, req);
  const api: Health = !req ? "none" : errRate! > 0.02 ? "bad" : errRate! > 0.005 ? "warn" : "ok";
  const hook: Health = o.webhooks.failed24h > 0 ? "bad" : o.webhooks.ok24h ? "ok" : "none";
  const cronFailed = o.cron.reduce((a, c) => a + c.failed24h, 0);
  const cron: Health = !o.cron.length ? "none" : cronFailed ? "warn" : o.cron.some((c) => c.last && c.last.status !== "succeeded") ? "bad" : "ok";
  const lastEv = o.ingestion.lastEvent ? now - Date.parse(o.ingestion.lastEvent) : null;
  const ingest: Health = lastEv == null ? "none" : (o.ingestion.lagMs ?? 0) > 5 * 60e3 || lastEv > 6 * 3600e3 ? "warn" : "ok";
  const uploads: Health = o.uploads.failed24h > 3 ? "bad" : o.uploads.failed24h ? "warn" : "ok";
  const slowest = [...o.routes].sort((a, b) => (b.avgMs ?? 0) - (a.avgMs ?? 0))[0];
  const version = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    region: process.env.VERCEL_REGION ?? "—",
    msg: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? "",
    deploy: process.env.VERCEL_DEPLOYMENT_ID ?? "",
  };

  return (
    <div className="cr-body">
      <PageHead title="Operations" desc="Requests, errors, webhooks, jobs and the database, over the last 24 hours." />
      <div className="health">
        <HealthCell label="API" s={api} value={req ? `${pct(errRate)} errors` : "No traffic"} sub={`${int(req)} requests · ${int(err)} failed · ${int(slow)} slow (> 1 s)`} />
        <HealthCell label="Stripe webhooks" s={hook} value={o.webhooks.failed24h ? `${o.webhooks.failed24h} failed` : `${int(o.webhooks.ok24h)} delivered`} sub={`last ${ago(o.webhooks.last, now)}`} />
        <HealthCell label="Scheduled jobs" s={cron} value={o.cron.length ? `${o.cron.length} jobs` : "Not visible"} sub={cronFailed ? `${cronFailed} failed runs in 24 h` : o.cron.length ? "all recent runs succeeded" : "cron schema not readable"} />
        <HealthCell label="Event ingestion" s={ingest} value={o.ingestion.lagMs != null ? `${ms(o.ingestion.lagMs)} lag` : "—"} sub={`last event ${ago(o.ingestion.lastEvent, now)} · last visit ${ago(o.ingestion.lastVisit, now)}`} />
        <HealthCell label="Uploads" s={uploads} value={o.uploads.failed24h ? `${o.uploads.failed24h} failed` : "No failures"} sub="upload links and image processing, 24 h" />
        <HealthCell label="Browser errors" s={o.clientErrors24h > 50 ? "warn" : "ok"} value={int(o.clientErrors24h)} sub="reported by visitors' browsers, 24 h" />
        <HealthCell label="Database" s="ok" value={bytes(o.database.bytes)} sub={`${o.database.connections} connections`} />
        <HealthCell label="Deployment" s="none" value={<span className="mono">{version.sha}</span>} sub={`${version.env} · ${version.region}${version.msg ? ` · ${version.msg}` : ""}`} />
      </div>

      <div className="grid g-2 section">
        <Card title="Requests per hour" desc="All API routes">
          <LineChart labels={o.hours.map((h) => h.t)} bucket="hour" area series={[{ name: "Requests", values: o.hours.map((h) => h.requests), slot: 1 }]} height={200} partial />
        </Card>
        <Card title="Errors and slow calls per hour" desc="5xx responses, and calls over one second">
          <LineChart
            labels={o.hours.map((h) => h.t)}
            bucket="hour"
            series={[
              { name: "Errors", values: o.hours.map((h) => h.errors), slot: 2 },
              { name: "Slow", values: o.hours.map((h) => h.slow), slot: 4 },
            ]}
            height={200}
            partial
          />
        </Card>
      </div>

      <div className="section">
        <Card title="Routes" desc={slowest ? `Slowest on average: ${slowest.route} (${ms(slowest.avgMs)})` : "Per API route, last 24 hours"}>
          {o.routes.length ? (
            <DataTable
              rows={o.routes.map((r) => ({ ...r, id: r.route }))}
              sort="requests"
              cols={[
                { key: "route", label: "Route", type: "mono" },
                { key: "requests", label: "Requests", type: "int" },
                { key: "errors", label: "Errors", type: "int" },
                { key: "errRate", label: "Error rate", type: "pct", ratio: ["errors", "requests"] },
                { key: "slow", label: "Slow", type: "int" },
                { key: "avgMs", label: "Avg ms", type: "int" },
                { key: "maxMs", label: "Max ms", type: "int" },
              ]}
            />
          ) : (
            <Empty title="No requests logged yet.">API routes record their status and duration after each response; they appear here within a minute.</Empty>
          )}
        </Card>
      </div>

      <div className="grid g-2 section">
        <Card title="Recent errors" desc="Server errors, failed webhooks and uploads, last 7 days">
          {o.errors.length ? (
            <DataTable
              rows={o.errors.map((e, i) => ({ ...e, id: String(i) }))}
              sort="at"
              pageSize={10}
              cols={[
                { key: "at", label: "When", type: "datetime" },
                { key: "kind", label: "Kind" },
                { key: "route", label: "Route", type: "mono" },
                { key: "status", label: "Status", type: "int" },
                { key: "message", label: "Message" },
              ]}
            />
          ) : (
            <Empty title="No errors in the last 7 days." />
          )}
        </Card>
        <Card title="Scheduled jobs" desc="Database (pg_cron) and Vercel cron">
          {o.cron.length ? (
            <DataTable
              rows={o.cron.map((c) => ({ id: c.name, name: c.name, schedule: c.schedule, status: c.last?.status === "succeeded" ? "ok" : (c.last?.status ?? "—"), at: c.last?.at, failed24h: c.failed24h }))}
              cols={[
                { key: "name", label: "Job", type: "mono" },
                { key: "schedule", label: "Schedule", type: "mono" },
                { key: "status", label: "Last run", type: "status" },
                { key: "at", label: "At", type: "datetime" },
                { key: "failed24h", label: "Failed (24 h)", type: "int" },
              ]}
            />
          ) : (
            <Empty title="Jobs aren't visible from here.">The database role can't read pg_cron on this project; check Supabase → Integrations → Cron.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

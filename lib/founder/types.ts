/* The shapes the fd_* database functions return (supabase/migrations/20260926090600_founder_data.sql). Money in cents. */

export type Kpis = {
  visitors: number;
  newVisitors: number;
  visits: number;
  fromShares: number;
  impressions: number;
  viewers: number;
  opens: number;
  openers: number;
  saves: number;
  savers: number;
  unsaves: number;
  shares: number;
  sharers: number;
  clicks: number;
  entries: number;
  createStarts: number;
  checkouts: number;
  paid: number;
  creators: number;
  newCreators: number;
  gross: number;
  refunds: number;
  fees: number;
  disputes: number;
  liveSpots: number;
  accounts: number;
  reports: number;
  cohort: number;
  returned7: number;
};

export type Point = {
  t: string;
  visitors: number;
  newVisitors: number;
  visits: number;
  fromShares: number;
  opens: number;
  saves: number;
  shares: number;
  clicks: number;
  impressions: number;
  createStarts: number;
  checkouts: number;
  paid: number;
  gross: number;
};

export type LaneRow = {
  lane: string;
  label: string;
  live: number;
  opens: number;
  saves: number;
  shares: number;
  impressions: number;
  paid: number;
  revenue: number;
};
export type DimRow = { key: string; visitors: number; visits: number; new_visits: number; opens: number };

export type SpotRow = {
  id: string;
  slug: string;
  lane: string;
  no: number;
  name: string;
  creator: string;
  startsAt: string;
  endsAt: string;
  status: "live" | "ended" | "hidden" | "removed";
  impressions: number;
  viewers: number;
  opens: number;
  saves: number;
  shares: number;
  clicks: number;
  shareVisits: number;
  revenue: number;
};

export type SpotDetail = {
  story: {
    id: string;
    slug: string;
    lane: string;
    no: number;
    name: string;
    snippet: string | null;
    artwork: string | null;
    logo: string | null;
    seed: number;
    pal: number;
    creator: string;
    links: { label: string; url: string }[] | null;
    createdAt: string;
    startsAt: string | null;
    endsAt: string | null;
    amount: number | null;
    refund: number | null;
    fee: number | null;
    dispute: number | null;
    moderation: { verdict: string; reason: string } | null;
    status: "live" | "ended" | "hidden" | "removed" | "unpaid";
  };
  totals: {
    impressions: number;
    viewers: number;
    opens: number;
    openers: number;
    saves: number;
    shares: number;
    clicks: number;
    entries: number;
    shareVisits: number;
  };
  timeline: { t: string; impressions: number; opens: number; saves: number; shares: number; clicks: number }[];
  sources: { key: string; visits: number }[];
  events: { at: string; kind: string; visitor: string }[];
};

export type CreatorRow = {
  creator: string;
  spots: number;
  spotsInPeriod: number;
  firstAt: string;
  lastAt: string;
  revenue: number;
  opens: number;
  saves: number;
  lanes: string[];
};

export type CreateFunnel = { started: number; steps: { step: number; visitors: number }[]; checkouts: number; paid: number };

export type Transaction = {
  id: string;
  paidAt: string;
  lane: string;
  no: number;
  name: string;
  creator: string;
  currency: string;
  amount: number;
  fee: number | null;
  refund: number;
  refundedAt: string | null;
  dispute: number;
  disputeStatus: string | null;
  net: number;
  paymentIntent: string | null;
  session: string | null;
};

export type Cohort = { week: string; size: number; d1: number; d7: number; d30: number; weeks: number[] | null };

export type FeedItem = {
  at: string;
  kind: "visit" | "open" | "save" | "unsave" | "share" | "link_click" | "entry" | "create_start" | "create_step" | "checkout" | "paid";
  source: string | null;
  device: string | null;
  country: string | null;
  isNew: boolean | null;
  lane: string | null;
  no: number | null;
  name: string | null;
  story: string | null;
  amount: number | null;
  step: number | null;
};

export type Live = { now: number; lastEvent: string | null };

export type Ops = {
  hours: { t: string; requests: number; errors: number; slow: number }[];
  routes: { route: string; requests: number; errors: number; slow: number; avgMs: number | null; maxMs: number }[];
  errors: { at: string; kind: string; route: string | null; status: number | null; message: string | null }[];
  webhooks: { ok24h: number; failed24h: number; last: string | null };
  uploads: { failed24h: number };
  clientErrors24h: number;
  cron: { name: string; schedule: string; active: boolean; last: { status: string; at: string; message: string } | null; failed24h: number }[];
  database: { bytes: number; connections: number };
  ingestion: { lastVisit: string | null; lastEvent: string | null; lagMs: number | null };
};

export type ExportRow = {
  id: string;
  created_at: string;
  finished_at: string | null;
  created_by: string | null;
  title: string;
  kind: string;
  format: "csv" | "xlsx" | "pdf";
  params: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed";
  rows: number | null;
  bytes: number | null;
  path: string | null;
  error: string | null;
  schedule: string | null;
};

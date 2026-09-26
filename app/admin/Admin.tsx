"use client";

import { useCallback, useEffect, useState } from "react";
import { mediaURL } from "../../lib/wall/live";
import { LANE, pad, type LaneId } from "../../lib/wall/model";
import { SUPABASE_URL, supabase } from "../wall/liveClient";
import "./admin.css";

/*
 * The admin screen: what's on the wall, what needs a look, and the money.
 * Sign in with an email link; only addresses in ADMIN_EMAILS get data back.
 */

type Money = { today: number; week: number; month: number; all: number; sales: number; refunds: number; currency: string };
type Overview = {
  live: number;
  held: number;
  hidden: number;
  attention: number;
  openReports: number;
  lanes: Record<LaneId, number>;
  revenue: Money;
};
type Story = {
  id: string;
  lane: LaneId;
  no: number;
  name: string;
  snippet: string | null;
  links: { label: string; url: string }[];
  artwork: string | null;
  logo: string | null;
  audio: string | null;
  excerptTitle: string | null;
  excerpt: string | null;
  trailerUrl: string | null;
  email: string | null;
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
  opens: number;
  saves: number;
  moderation: { verdict: string; categories: string[]; reason: string; links?: { url: string; problem: string }[] } | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
  reviewedAt: string | null;
  removedAt: string | null;
  removedReason: string | null;
  amount: number | null;
  currency: string | null;
  refundedAt: string | null;
  refundAmount: number | null;
  paid: boolean;
  status: "live" | "held" | "ended" | "removed" | "unpaid";
  openReports: number;
  reports: number;
};
type Report = { reason: string; note: string | null; email: string | null; at: string; resolvedAt: string | null; resolution: string | null };
type Filter = "attention" | "live" | "removed" | "all";

const REASON_LABEL: Record<string, string> = {
  sexual: "Sexual content",
  child: "Child safety",
  scam: "Scam or phishing",
  hate: "Hate or harassment",
  violence: "Violence or self-harm",
  illegal: "Illegal",
  copyright: "Copyright",
  spam: "Spam",
  other: "Other",
};

const money = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const leftOf = (iso: string | null) => {
  if (!iso) return "";
  const h = (Date.parse(iso) - Date.now()) / 3600e3;
  return h <= 0 ? "ended" : h < 1 ? `${Math.round(h * 60)}m left` : `${Math.floor(h)}h left`;
};

async function token() {
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.access_token ?? null;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const t = await token();
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${t}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((out as { error?: string }).error || `Error ${r.status}`), { status: r.status });
  return out as T;
}

/* ---------- signing in ---------- */

function SignIn({ note }: { note?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    const { error } = await (await supabase()).auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin + "/admin", shouldCreateUser: true },
    });
    if (error) setErr(error.message);
    else setSent(true);
  };
  return (
    <div className="adm-sign">
      <h1>
        fivehundrd<span>.</span> admin
      </h1>
      {note && <p className="adm-note">{note}</p>}
      {sent ? (
        <p>Check your inbox for the sign-in link.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="admEmail">Email</label>
          <input id="admEmail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit">Email me a sign-in link</button>
          {err && <p className="adm-err">{err}</p>}
        </form>
      )}
    </div>
  );
}

/* ---------- one story ---------- */

function Badge({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`adm-badge ${kind}`}>{children}</span>;
}

function StoryRow({ s, onChanged }: { s: Story; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(true);
  const img = mediaURL(SUPABASE_URL, "art", s.artwork ?? s.logo);
  const verdict = s.moderation?.verdict;

  useEffect(() => {
    if (open && reports === null && s.reports > 0)
      api<Report[]>(`/api/admin?view=reports&id=${s.id}`)
        .then(setReports)
        .catch(() => setReports([]));
  }, [open, reports, s.id, s.reports]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setErr("");
    try {
      await api("/api/admin", { action, id: s.id, ...extra });
      setRemoving(false);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <li className={`adm-story${open ? " open" : ""}`}>
      <button className="adm-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="adm-thumb">{img ? <img src={img} alt="" /> : <span>{s.name.slice(0, 1)}</span>}</span>
        <span className="adm-main">
          <b>{s.name}</b>
          <span className="adm-meta">
            {`${LANE[s.lane]} No. ${pad(s.no)}`}
            {s.startsAt && s.status === "live" && ` · ${leftOf(s.endsAt)}`}
            {` · ${s.opens} opens · ${s.saves} saves`}
          </span>
        </span>
        <span className="adm-badges">
          {s.status === "removed" ? (
            <Badge kind="bad">Removed</Badge>
          ) : s.hiddenAt ? (
            <Badge kind="bad">Hidden</Badge>
          ) : (
            <Badge kind={s.status === "live" ? "good" : "muted"}>{s.status === "held" ? "At checkout" : s.status === "live" ? "Live" : s.status === "ended" ? "Ended" : "Unpaid"}</Badge>
          )}
          {s.openReports > 0 && <Badge kind="bad">{`${s.openReports} report${s.openReports > 1 ? "s" : ""}`}</Badge>}
          {verdict && verdict !== "ok" && !s.reviewedAt && (
            <Badge kind={verdict === "block" ? "bad" : "warn"}>{verdict === "unscanned" ? "Not scanned" : "Check"}</Badge>
          )}
          {s.refundedAt && <Badge kind="muted">Refunded</Badge>}
        </span>
      </button>
      {open && (
        <div className={`adm-detail${img ? " has-img" : ""}`}>
          {img && (
            <a className="adm-big" href={img} target="_blank" rel="noopener noreferrer">
              <img src={img} alt={`${s.name} artwork`} />
            </a>
          )}
          <div className="adm-info">
            {s.moderation && (
              <p className={`adm-scan ${verdict}`}>
                <b>Automatic check: {verdict}</b>
                {s.moderation.categories.length > 0 && ` (${s.moderation.categories.join(", ")})`}. {s.moderation.reason}
              </p>
            )}
            {s.hiddenAt && <p className="adm-scan block">{`Hidden ${ago(s.hiddenAt)}${s.hiddenReason ? `: ${s.hiddenReason}` : ""}.`}</p>}
            {s.removedAt && <p className="adm-scan block">{`Removed ${ago(s.removedAt)}${s.removedReason ? `: ${s.removedReason}` : ""}.`}</p>}
            {s.snippet && <p>{s.snippet}</p>}
            {s.excerpt && (
              <details>
                <summary>{s.excerptTitle || "Excerpt"}</summary>
                <p className="adm-excerpt">{s.excerpt}</p>
              </details>
            )}
            {s.audio && <audio controls preload="none" src={mediaURL(SUPABASE_URL, "audio", s.audio) ?? undefined} />}
            <ul className="adm-links">
              {s.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">
                    {l.url}
                  </a>
                </li>
              ))}
              {s.trailerUrl && (
                <li>
                  Trailer:{" "}
                  <a href={s.trailerUrl} target="_blank" rel="noopener noreferrer nofollow">
                    {s.trailerUrl}
                  </a>
                </li>
              )}
            </ul>
            <dl className="adm-facts">
              <dt>Paid</dt>
              <dd>
                {s.amount != null ? money(s.amount, s.currency ?? "usd") : "–"}
                {s.refundAmount ? ` (refunded ${money(s.refundAmount, s.currency ?? "usd")})` : ""}
              </dd>
              <dt>Maker</dt>
              <dd>{s.email || "no email"}</dd>
              <dt>Started</dt>
              <dd>{s.startsAt ? new Date(s.startsAt).toLocaleString() : "not yet"}</dd>
            </dl>
            {reports && reports.length > 0 && (
              <div className="adm-reports">
                <b>Reports</b>
                <ul>
                  {reports.map((r, i) => (
                    <li key={i} className={r.resolvedAt ? "done" : ""}>
                      <span>{REASON_LABEL[r.reason] ?? r.reason}</span> {ago(r.at)}
                      {r.resolution && ` · ${r.resolution}`}
                      {r.note && <q>{r.note}</q>}
                      {r.email && <em>{r.email}</em>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.status !== "removed" && !removing && (
              <div className="adm-acts">
                {s.status === "live" && (
                  <a className="adm-btn" href={`/s/${s.lane}/${s.no}`} target="_blank" rel="noopener">
                    View on wall
                  </a>
                )}
                {(s.hiddenAt || s.openReports > 0 || (verdict !== "ok" && !s.reviewedAt)) && (
                  <button className="adm-btn good" disabled={!!busy} onClick={() => act("approve")}>
                    {busy === "approve" ? "…" : "It's fine, keep it"}
                  </button>
                )}
                {s.hiddenAt ? (
                  <button className="adm-btn" disabled={!!busy} onClick={() => act("unhide")}>
                    Put back
                  </button>
                ) : (
                  s.status === "live" && (
                    <button className="adm-btn" disabled={!!busy} onClick={() => act("hide")}>
                      {busy === "hide" ? "…" : "Hide for now"}
                    </button>
                  )
                )}
                <button className="adm-btn bad" disabled={!!busy} onClick={() => setRemoving(true)}>
                  Remove…
                </button>
              </div>
            )}
            {s.status === "removed" && s.paid && !s.refundedAt && (
              <div className="adm-acts">
                <button className="adm-btn" disabled={!!busy} onClick={() => act("refund")}>
                  {busy === "refund" ? "…" : `Refund ${money(s.amount ?? 0, s.currency ?? "usd")}`}
                </button>
              </div>
            )}
            {removing && (
              <form
                className="adm-remove"
                onSubmit={(e) => {
                  e.preventDefault();
                  act("remove", { reason, refund: s.paid && refund });
                }}
              >
                <label htmlFor={`why-${s.id}`}>Why is it coming off the wall?</label>
                <input id={`why-${s.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. phishing link" required />
                {s.paid && (
                  <label className="adm-check">
                    <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                    {`Refund ${money(s.amount ?? 0, s.currency ?? "usd")}`}
                  </label>
                )}
                <div className="adm-acts">
                  <button className="adm-btn bad" type="submit" disabled={!!busy}>
                    {busy === "remove" ? "Removing…" : "Remove for good"}
                  </button>
                  <button className="adm-btn" type="button" onClick={() => setRemoving(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {err && <p className="adm-err">{err}</p>}
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------- the screen ---------- */

export function Admin() {
  const [state, setState] = useState<"loading" | "signin" | "denied" | "ready">("loading");
  const [ov, setOv] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [stories, setStories] = useState<Story[]>([]);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (offset = 0) => {
      try {
        const [o, list] = await Promise.all([
          offset ? Promise.resolve(null) : api<Overview>("/api/admin?view=overview"),
          api<Story[]>(`/api/admin?view=stories&filter=${filter}&q=${encodeURIComponent(q)}&offset=${offset}`),
        ]);
        if (o) setOv(o);
        setStories((prev) => (offset ? [...prev, ...list] : list));
        setMore(list.length === 50);
        setErr("");
        setState("ready");
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 403) setState("denied");
        else setErr((e as Error).message);
      }
    },
    [filter, q],
  );

  /* search after a short pause in typing */
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => {
    (async () => {
      if (!(await token())) return setState("signin");
      load();
    })();
  }, [load]);

  if (state === "loading") return <div className="adm adm-loading">Loading…</div>;
  if (state === "signin")
    return (
      <div className="adm">
        <SignIn />
      </div>
    );
  if (state === "denied")
    return (
      <div className="adm">
        <SignIn note="This account can't open the admin screen. Sign in with an admin address." />
        <p className="adm-center">
          <button
            className="adm-btn"
            onClick={async () => {
              await (await supabase()).auth.signOut();
              setState("signin");
            }}
          >
            Sign out
          </button>
        </p>
      </div>
    );

  const r = ov?.revenue;
  const cur = r?.currency ?? "usd";
  const tabs: [Filter, string, number | undefined][] = [
    ["attention", "Needs a look", ov?.attention],
    ["live", "Live", ov?.live],
    ["removed", "Removed", undefined],
    ["all", "All", undefined],
  ];
  return (
    <div className="adm">
      <header className="adm-top">
        <h1>
          fivehundrd<span>.</span> admin
        </h1>
        <div className="adm-top-r">
          <a href="/" className="adm-btn">
            Wall
          </a>
          <button
            className="adm-btn"
            onClick={async () => {
              await (await supabase()).auth.signOut();
              setState("signin");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {ov && r && (
        <section className="adm-cards" aria-label="Overview">
          <div className="adm-card">
            <span>Live now</span>
            <b>{ov.live}</b>
            <small>{`${ov.held} at checkout${ov.hidden ? `, ${ov.hidden} hidden` : ""}`}</small>
          </div>
          <div className={`adm-card${ov.attention ? " alert" : ""}`}>
            <span>Needs a look</span>
            <b>{ov.attention}</b>
            <small>{`${ov.openReports} open report${ov.openReports === 1 ? "" : "s"}`}</small>
          </div>
          <div className="adm-card">
            <span>Today</span>
            <b>{money(r.today, cur)}</b>
            <small>{`${money(r.week, cur)} this week`}</small>
          </div>
          <div className="adm-card">
            <span>Last 30 days</span>
            <b>{money(r.month, cur)}</b>
            <small>{`${money(r.all, cur)} all time, ${r.sales} sales${r.refunds ? `, ${money(r.refunds, cur)} refunded` : ""}`}</small>
          </div>
        </section>
      )}

      {ov && (
        <section className="adm-lanes" aria-label="Live per lane">
          {(Object.keys(LANE) as LaneId[]).map((k) => (
            <div key={k}>
              <span>{LANE[k]}</span>
              <i style={{ width: `${Math.max(2, ((ov.lanes[k] ?? 0) / 500) * 100)}%` }} />
              <b>{`${ov.lanes[k] ?? 0}/500`}</b>
            </div>
          ))}
        </section>
      )}

      <nav className="adm-tabs">
        {tabs.map(([k, label, n]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {label}
            {n ? <em>{n}</em> : null}
          </button>
        ))}
        <input className="adm-search" type="search" placeholder="Search name, email or link" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </nav>

      {err && <p className="adm-err">{err}</p>}
      {stories.length === 0 ? (
        <p className="adm-empty">{filter === "attention" ? "Nothing needs a look. All clear." : "Nothing here."}</p>
      ) : (
        <ul className="adm-list">
          {stories.map((s) => (
            <StoryRow key={s.id} s={s} onChanged={() => load()} />
          ))}
        </ul>
      )}
      {more && (
        <p className="adm-center">
          <button className="adm-btn" onClick={() => load(stories.length)}>
            Show more
          </button>
        </p>
      )}
    </div>
  );
}

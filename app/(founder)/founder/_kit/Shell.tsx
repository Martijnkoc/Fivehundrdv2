"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, Suspense, useContext, useEffect, useState, useTransition } from "react";
import { viewParams } from "../../../../lib/founder/filters";
import { Icons, type IconName } from "./icons";

const NAV: { group: string; items: [string, string, IconName][] }[] = [
  { group: "Now", items: [["/founder", "Pulse", "pulse"], ["/founder/events", "Events", "events"]] },
  {
    group: "Company",
    items: [
      ["/founder/overview", "Overview", "overview"],
      ["/founder/growth", "Growth", "growth"],
      ["/founder/revenue", "Revenue", "revenue"],
      ["/founder/acquisition", "Acquisition", "acquisition"],
    ],
  },
  {
    group: "Product",
    items: [
      ["/founder/wall", "Wall", "wall"],
      ["/founder/creators", "Creators", "creators"],
      ["/founder/shares", "Shares", "shares"],
      ["/founder/retention", "Retention", "retention"],
    ],
  },
  {
    group: "System",
    items: [
      ["/founder/operations", "Operations", "operations"],
      ["/founder/exports", "Exports", "exports"],
    ],
  },
];

function Links() {
  const path = usePathname();
  const sp = useSearchParams();
  /* sections keep the same slice (range and filters) */
  const q = new URLSearchParams(viewParams(Object.fromEntries(sp.entries()))).toString();
  return (
    <nav className="cr-nav" aria-label="Sections">
      {NAV.map((g) => (
        <div className="cr-group" key={g.group}>
          <span>{g.group}</span>
          {g.items.map(([href, label, icon]) => {
            const on = href === "/founder" ? path === "/founder" : path.startsWith(href) || (href === "/founder/wall" && path.startsWith("/founder/spots"));
            return (
              <Link key={href} className="cr-link" href={href + (q && href !== "/founder/events" ? "?" + q : "")} aria-current={on ? "page" : undefined}>
                {Icons[icon]}
                <span>{label}</span>
                {href === "/founder" && <i className="live-dot" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Theme() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => setT(document.documentElement.dataset.theme ?? null), []);
  const next = () => {
    const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const v = dark ? "light" : "dark";
    document.documentElement.dataset.theme = v;
    try {
      localStorage.setItem("fh-cr-theme", v);
    } catch {}
    setT(v);
  };
  return (
    <button className="chip-btn" type="button" onClick={next} aria-label="Switch light or dark">
      {Icons.sun}
      <span>Theme</span>
    </button>
  );
}

/** Moving within the Control Room keeps the current view on screen, dimmed, until the next one is ready. */
const Nav = createContext<(href: string) => void>(() => {});
export const useGo = () => useContext(Nav);

export function Shell({ email, demo, children }: { email: string; demo: boolean; children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (href: string) => start(() => router.push(href, { scroll: false }));
  const out = async () => {
    await fetch("/api/founder/session", { method: "DELETE" }).catch(() => {});
    location.assign("/founder/login");
  };
  return (
    <Nav.Provider value={go}>
    <div className={`cr${pending ? " loading" : ""}`} aria-busy={pending || undefined}>
      <aside className="cr-side">
        <a className="cr-brand" href="/founder">
          <b>
            Fivehundrd<i>.</i>
          </b>
          <span>Control Room</span>
        </a>
        <Suspense fallback={<nav className="cr-nav" />}>
          <Links />
        </Suspense>
        <div className="cr-foot">
          {demo && (
            <span className="badge demo" title="FOUNDER_DEMO=1: made-up numbers for development and previews">
              Demo data
            </span>
          )}
          <span className="who" title={email}>
            {email}
          </span>
          <div className="row">
            <Theme />
            {!demo && (
              <button className="chip-btn" type="button" onClick={out}>
                {Icons.out}
                <span>Sign out</span>
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="cr-main" id="main">
        {children}
      </main>
    </div>
    </Nav.Provider>
  );
}

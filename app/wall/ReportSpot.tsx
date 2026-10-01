"use client";

import { useState, type FormEvent } from "react";
import { NAV, type LaneId } from "../../lib/wall/model";

/* the lanes in the order the header shows them */
const LANES = NAV.filter(([k]) => k !== "all") as [LaneId, string][];
import { visitorId } from "./track";

type State = { kind: "closed" } | { kind: "open"; err?: string } | { kind: "sending" } | { kind: "sent" };

/**
 * The one place to report a story (approved change, 2026-10-01): at the
 * bottom of every page. A lane and a spot number are all it takes; the
 * report reaches the people who look after the wall.
 */
export function ReportSpot() {
  const [st, setSt] = useState<State>({ kind: "closed" });
  const [lane, setLane] = useState<LaneId>("music");
  const [no, setNo] = useState("");
  if (st.kind === "closed")
    return (
      <button type="button" className="foot-report" onClick={() => setSt({ kind: "open" })} aria-expanded="false">
        Report a spot
      </button>
    );
  if (st.kind === "sent") return <p className="foot-report-done" role="status">Thanks. A person will look at it.</p>;
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(no);
    if (!Number.isInteger(n) || n < 1 || n > 500) return setSt({ kind: "open", err: "Enter a spot number from 1 to 500." });
    setSt({ kind: "sending" });
    const r = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane, no: n, visitor: visitorId() }),
    }).catch(() => null);
    const out = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (r?.ok && out?.ok) return setSt({ kind: "sent" });
    const name = LANES.find(([k]) => k === lane)?.[1] ?? lane;
    setSt({ kind: "open", err: out?.error === "not found" ? `There's no live story at ${name} No. ${n} right now.` : "That didn't send. Try again." });
  };
  return (
    <form className="foot-report-form" onSubmit={send} aria-label="Report a spot">
      <label>
        <span>Lane</span>
        <select value={lane} onChange={(e) => setLane(e.target.value as LaneId)}>
          {LANES.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Spot number</span>
        <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))} autoFocus />
      </label>
      <button type="submit" disabled={st.kind === "sending"}>
        {st.kind === "sending" ? "Sending…" : "Send"}
      </button>
      {st.kind === "open" && st.err && (
        <p className="foot-report-err" role="alert">
          {st.err}
        </p>
      )}
    </form>
  );
}

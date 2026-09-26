"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { viewParams } from "../../../../lib/founder/filters";
import { ago, bytes } from "../../../../lib/founder/format";
import type { ExportRow } from "../../../../lib/founder/types";
import { Icons } from "./icons";

type DS = { id: string; label: string; formats: string[] };

/** The export form and the job history, which refreshes while jobs are running. */
export function Exports({ datasets, initial, period }: { datasets: DS[]; initial: ExportRow[]; period: string }) {
  const sp = useSearchParams();
  const [ds, setDs] = useState(datasets[0].id);
  const formats = datasets.find((d) => d.id === ds)!.formats;
  const [format, setFormat] = useState(formats[0]);
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!formats.includes(format)) setFormat(formats[0]);
  }, [ds, formats, format]);

  const running = rows.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const r = await fetch("/api/founder/exports", { cache: "no-store" }).catch(() => null);
      if (r?.ok) setRows(await r.json());
    }, 1500);
    return () => clearInterval(t);
  }, [running]);

  const start = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/founder/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset: ds, format, view: viewParams(Object.fromEntries(sp.entries())) }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "The export couldn't be started.");
    const list = await fetch("/api/founder/exports", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (list) setRows(list);
  };

  return (
    <>
      <section className="card">
        <div className="card-h">
          <div>
            <h3>New export</h3>
            <p>Uses {period} and the filters above.</p>
          </div>
        </div>
        <div className="form-row">
          <label className="field">
            Data
            <select value={ds} onChange={(e) => setDs(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            Format
            <div className="seg" role="group" aria-label="Format">
              {formats.map((f) => (
                <button key={f} type="button" aria-pressed={f === format} onClick={() => setFormat(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" type="button" onClick={start} disabled={busy}>
            {Icons.exports}
            {busy ? "Starting…" : "Export"}
          </button>
          {err && <span className="note" style={{ color: "var(--bad)" }}>{err}</span>}
        </div>
      </section>
      <section className="card section">
        <div className="card-h">
          <div>
            <h3>History</h3>
            <p>The latest 50 exports and scheduled reports. Download links last a minute; the files stay private.</p>
          </div>
        </div>
        {rows.length ? (
          <div className="dt-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th>Export</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th className="num">Rows</th>
                  <th className="num">Size</th>
                  <th>By</th>
                  <th>Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td title={r.title}>{r.title}</td>
                    <td className="mono">{r.format.toUpperCase()}</td>
                    <td>
                      <span className={`status ${r.status}`} title={r.error ?? undefined}>
                        {r.status}
                      </span>
                    </td>
                    <td className="num">{r.rows?.toLocaleString("en-US") ?? "—"}</td>
                    <td className="num">{bytes(r.bytes)}</td>
                    <td>{r.schedule ? <span className="badge">{r.schedule}</span> : r.created_by}</td>
                    <td>{ago(r.created_at)}</td>
                    <td>
                      {r.status === "done" ? (
                        <a className="chip-btn" href={`/api/founder/exports/${r.id}`}>
                          {Icons.exports} Download
                        </a>
                      ) : r.status === "failed" ? (
                        <span className="note">{r.error}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <b>No exports yet.</b>
            <p>Pick the data and a format above. Scheduled reports will appear here too.</p>
          </div>
        )}
      </section>
    </>
  );
}

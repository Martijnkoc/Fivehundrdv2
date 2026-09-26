"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { viewParams } from "../../../../lib/founder/filters";
import { Icons } from "./icons";

/** Starts a server-side export of this dataset with the current range and filters, then shows it in Exports. */
export function ExportButton({ dataset, format, label }: { dataset: string; format: "csv" | "xlsx" | "pdf"; label?: string }) {
  const sp = useSearchParams();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await fetch("/api/founder/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset, format, view: viewParams(Object.fromEntries(sp.entries())) }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) location.assign("/founder/exports");
    else alert("The export couldn't be started. Try again.");
  };
  return (
    <button className="btn ghost" type="button" onClick={go} disabled={busy}>
      {Icons.exports}
      {busy ? "Starting…" : (label ?? format.toUpperCase())}
    </button>
  );
}

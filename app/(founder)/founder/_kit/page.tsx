import "server-only";
import { requireFounder } from "../../../../lib/founder/auth";
import { hasData, viewOf } from "../../../../lib/founder/data";
import { viewParams, withParams } from "../../../../lib/founder/filters";
import { Empty } from "./ui";

export type Params = Record<string, string | string[] | undefined>;

/** Every Control Room page starts here: the founder check, then the view from the address. */
export async function room(sp: Promise<Params>) {
  await requireFounder();
  const p = await sp;
  const v = viewOf(p);
  /** a link to another section (or this one) with the same slice, plus changes */
  const to = (path: string, changes: Record<string, string | null> = {}) => withParams(viewParams(p), changes, path);
  /* the period runs until now, so its last day or hour is still filling up */
  const partial = Date.parse(v.period.to) > Date.now() - 60e3;
  return { p, v, to, partial, ready: hasData() };
}

/** A day on a chart → that day as the period (drill-down). */
export const dayRange = (t: string) => ({ range: "custom", from: t.slice(0, 10), to: t.slice(0, 10) });

export function NoData() {
  return (
    <Empty title="No data source on this deployment.">
      The Control Room reads from the database with the server key. Set <code>FIVEHUNDRD_SERVER_KEY</code> and the Supabase variables, or run with{" "}
      <code>FOUNDER_DEMO=1</code> locally to see it with made-up numbers.
    </Empty>
  );
}

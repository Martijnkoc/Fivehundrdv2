import "server-only";
import { after } from "next/server";
import { hasDatabase, rpc } from "./backend";

/*
 * The Control Room's Operations page: every API route records its status and
 * time per minute (api_minute), failures and webhooks go to ops_log. All of it
 * after the response is sent, so the visitor never waits on it, and a failed
 * write is dropped rather than retried.
 */

type Handler<A extends unknown[]> = (req: Request, ...rest: A) => Promise<Response> | Response;

/** Wraps a route handler: logs status and duration, and turns a throw into a logged 500. */
export function measured<A extends unknown[]>(route: string, handler: Handler<A>): Handler<A> {
  return async (req, ...rest) => {
    const t0 = performance.now();
    let status = 500;
    try {
      const res = await handler(req, ...rest);
      status = res.status;
      return res;
    } catch (e) {
      opsLog("error", false, { route, status: 500, message: e instanceof Error ? e.message : String(e) });
      return Response.json({ error: "unavailable" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    } finally {
      const ms = Math.round(performance.now() - t0);
      const s = status;
      if (hasDatabase()) after(() => rpc("log_api", { p_route: route, p_status: s, p_ms: ms }).catch(() => {}));
    }
  };
}

export type OpsKind = "error" | "webhook" | "upload" | "client_error" | "export" | "report";

/** A line in the operations log (after the response). */
export function opsLog(
  kind: OpsKind,
  ok: boolean,
  o: { route?: string; status?: number; ms?: number; message?: string; meta?: Record<string, unknown> } = {},
) {
  if (!hasDatabase()) return;
  const write = () =>
    rpc("log_ops", {
      p_kind: kind,
      p_ok: ok,
      p_route: o.route ?? null,
      p_status: o.status ?? null,
      p_ms: o.ms ?? null,
      p_message: o.message?.slice(0, 500) ?? null,
      p_meta: o.meta ?? {},
    }).catch(() => {});
  try {
    after(write);
  } catch {
    /* outside a request (a script or cron helper): write now */
    void write();
  }
}

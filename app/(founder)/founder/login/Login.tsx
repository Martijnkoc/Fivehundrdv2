"use client";

import { useEffect, useState, type FormEvent } from "react";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/* Supabase is loaded only here, only when needed (implicit flow: the link works in any browser) */
const client = () =>
  import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(URL_, KEY, { auth: { persistSession: false, detectSessionInUrl: true, flowType: "implicit", storageKey: "fh-cr-auth" } }),
  );

/**
 * Sign in to the Control Room with an email link. The link comes back here;
 * the server checks the address against FOUNDER_EMAILS and sets its own
 * session cookie. The Supabase session itself isn't kept.
 */
export function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!/access_token/.test(location.hash)) {
      if (/error_description/.test(location.hash)) setMsg({ text: "That link has expired. Ask for a new one.", err: true });
      return;
    }
    setMsg({ text: "Signing you in…" });
    (async () => {
      const sb = await client();
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      history.replaceState(null, "", location.pathname);
      const r = await fetch("/api/founder/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      if (r.ok) location.replace("/founder");
      else setMsg({ text: "This address doesn't have access to the Control Room.", err: true });
    })();
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!URL_ || !KEY) return setMsg({ text: "Sign-in isn't configured on this deployment.", err: true });
    setBusy(true);
    const sb = await client();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/founder/login" } });
    setBusy(false);
    setMsg(error ? { text: error.status === 429 ? "Too many links. Try again in a minute." : "That didn't work. Check the address.", err: true } : { text: "Check your inbox for the sign-in link." });
  };

  return (
    <div className="login">
      <div className="card">
        <b style={{ font: "600 20px var(--serif)" }}>
          Fivehundrd<i style={{ color: "var(--pink)", fontStyle: "normal" }}>.</i>
        </b>{" "}
        <span className="badge">Control Room</span>
        <h1>Sign in</h1>
        <p>For the founding team only. We&apos;ll email you a link.</p>
        <form onSubmit={send}>
          <label className="sr" htmlFor="em">
            Email
          </label>
          <input id="em" type="email" required autoComplete="email" placeholder="you@fivehundrd.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Email me a link"}
          </button>
          {msg && (
            <p className={`msg${msg.err ? " err" : ""}`} role="status">
              {msg.text}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

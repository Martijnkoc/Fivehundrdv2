"use client";

import { Fragment, useRef, useState, useSyncExternalStore } from "react";
import { bridge, wallStore } from "./store";

/* Whitespace text nodes as in the reference's templates. */
const ws = (indent: number) => "\n" + " ".repeat(indent);

export type ShareData = { title: string; text: string; url: string };
export type ShareView = { kind: "share"; data: ShareData } | { kind: "keep" };

/** §15: the share fallback when there is no native share sheet. */
function Share({ d }: { d: ShareData }) {
  const t = encodeURIComponent(d.text + " " + d.url);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(d.url);
      bridge.toast("Link copied");
    } catch {
      bridge.toast(d.url);
    }
  };
  return (
    <>
      <button className="x" aria-label="Close" data-close="">
        &times;
      </button>
      <h2 id="shareH">Share this spot</h2>
      <p className="sub">{d.title}</p>
      {ws(2)}
      <div className="sharelist">
        {ws(4)}
        <a href={`https://wa.me/?text=${t}`} target="_blank" rel="noopener">
          WhatsApp
        </a>
        {ws(4)}
        <a href={`https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.text)}`} target="_blank" rel="noopener">
          Telegram
        </a>
        {ws(4)}
        <a href={`https://x.com/intent/post?text=${t}`} target="_blank" rel="noopener">
          X
        </a>
        {ws(4)}
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(d.url)}`} target="_blank" rel="noopener">
          Facebook
        </a>
        {ws(4)}
        <a href={`mailto:?subject=${encodeURIComponent(d.title)}&body=${t}`}>Email</a>
        {ws(4)}
        <button data-copy="" onClick={copy}>
          Copy link
        </button>
        {ws(2)}
      </div>
    </>
  );
}

/** §12: Keep my card. Browsing and saving never need this. */
function Keep() {
  const email = useRef<HTMLInputElement>(null);
  const remind = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const login = (via: string) => {
    if (via === "email") {
      const v = email.current!.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        setErr("That email address doesn't look right. Check it and try again.");
        return;
      }
      bridge.actions.keepCard(v, remind.current!.checked, true);
    } else bridge.actions.keepCard(via, remind.current!.checked, false);
  };
  return (
    <>
      <button className="x" aria-label="Close" data-close="">
        &times;
      </button>
      {ws(2)}
      <h2 id="shareH">Keep your card</h2>
      {ws(2)}
      <p className="sub">Log in to keep your saves on every device. Browsing the wall never needs an account.</p>
      {ws(2)}
      <div className="sharelist">
        {ws(4)}
        <button data-login="Google" onClick={() => login("Google")}>
          Continue with Google
        </button>
        {ws(4)}
        <button data-login="Apple" onClick={() => login("Apple")}>
          Continue with Apple
        </button>
        {ws(2)}
      </div>
      {ws(2)}
      <div className="f" style={{ marginTop: 14 }}>
        <label htmlFor="kEmail">Or get a link by email</label>
        <input ref={email} type="text" id="kEmail" inputMode="email" autoComplete="email" placeholder="you@example.com" />
      </div>
      {ws(2)}
      <button className="pay" data-login="email" onClick={() => login("email")}>
        Email me a link
      </button>
      {ws(2)}
      <label className="remind">
        <input ref={remind} type="checkbox" id="kRemind" defaultChecked />
        {" Remind me an hour before a saved spot ends"}
      </label>
      {ws(2)}
      <p className="err" id="kErr" role="alert">
        {err}
      </p>
      {ws(2)}
      <p className="fine">Prototype. No account is created.</p>
    </>
  );
}

/** The content of #shareSheet; rebuilt on every open, like innerHTML. */
export function ShareContent() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  if (!st.share) return null;
  return <Fragment key={st.shareVersion}>{st.share.kind === "keep" ? <Keep /> : <Share d={st.share.data} />}</Fragment>;
}

/** The status toast; its text stays after it fades, as in the reference. */
export function Toast() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  return (
    <div className={st.toast.on ? "toast on" : "toast"} id="toast" role="status">
      {st.toast.msg}
    </div>
  );
}

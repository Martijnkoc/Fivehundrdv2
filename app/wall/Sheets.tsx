"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FilledSpot } from "../../lib/wall/model";
import { FORMATS, cardFileName, shareCardBlob, type ShareFormat } from "./shareCard";
import { bridge, wallStore } from "./store";

/* Whitespace text nodes as in the reference's templates. */
const ws = (indent: number) => "\n" + " ".repeat(indent);

export type ShareData = { title: string; text: string; url: string };
export type ShareView = { kind: "share"; data: ShareData; spot: FilledSpot } | { kind: "keep" } | { kind: "report"; id: string; name: string };

/** §15: share a spot. The card is the spot itself (the wall's tile), ready to post, with its lasting link. */
function Share({ d, spot }: { d: ShareData; spot: FilledSpot }) {
  const [format, setFormat] = useState<ShareFormat>(() => (matchMedia("(max-width:699px)").matches ? "story" : "square"));
  const [card, setCard] = useState<{ format: ShareFormat; blob: Blob; url: string } | "failed" | null>(null);
  useEffect(() => {
    let live = true;
    shareCardBlob(spot, d.url, format).then(
      (blob) => live && setCard({ format, blob, url: URL.createObjectURL(blob) }),
      () => live && setCard("failed"),
    );
    return () => {
      live = false;
    };
  }, [spot, d.url, format]);
  useEffect(() => () => void (card && card !== "failed" && URL.revokeObjectURL(card.url)), [card]);

  const t = encodeURIComponent(d.text + " " + d.url);
  const blob = card && card !== "failed" && card.format === format ? card.blob : null;
  const file = blob ? new File([blob], cardFileName(spot, format), { type: "image/png" }) : null;
  const canShareFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const canCopyImage = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  const copyLink = async (quiet = false) => {
    try {
      await navigator.clipboard.writeText(d.url);
      if (!quiet) bridge.toast("Link copied");
      return true;
    } catch {
      if (!quiet) bridge.toast(d.url);
      return false;
    }
  };
  const download = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = cardFileName(spot, format);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const shareFile = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: d.title, text: `${d.text} ${d.url}` });
    } catch (e) {
      if ((e as Error).name !== "AbortError") bridge.toast("Sharing didn't work here. Save the card instead.");
    }
  };
  const copyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      bridge.toast("Card copied");
    } catch {
      bridge.toast("Couldn't copy the image here. Save it instead.");
    }
  };
  /* Instagram and TikTok take the image from your photos and the link as a sticker */
  const forStories = async () => {
    const copied = await copyLink(true);
    if (canShareFile) await shareFile();
    else download();
    bridge.toast(copied ? "Card saved and link copied. Add it as a link sticker." : "Card saved. Add the link as a sticker.");
  };

  return (
    <>
      <button className="x" aria-label="Close" data-close="">
        &times;
      </button>
      <h2 id="shareH">Share this spot</h2>
      <p className="sub">{d.title}</p>
      <div className="sc-pick" role="tablist" aria-label="Card size">
        {(Object.keys(FORMATS) as ShareFormat[]).map((k) => (
          <button key={k} role="tab" aria-selected={format === k} className="chip" aria-pressed={format === k} onClick={() => setFormat(k)}>
            {FORMATS[k].label}
            <small>{FORMATS[k].hint}</small>
          </button>
        ))}
      </div>
      <div className={`sc-preview sc-preview-${format}`}>
        {card === "failed" ? (
          <p className="sub">The card couldn&apos;t be printed in this browser. Share the link instead.</p>
        ) : blob && card ? (
          <img src={card.url} alt={`Share card for ${spot.name}`} />
        ) : (
          <p className="sub">Printing your card…</p>
        )}
      </div>
      <div className="sc-actions">
        {canShareFile ? (
          <button className="pay" onClick={shareFile} disabled={!blob}>
            Share card
          </button>
        ) : (
          <button className="pay" onClick={download} disabled={!blob}>
            Save card
          </button>
        )}
        <div className="sc-row">
          <button className="act" data-copy="" onClick={() => copyLink()}>
            Copy link
          </button>
          {canCopyImage && (
            <button className="act" onClick={copyImage} disabled={!blob}>
              Copy image
            </button>
          )}
          {canShareFile && (
            <button className="act" onClick={download} disabled={!blob}>
              Save card
            </button>
          )}
          <button className="act" onClick={forStories} disabled={!blob}>
            For Instagram &amp; TikTok
          </button>
        </div>
      </div>
      <div className="sharelist">
        <a href={`https://wa.me/?text=${t}`} target="_blank" rel="noopener">
          WhatsApp
        </a>
        <a href={`https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.text)}`} target="_blank" rel="noopener">
          Telegram
        </a>
        <a href={`https://x.com/intent/post?text=${t}`} target="_blank" rel="noopener">
          X
        </a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(d.url)}`} target="_blank" rel="noopener">
          Facebook
        </a>
        <a href={`mailto:?subject=${encodeURIComponent(d.title)}&body=${t}`}>Email</a>
      </div>
    </>
  );
}

/** Google's "G" mark, in its four brand colours. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" data-mark="google">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Apple's logo, in the text colour (black on light, white on dark, per Apple's guidelines). */
function AppleMark() {
  return (
    <svg viewBox="0 0 814 1000" aria-hidden="true" data-mark="apple">
      <path
        fill="currentColor"
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 136.5-71.3z"
      />
    </svg>
  );
}

const REPORT_REASONS = [
  ["sexual", "Sexual content or nudity"],
  ["child", "Puts a child at risk"],
  ["scam", "Scam, phishing or fake"],
  ["hate", "Hate or harassment"],
  ["violence", "Violence or self-harm"],
  ["illegal", "Illegal goods or activity"],
  ["copyright", "Uses my work without permission"],
  ["spam", "Spam or misleading"],
  ["other", "Something else"],
] as const;

/** Reporting a live story: a person looks at every report. */
function Report({ id, name }: { id: string; name: string }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!reason) return setErr("Pick what's wrong.");
    setSending(true);
    const problem = await bridge.actions.report(id, reason, note.trim(), email.trim());
    if (problem) {
      setErr(problem);
      setSending(false);
    }
  };
  return (
    <>
      <button className="x" aria-label="Close" data-close="">
        &times;
      </button>
      <h2 id="shareH">Report this story</h2>
      <p className="sub">{`What's wrong with ${name}? A person looks at every report.`}</p>
      <div className="reasons" role="radiogroup" aria-label="What's wrong">
        {REPORT_REASONS.map(([k, label]) => (
          <label key={k} className="reason">
            <input type="radio" name="reportReason" value={k} checked={reason === k} onChange={() => setReason(k)} />
            {label}
          </label>
        ))}
      </div>
      <div className="f">
        <label htmlFor="rNote">
          More detail <span className="hint">(optional)</span>
        </label>
        <textarea id="rNote" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 70 }} />
      </div>
      <div className="f">
        <label htmlFor="rEmail">
          Your email <span className="hint">(optional, if we may follow up)</span>
        </label>
        <input type="text" id="rEmail" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <p className="err" role="alert">
        {err}
      </p>
      <button className="pay" onClick={send} disabled={sending}>
        {sending ? "Sending…" : "Send report"}
      </button>
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
        <button className="login" data-login="Google" onClick={() => login("Google")}>
          <GoogleMark />
          <span>Continue with Google</span>
        </button>
        {ws(4)}
        <button className="login" data-login="Apple" onClick={() => login("Apple")}>
          <AppleMark />
          <span>Continue with Apple</span>
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
  const v = st.share;
  return (
    <Fragment key={st.shareVersion}>
      {v.kind === "keep" ? <Keep /> : v.kind === "report" ? <Report id={v.id} name={v.name} /> : <Share d={v.data} spot={v.spot} />}
    </Fragment>
  );
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

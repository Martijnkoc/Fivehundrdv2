/*
 * §8 preview player: real clips for uploads, and (prototype and fixture only)
 * a seeded WebAudio synth so demo tiles have something audible. The brief:
 * "The WebAudio synth generator must not ship" — production spots always
 * have a real clip, so it only ever plays for demo data.
 *
 * The player UI is React (Cover.tsx); this drives its "playing" class, the
 * waveform progress (--p) and the time counter while a preview plays.
 */
import { rng, type FilledSpot } from "../../lib/wall/model";

type Player = {
  root: HTMLElement;
  a?: HTMLAudioElement;
  m?: GainNode;
  pos: () => number;
  dur: () => number;
  raf?: number;
};

let AC: AudioContext | null = null,
  player: Player | null = null,
  NOISE: AudioBuffer | null = null;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const mmss = (t: number) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");

function tone(out: AudioNode, f: number, at: number, dur: number, type: OscillatorType, vol: number, att = 0.01) {
  const o = AC!.createOscillator(),
    g = AC!.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + att);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function noise(out: AudioNode, at: number, dur: number, vol: number, type: BiquadFilterType, freq: number) {
  const n = AC!.createBufferSource();
  n.buffer = NOISE;
  const f = AC!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = AC!.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  n.connect(f).connect(g).connect(out);
  n.start(at);
  n.stop(at + dur + 0.02);
}

function kick(out: AudioNode, at: number) {
  const o = AC!.createOscillator(),
    g = AC!.createGain();
  o.frequency.setValueAtTime(120, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
  g.gain.setValueAtTime(0.8, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 0.35);
}

/** 30 seconds of seeded music (or a podcast bed) from `off` seconds in. */
function scheduleSynth(s: FilledSpot, out: AudioNode, now: number, off: number) {
  const ac = AC!;
  if (!NOISE) {
    NOISE = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = NOISE.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const r = rng(s.seed),
    pod = s.lane === "podcasts",
    bpm = pod ? 84 : 68 + Math.floor(r() * 56),
    b = 60 / bpm,
    minor = r() < 0.6;
  const sc = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11],
    root = 45 + Math.floor(r() * 9);
  const prog = [
    [0, 5, 3, 4],
    [0, 3, 4, 4],
    [5, 3, 0, 4],
    [0, 4, 5, 3],
    [0, 2, 5, 4],
  ][Math.floor(r() * 5)];
  const semi = (d: number) => sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = pod ? 900 : 1400;
  lp.connect(out);
  const lead = (["triangle", "sine", "square"] as const)[Math.floor(r() * 3)],
    drums = !pod && r() < 0.85,
    swing = r() * 0.08;
  for (let beat = 0; beat * b < 30; beat++) {
    const t = beat * b;
    if (t < off - 0.01) continue;
    const at = now + (t - off),
      br = rng(s.seed + beat * 31),
      bar = Math.floor(beat / 4),
      deg = prog[bar % 4];
    if (beat % 4 === 0 || (t - off < 0.01 && beat % 4)) {
      const len = (4 - (beat % 4)) * b;
      [0, 2, 4].forEach((k) => tone(lp, mtof(root + 12 + semi(deg + k)), at, len, "triangle", pod ? 0.05 : 0.045, 0.25));
    }
    if (beat % 2 === 0) tone(lp, mtof(root - 12 + semi(deg)), at, b * 1.6, "sine", 0.22, 0.02);
    if (drums) {
      if (beat % 4 === 0 || (beat % 4 === 2 && br() < 0.5)) kick(out, at);
      if (beat % 4 === 1 || beat % 4 === 3) noise(out, at, 0.16, 0.22, "bandpass", 1800);
      noise(out, at, 0.04, 0.05, "highpass", 7000);
      noise(out, at + b / 2 + swing * b, 0.04, 0.035, "highpass", 7000);
    }
    for (let k = 0; k < 2; k++)
      if (br() < (pod ? 0.18 : 0.34) && bar > 0) {
        const d = deg + [0, 2, 4, 5, 7][Math.floor(br() * 5)];
        tone(lp, mtof(root + 24 + semi(d)), at + (k * b) / 2, b * (0.4 + br() * 0.6), lead, lead === "square" ? 0.025 : 0.06);
      }
  }
}

export function stopAudio() {
  if (!player) return;
  const p = player;
  player = null;
  if (p.raf) cancelAnimationFrame(p.raf);
  if (p.a) p.a.pause();
  if (p.m) {
    const m = p.m;
    try {
      m.gain.cancelScheduledValues(AC!.currentTime);
      m.gain.setTargetAtTime(0.0001, AC!.currentTime, 0.04);
    } catch {}
    setTimeout(() => m.disconnect(), 300);
  }
  p.root.classList.remove("playing");
  p.root.style.setProperty("--p", "0%");
  const t = p.root.querySelector("[data-ptime]");
  if (t) t.textContent = "0:00 / " + mmss(p.a ? Math.min(30, p.a.duration || 30) : 30);
}

/** Plays `s`'s preview in the player `root`, from `off` seconds. */
export function startPlay(root: HTMLElement, s: FilledSpot, off: number, onUnavailable: () => void) {
  stopAudio();
  root.classList.add("playing");
  if (s.audio) {
    const a = new Audio(s.audio);
    a.currentTime = off;
    a.play().catch(() => {});
    a.onended = stopAudio;
    player = { root, a, pos: () => a.currentTime, dur: () => Math.min(30, a.duration || 30) };
  } else {
    try {
      AC = AC || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      AC.resume();
    } catch {
      onUnavailable();
      root.classList.remove("playing");
      return;
    }
    const ac = AC;
    const m = ac.createGain();
    m.gain.setValueAtTime(0.0001, ac.currentTime);
    m.gain.exponentialRampToValueAtTime(0.55, ac.currentTime + 0.3);
    m.connect(ac.destination);
    scheduleSynth(s, m, ac.currentTime + 0.05, off);
    const t0 = ac.currentTime + 0.05 - off;
    player = { root, m, pos: () => Math.max(off, ac.currentTime - t0), dur: () => 30 };
  }
  const tick = () => {
    if (!player || player.root !== root) return;
    const p = player.pos(),
      d = player.dur();
    if (p >= d - 0.05) {
      stopAudio();
      return;
    }
    root.style.setProperty("--p", (p / d) * 100 + "%");
    root.querySelector("[data-ptime]")!.textContent = mmss(p) + " / " + mmss(d);
    player.raf = requestAnimationFrame(tick);
  };
  tick();
}

export function togglePlay(root: HTMLElement, s: FilledSpot, onUnavailable: () => void) {
  if (player && player.root === root) {
    stopAudio();
    return;
  }
  startPlay(root, s, 0, onUnavailable);
}

/** Whether a preview is playing inside `el` (the Create preview stops it on input). */
export const playingIn = (el: Element | null) => !!player && !!el && el.contains(player.root);

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => document.hidden && stopAudio());

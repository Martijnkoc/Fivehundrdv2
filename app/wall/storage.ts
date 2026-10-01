/*
 * The wall's memory in this browser (localStorage). It can be full, blocked
 * or missing (private windows, some in-app browsers): reads then give the
 * fallback and writes do nothing, so the wall always works without it.
 */
export function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** A plain string (a flag or a day), not JSON. */
export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function drop(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

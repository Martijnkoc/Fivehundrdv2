import { randomUUID } from "node:crypto";
import { env, hasDatabase, ipHash, json, rpc, storage } from "../../../lib/server/backend";
import { measured, opsLog } from "../../../lib/server/ops";

/* What the Create form may upload (§13): shrunk artwork and logos, and a short audio clip. */
const TYPES: Record<string, { bucket: "art" | "audio"; ext: string; max: number }> = {
  "image/jpeg": { bucket: "art", ext: "jpg", max: 5e6 },
  "image/png": { bucket: "art", ext: "png", max: 5e6 },
  "image/webp": { bucket: "art", ext: "webp", max: 5e6 },
  "image/gif": { bucket: "art", ext: "gif", max: 5e6 },
  "audio/mpeg": { bucket: "audio", ext: "mp3", max: 4e6 },
  "audio/mp4": { bucket: "audio", ext: "m4a", max: 4e6 },
  "audio/x-m4a": { bucket: "audio", ext: "m4a", max: 4e6 },
  "audio/aac": { bucket: "audio", ext: "aac", max: 4e6 },
  "audio/wav": { bucket: "audio", ext: "wav", max: 4e6 },
  "audio/x-wav": { bucket: "audio", ext: "wav", max: 4e6 },
  "audio/ogg": { bucket: "audio", ext: "ogg", max: 4e6 },
  "audio/webm": { bucket: "audio", ext: "webm", max: 4e6 },
};

/**
 * Hands out a one-time upload link for a draft file (pending/<random>.<ext>).
 * At most 15 an hour per person; files nobody paid for are cleaned up daily.
 */
export const POST = measured("/api/uploads", async (req: Request) => {
  if (!hasDatabase() || !env.supabaseSecret) return json({ error: "Uploads aren't open yet." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { type?: string; size?: number };
  const t = TYPES[String(b.type)];
  if (!t) return json({ error: "That file type isn't supported. Try a JPG, PNG or MP3." }, { status: 400 });
  if (!(Number(b.size) > 0) || Number(b.size) > t.max)
    return json({ error: t.bucket === "audio" ? "That audio file is over 4 MB." : "That image is over 5 MB." }, { status: 400 });
  try {
    if (!(await rpc<boolean>("issue_upload", { p_ip_hash: ipHash(req) })))
      return json({ error: "Too many uploads. Try again in an hour." }, { status: 429 });
    const path = `pending/${randomUUID()}.${t.ext}`;
    const { data, error } = await storage().from(t.bucket).createSignedUploadUrl(path);
    if (error || !data) throw error;
    return json({ bucket: t.bucket, path, token: data.token });
  } catch (e) {
    opsLog("upload", false, { route: "/api/uploads", status: 502, message: e instanceof Error ? e.message : "upload link failed" });
    return json({ error: "Your files couldn't be uploaded. Try again." }, { status: 502 });
  }
});

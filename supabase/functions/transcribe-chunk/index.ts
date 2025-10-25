// Receives small audio chunks (binary body), forwards to Groq Whisper API,
// stores transcript lines, and returns text. Requires secrets:
// - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for DB write)
// - GROQ_API_KEY
// Usage: POST /transcribe-chunk?roomId=...&chunkId=...&seq=...

import { corsHeaders, getAuthUser, json, serviceClient } from "../_shared/supabaseClient.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo"; // fast, pruned

async function transcribeBinaryWebm(blob: Uint8Array, filename: string) {
  if (!GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");

  const form = new FormData();
  form.append("model", MODEL);
  // Ask for verbose_json to optionally include timings
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  const file = new File([blob], filename, { type: "audio/webm" });
  form.append("file", file);

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq error: ${res.status} ${txt}`);
  }
  const data = await res.json();
  // data.text (string); data.segments? (array with start/end)
  return data as { text: string; segments?: Array<{ start: number; end: number; text: string }>; };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const user = await getAuthUser(req);
    if (!user) return json({ error: "unauthorized" }, { status: 401 });
    const url = new URL(req.url);
    const roomId = url.searchParams.get("roomId");
    const chunkId = url.searchParams.get("chunkId") ?? crypto.randomUUID();
    const seqStr = url.searchParams.get("seq") ?? "0";
    const seq = parseInt(seqStr, 10) || 0;
    if (!roomId) return json({ error: "roomId required" }, { status: 400 });

    const blob = new Uint8Array(await req.arrayBuffer());
    if (!blob || blob.byteLength === 0) return json({ error: "empty body" }, { status: 400 });

    const result = await transcribeBinaryWebm(blob, `${chunkId}.webm`);
    const supa = serviceClient();

    // Persist transcript line; use first segment timing if available
    const startMs = result.segments && result.segments[0] ? Math.round(result.segments[0].start * 1000) : null;
    const endMs = result.segments && result.segments[result.segments.length - 1]
      ? Math.round(result.segments[result.segments.length - 1].end * 1000)
      : null;

    await supa.from("transcripts").insert({
      room_id: roomId,
      uid: user.id,
      chunk_id: chunkId,
      seq,
      start_ms: startMs,
      end_ms: endMs,
      text: result.text ?? "",
    });

    return json({ text: result.text, chunkId, seq, startMs, endMs });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
});

import { corsHeaders, getAuthUser, json, readJson, serviceClient } from "../_shared/supabaseClient.ts";

type Body = { roomId?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  const { roomId } = await readJson<Body>(req);
  if (!roomId) return json({ error: "roomId required" }, { status: 400 });
  const supa = serviceClient();

  const { data: parts, error: perr } = await supa.from("participants").select("uid").eq("room_id", roomId);
  if (perr) return json({ error: perr.message }, { status: 400 });
  if (!parts || parts.length === 0) return json({ error: "no participants" }, { status: 404 });

  const rows = parts.map((p) => ({ room_id: roomId, uid: p.uid, provider: "elevenlabs", status: "queued", voice_id: null }));
  const { error: cerr } = await supa.from("clones").upsert(rows);
  if (cerr) return json({ error: cerr.message }, { status: 400 });
  const { error: rerr } = await supa.from("rooms").update({ status: "processing" }).eq("id", roomId);
  if (rerr) return json({ error: rerr.message }, { status: 400 });
  return json({ ok: true });
});

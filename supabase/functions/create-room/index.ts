import { corsHeaders, getAuthUser, json, readJson, serviceClient } from "../_shared/supabaseClient.ts";

type Body = { roomId?: string; displayName?: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  const { roomId, displayName } = await readJson<Body>(req);
  if (!roomId) return json({ error: "roomId required" }, { status: 400 });

  const supa = serviceClient();
  // Create room
  const { error: roomErr } = await supa.from("rooms").insert({
    id: roomId,
    code: roomId,
    created_by: user.id,
    status: "lobby",
  });
  if (roomErr && roomErr.code !== "23505") { // ignore duplicate inserts
    return json({ error: roomErr.message }, { status: 400 });
  }
  // Upsert participant
  const { error: partErr } = await supa.from("participants").upsert({
    room_id: roomId,
    uid: user.id,
    display_name: displayName ?? user.user_metadata?.name ?? null,
    role: null,
    is_ready: false,
    guess_used: false,
  });
  if (partErr) return json({ error: partErr.message }, { status: 400 });

  return json({ roomId });
});

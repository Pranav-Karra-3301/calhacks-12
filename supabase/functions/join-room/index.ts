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

  // Ensure room exists
  const { data: room, error: rerr } = await supa.from("rooms").select("id").eq("id", roomId).single();
  if (rerr || !room) return json({ error: "room not found" }, { status: 404 });

  // Check participant count
  const { count, error: cntErr } = await supa
    .from("participants")
    .select("*", { head: true, count: "exact" })
    .eq("room_id", roomId);
  if (cntErr) return json({ error: cntErr.message }, { status: 400 });
  if ((count ?? 0) >= 2) {
    // But allow re-join if already present
    const { data: existing } = await supa.from("participants").select("uid").eq("room_id", roomId).eq("uid", user.id).maybeSingle();
    if (!existing) return json({ error: "room is full" }, { status: 409 });
  }

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

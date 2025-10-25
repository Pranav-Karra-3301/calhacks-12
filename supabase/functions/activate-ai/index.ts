import { getAuthUser, json, readJson, serviceClient } from "../_shared/supabaseClient.ts";

type Body = { roomId?: string };

Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  const { roomId } = await readJson<Body>(req);
  if (!roomId) return json({ error: "roomId required" }, { status: 400 });
  const supa = serviceClient();

  const { data: room, error: rerr } = await supa.from("rooms").select("target_uid").eq("id", roomId).single();
  if (rerr || !room) return json({ error: "room not found" }, { status: 404 });
  if (room.target_uid !== user.id) return json({ error: "only target can activate" }, { status: 403 });

  const { error: uerr } = await supa.from("rooms").update({ ai_activated_at: new Date() }).eq("id", roomId);
  if (uerr) return json({ error: uerr.message }, { status: 400 });
  const { error: eerr } = await supa.from("events").insert({ room_id: roomId, type: "ai-activated", uid: user.id });
  if (eerr) return json({ error: eerr.message }, { status: 400 });
  return json({ ok: true });
});


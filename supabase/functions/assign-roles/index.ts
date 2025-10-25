import { getAuthUser, json, readJson, serviceClient } from "../_shared/supabaseClient.ts";

type Body = { roomId?: string };

Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  const { roomId } = await readJson<Body>(req);
  if (!roomId) return json({ error: "roomId required" }, { status: 400 });

  const supa = serviceClient();
  const { data: parts, error: perr } = await supa
    .from("participants")
    .select("uid")
    .eq("room_id", roomId);
  if (perr) return json({ error: perr.message }, { status: 400 });
  if (!parts || parts.length !== 2) return json({ error: "need exactly 2 players" }, { status: 409 });

  const { data: room, error: rerr } = await supa.from("rooms").select("created_by").eq("id", roomId).single();
  if (rerr || !room) return json({ error: "room not found" }, { status: 404 });

  const hostUid = room.created_by;
  const hostInRoom = parts.find((p) => p.uid === hostUid);
  const targetUid = hostInRoom ? hostUid : parts[0].uid;
  const detectorUid = parts.find((p) => p.uid !== targetUid)?.uid;
  if (!detectorUid) return json({ error: "unable to assign roles" }, { status: 409 });

  const { error: u1 } = await supa
    .from("rooms")
    .update({ status: "talk", target_uid: targetUid, detector_uid: detectorUid, started_at: new Date() })
    .eq("id", roomId);
  if (u1) return json({ error: u1.message }, { status: 400 });
  const { error: u2 } = await supa.from("participants").update({ role: "target" }).eq("room_id", roomId).eq("uid", targetUid);
  if (u2) return json({ error: u2.message }, { status: 400 });
  const { error: u3 } = await supa.from("participants").update({ role: "detector" }).eq("room_id", roomId).eq("uid", detectorUid);
  if (u3) return json({ error: u3.message }, { status: 400 });

  return json({ targetUid, detectorUid });
});

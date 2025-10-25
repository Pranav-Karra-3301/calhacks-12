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

  const ids = parts.map((p) => p.uid);
  const targetUid = ids[Math.floor(Math.random() * 2)];
  const detectorUid = ids.find((id) => id !== targetUid)!;

  const { error: u1 } = await supa.from("rooms").update({ status: "setup", target_uid: targetUid, detector_uid: detectorUid }).eq("id", roomId);
  if (u1) return json({ error: u1.message }, { status: 400 });
  const { error: u2 } = await supa.from("participants").update({ role: "target" }).eq("room_id", roomId).eq("uid", targetUid);
  if (u2) return json({ error: u2.message }, { status: 400 });
  const { error: u3 } = await supa.from("participants").update({ role: "detector" }).eq("room_id", roomId).eq("uid", detectorUid);
  if (u3) return json({ error: u3.message }, { status: 400 });

  return json({ targetUid, detectorUid });
});


import { getAuthUser, json, readJson, serviceClient } from "../_shared/supabaseClient.ts";

type Body = { roomId?: string };

Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  const { roomId } = await readJson<Body>(req);
  if (!roomId) return json({ error: "roomId required" }, { status: 400 });
  const supa = serviceClient();

  const { data: room, error: rerr } = await supa.from("rooms").select("detector_uid, ai_activated_at").eq("id", roomId).single();
  if (rerr || !room) return json({ error: "room not found" }, { status: 404 });
  if (room.detector_uid !== user.id) return json({ error: "only detector can guess" }, { status: 403 });

  // Check if guess already used
  const { data: det, error: derr } = await supa
    .from("participants")
    .select("guess_used")
    .eq("room_id", roomId)
    .eq("uid", user.id)
    .single();
  if (derr || !det) return json({ error: "participant not found" }, { status: 404 });
  if (det.guess_used) return json({ error: "guess already used" }, { status: 409 });

  const correct = !!room.ai_activated_at;
  const result = correct ? "detector_win" : "target_win";

  // Update atomically (best-effort sequential in Edge)
  const { error: u1 } = await supa
    .from("participants")
    .update({ guess_used: true, guess_at: new Date(), guess_correct: correct })
    .eq("room_id", roomId)
    .eq("uid", user.id);
  if (u1) return json({ error: u1.message }, { status: 400 });

  const { error: u2 } = await supa
    .from("rooms")
    .update({ status: "ended", ended_at: new Date(), result })
    .eq("id", roomId);
  if (u2) return json({ error: u2.message }, { status: 400 });

  const { error: e1 } = await supa
    .from("events")
    .insert({ room_id: roomId, type: "guess", uid: user.id, correct });
  if (e1) return json({ error: e1.message }, { status: 400 });

  return json({ correct });
});


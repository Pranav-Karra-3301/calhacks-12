import { getAuthUser, json, readJson, serviceClient } from "../_shared/supabaseClient.ts";

type Body = { roomId?: string };

Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  const { roomId } = await readJson<Body>(req);
  if (!roomId) return json({ error: "roomId required" }, { status: 400 });
  const supa = serviceClient();

  const { data: room, error: rerr } = await supa
    .from("rooms")
    .select("status, started_at, ai_activated_at, max_duration_sec")
    .eq("id", roomId)
    .single();
  if (rerr || !room) return json({ error: "room not found" }, { status: 404 });
  if (room.status === "ended") return json({ ended: true });

  const startedAt = room.started_at ? new Date(room.started_at) : null;
  const maxSec = room.max_duration_sec ?? 300;
  if (!startedAt) return json({ ended: false });
  const endTime = startedAt.getTime() + maxSec * 1000;
  if (Date.now() >= endTime) {
    const result = room.ai_activated_at ? "target_win" : "detector_win";
    const { error: uerr } = await supa
      .from("rooms")
      .update({ status: "ended", ended_at: new Date(), result })
      .eq("id", roomId);
    if (uerr) return json({ error: uerr.message }, { status: 400 });
    return json({ ended: true });
  }
  return json({ ended: false });
});


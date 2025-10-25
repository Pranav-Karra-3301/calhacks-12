"use client"
import { supabase } from "./supabase"

export async function fnCreateRoom(roomId: string, displayName?: string | null) {
  const { data, error } = await supabase.functions.invoke("create-room", {
    body: { roomId, displayName: displayName ?? null },
  })
  if (error) throw error
  return data as { roomId: string }
}

export async function fnJoinRoom(roomId: string, displayName?: string | null) {
  const { data, error } = await supabase.functions.invoke("join-room", {
    body: { roomId, displayName: displayName ?? null },
  })
  if (error) throw error
  return data as { roomId: string }
}

export async function fnAssignRoles(roomId: string) {
  const { data, error } = await supabase.functions.invoke("assign-roles", { body: { roomId } })
  if (error) throw error
  return data as { targetUid: string; detectorUid: string }
}

export async function fnStartCloneJobs(roomId: string) {
  const { data, error } = await supabase.functions.invoke("start-clone-jobs", { body: { roomId } })
  if (error) throw error
  return data as { ok: boolean }
}

export async function fnActivateAI(roomId: string) {
  const { data, error } = await supabase.functions.invoke("activate-ai", { body: { roomId } })
  if (error) throw error
  return data as { ok: boolean }
}

export async function fnDetectorGuess(roomId: string) {
  const { data, error } = await supabase.functions.invoke("detector-guess", { body: { roomId } })
  if (error) throw error
  return data as { correct: boolean }
}

export async function fnEndRoomIfTimeout(roomId: string) {
  const { data, error } = await supabase.functions.invoke("end-room-if-timeout", { body: { roomId } })
  if (error) throw error
  return data as { ended: boolean }
}


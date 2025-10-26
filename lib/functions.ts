"use client"
import { supabase, getAccessToken } from "./supabase"

async function callApi(endpoint: string, body: any) {
  const token = await getAccessToken()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(body),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  
  return await response.json()
}

export async function fnCreateRoom(roomId: string, displayName?: string | null) {
  const data = await callApi('/api/functions/create-room', { 
    roomId, 
    displayName: displayName ?? null 
  })
  return data as { roomId: string }
}

export async function fnJoinRoom(roomId: string, displayName?: string | null) {
  const data = await callApi('/api/functions/join-room', { 
    roomId, 
    displayName: displayName ?? null 
  })
  return data as { roomId: string }
}

export async function fnAssignRoles(roomId: string) {
  const data = await callApi('/api/functions/assign-roles', { roomId })
  return data as { targetUid: string; detectorUid: string }
}

export async function fnStartCloneJobs(roomId: string) {
  const { data, error } = await supabase.functions.invoke("start-clone-jobs", { body: { roomId } })
  if (error) throw error
  return data as { ok: boolean }
}

export async function fnActivateAI(roomId: string) {
  const data = await callApi('/api/functions/activate-ai', { roomId })
  return data as { ok: boolean }
}

export async function fnTakeBackControl(roomId: string, sessionId?: string | null) {
  const data = await callApi('/api/functions/take-back-control', {
    roomId,
    sessionId: sessionId ?? null
  })
  return data as {
    ok: boolean
    aiDurationMs: number
    totalDurationMs: number
    takebackCount: number
  }
}

export async function fnMarkIntro(roomId: string) {
  const data = await callApi('/api/functions/mark-intro', { roomId })
  return data as { ok: boolean; alreadyCompleted?: boolean }
}

export async function fnDetectorGuess(roomId: string) {
  const data = await callApi('/api/functions/detector-guess', { roomId })
  return data as { correct: boolean }
}

export async function fnEndCall(roomId: string, options?: { reason?: string; leaverUid?: string | null }) {
  const data = await callApi('/api/functions/end-call', {
    roomId,
    reason: options?.reason ?? null,
    leaverUid: options?.leaverUid ?? null,
  })
  return data as { ok: boolean; result?: string | null }
}

export async function fnEndRoomIfTimeout(roomId: string) {
  const { data, error } = await supabase.functions.invoke("end-room-if-timeout", { body: { roomId } })
  if (error) throw error
  return data as { ended: boolean }
}

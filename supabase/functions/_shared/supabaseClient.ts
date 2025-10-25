// Shared Supabase client helpers for Edge Functions
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await client.auth.getUser()
  if (error) return null
  return data.user
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    const body = await req.json()
    return body as T
  } catch {
    return {} as T
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}


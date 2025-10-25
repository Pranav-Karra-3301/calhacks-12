// Shared Supabase client helpers for Edge Functions
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN = Deno.env.get('EDGE_FUNCTION_ALLOWED_ORIGIN') || '*'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

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
  const headers = new Headers(corsHeaders)
  if (init.headers) {
    const extra = new Headers(init.headers as HeadersInit)
    extra.forEach((value, key) => headers.set(key, value))
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}

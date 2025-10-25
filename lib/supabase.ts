"use client"
import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export function functionsUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return url.replace('.supabase.co', '.functions.supabase.co')
}


"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { generateRoomId } from '@/lib/utils'
import { fnCreateRoom } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

export default function NewRoomRedirect() {
  const router = useRouter()
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) { router.replace('/auth/signin'); return }
      const id = generateRoomId()
      await fnCreateRoom(id, auth.user.user_metadata?.name ?? null)
      router.replace(`/r/${id}`)
    })()
  }, [router])
  return null
}

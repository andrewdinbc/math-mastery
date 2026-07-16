import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// POST: student picks a mascot or avatar from the ones their teacher has
// enabled. slot is 'mascot' or 'avatar'.
export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json()
    if (!body.characterId || !['mascot', 'avatar'].includes(body.slot)) {
      return Response.json({ error: 'characterId and slot (mascot|avatar) required' }, { status: 400 })
    }

    const column = body.slot === 'mascot' ? 'selected_mascot_id' : 'selected_avatar_id'
    const { error } = await supabaseAdmin.from('mastery_students').update({ [column]: body.characterId }).eq('id', user.id)
    if (error) throw error

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function GET() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 })

  const { data } = await supabaseAdmin.from('mastery_display_settings').select('*').eq('teacher_id', user.id).maybeSingle()
  return Response.json({
    settings: data || { teacher_id: user.id, score_display_mode: 'percentage', parent_show_scores: true, parent_show_feedback: true, parent_show_baseline: true },
  })
}

export async function POST(request) {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 })

  const body = await request.json()
  const row = {
    teacher_id: user.id,
    score_display_mode: body.score_display_mode,
    parent_show_scores: !!body.parent_show_scores,
    parent_show_feedback: !!body.parent_show_feedback,
    parent_show_baseline: !!body.parent_show_baseline,
    updated_at: new Date().toISOString(),
  }
  await supabaseAdmin.from('mastery_display_settings').upsert(row, { onConflict: 'teacher_id' })
  return Response.json({ settings: row })
}

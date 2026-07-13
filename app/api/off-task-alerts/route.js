import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function GET() {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 })

    const { data: students } = await supabaseAdmin.from('mastery_students').select('id, display_name, qr_code').eq('teacher_id', user.id)
    const studentIds = (students || []).map((s) => s.id)
    if (!studentIds.length) return Response.json({ alerts: [] })

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: alerts } = await supabaseAdmin
      .from('mastery_off_task_alerts')
      .select('id, student_id, reason, created_at')
      .in('student_id', studentIds)
      .gte('created_at', thirtyMinAgo)
      .order('created_at', { ascending: false })

    const studentMap = Object.fromEntries((students || []).map((s) => [s.id, s]))
    const enriched = (alerts || []).map((a) => ({ ...a, student: studentMap[a.student_id] }))

    return Response.json({ alerts: enriched })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

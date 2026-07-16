import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// GET: list characters. For a teacher session, returns ALL characters plus
// their enabled/disabled state (for the manager UI). For a student session
// (or ?qrCode=), returns only characters enabled for their teacher --
// opt-out model, a character with no override row is enabled by default.
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const qrCode = searchParams.get('qrCode')
  const type = searchParams.get('type') // optional filter: 'mascot' | 'avatar'

  try {
    let teacherId, isTeacherView = false

    if (qrCode) {
      const { data: student } = await supabaseAdmin.from('mastery_students').select('teacher_id').eq('qr_code', qrCode).maybeSingle()
      if (!student) return Response.json({ error: 'Code not recognized' }, { status: 404 })
      teacherId = student.teacher_id
    } else {
      const supabase = createServerComponentClient({ cookies })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

      const { data: student } = await supabaseAdmin.from('mastery_students').select('teacher_id').eq('id', user.id).maybeSingle()
      if (student) teacherId = student.teacher_id
      else { teacherId = user.id; isTeacherView = true }
    }

    let query = supabaseAdmin.from('mastery_characters').select('*').order('created_at', { ascending: true })
    if (type) query = query.eq('character_type', type)
    const { data: characters, error } = await query
    if (error) throw error

    const { data: overrides } = await supabaseAdmin.from('mastery_teacher_characters').select('character_id, enabled').eq('teacher_id', teacherId)
    const overrideMap = Object.fromEntries((overrides || []).map((o) => [o.character_id, o.enabled]))

    const withStatus = characters.map((c) => ({ ...c, enabled: overrideMap[c.id] ?? true }))
    const result = isTeacherView ? withStatus : withStatus.filter((c) => c.enabled)

    return Response.json({ characters: result })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST: teacher toggles a character on/off for their class.
export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json()
    if (!body.characterId || typeof body.enabled !== 'boolean') {
      return Response.json({ error: 'characterId and enabled required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('mastery_teacher_characters')
      .upsert({ teacher_id: user.id, character_id: body.characterId, enabled: body.enabled }, { onConflict: 'teacher_id,character_id' })

    if (error) throw error
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

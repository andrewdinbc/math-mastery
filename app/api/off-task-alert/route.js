import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function POST(request) {
  try {
    const { qrCode, reason } = await request.json()
    if (!qrCode) return Response.json({ error: 'qrCode required' }, { status: 400 })

    const { data: student } = await supabaseAdmin.from('mastery_students').select('id').eq('qr_code', qrCode).maybeSingle()
    if (!student) return Response.json({ error: 'Student not found' }, { status: 404 })

    await supabaseAdmin.from('mastery_off_task_alerts').insert({ student_id: student.id, reason: reason || 'unknown' })

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

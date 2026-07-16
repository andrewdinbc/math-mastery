import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// GET: student-facing (by qrCode, resolves teacher, no auth needed -- same
// pattern as /api/practice-home) OR teacher-facing (authenticated, their
// own upcoming events for the "manage events" UI).
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const qrCode = searchParams.get('qrCode')

  try {
    let teacherId

    if (qrCode) {
      const { data: student } = await supabaseAdmin
        .from('mastery_students')
        .select('teacher_id')
        .eq('qr_code', qrCode)
        .maybeSingle()
      if (!student) return Response.json({ error: 'Code not recognized' }, { status: 404 })
      teacherId = student.teacher_id
    } else {
      const supabase = createServerComponentClient({ cookies })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
      teacherId = user.id
    }

    const { data: events, error } = await supabaseAdmin
      .from('mastery_events')
      .select('id, title, description, event_date')
      .eq('teacher_id', teacherId)
      .gte('event_date', new Date().toISOString().slice(0, 10))
      .order('event_date', { ascending: true })
      .limit(20)

    if (error) throw error
    return Response.json({ events: events || [] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST: teacher-only, creates an event for their own students to see.
export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json()
    if (!body.title || !body.eventDate) {
      return Response.json({ error: 'title and eventDate required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('mastery_events')
      .insert([{ teacher_id: user.id, title: body.title, description: body.description || null, event_date: body.eventDate }])
      .select()
      .single()

    if (error) throw error
    return Response.json({ event: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// DELETE: teacher-only, removes an event they created.
export async function DELETE(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const { error } = await supabaseAdmin.from('mastery_events').delete().eq('id', id).eq('teacher_id', user.id)
    if (error) throw error
    return Response.json({ deleted: id })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

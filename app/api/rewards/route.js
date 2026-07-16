import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// GET: teacher's reward catalog (authenticated), or a student's earned
// rewards (?qrCode=... or authenticated student session).
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const qrCode = searchParams.get('qrCode')
  const mode = searchParams.get('mode') // 'earned' for a student's own earned rewards

  try {
    if (mode === 'earned') {
      let studentId
      if (qrCode) {
        const { data: student } = await supabaseAdmin.from('mastery_students').select('id').eq('qr_code', qrCode).maybeSingle()
        if (!student) return Response.json({ error: 'Code not recognized' }, { status: 404 })
        studentId = student.id
      } else {
        const supabase = createServerComponentClient({ cookies })
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
        studentId = user.id
      }

      const { data: earned, error } = await supabaseAdmin
        .from('mastery_student_rewards')
        .select('id, awarded_at, claimed, mastery_rewards(id, name, description, reward_type)')
        .eq('student_id', studentId)
        .order('awarded_at', { ascending: false })

      if (error) throw error
      return Response.json({ earned: earned || [] })
    }

    // Default: teacher's own reward catalog.
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: rewards, error } = await supabaseAdmin
      .from('mastery_rewards')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return Response.json({ rewards: rewards || [] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST: teacher creates a reward definition (badge or prize).
export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json()
    if (!body.name || !['badge', 'prize'].includes(body.rewardType)) {
      return Response.json({ error: 'name and rewardType (badge|prize) required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('mastery_rewards')
      .insert({
        teacher_id: user.id,
        name: body.name,
        description: body.description || null,
        reward_type: body.rewardType,
        token_cost: body.tokenCost || null,
      })
      .select()
      .single()

    if (error) throw error
    return Response.json({ reward: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// DELETE: teacher removes a reward from their catalog.
export async function DELETE(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })

    const { error } = await supabaseAdmin.from('mastery_rewards').delete().eq('id', id).eq('teacher_id', user.id)
    if (error) throw error
    return Response.json({ deleted: id })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

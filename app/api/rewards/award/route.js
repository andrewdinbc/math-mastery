import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// POST: teacher manually awards a reward from their catalog to a specific
// student -- the "going above and beyond" path Aj described, distinct
// from any future automatic/token-redeemed path.
export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json()
    if (!body.studentId || !body.rewardId) {
      return Response.json({ error: 'studentId and rewardId required' }, { status: 400 })
    }

    // Confirm the reward belongs to this teacher before awarding.
    const { data: reward } = await supabaseAdmin.from('mastery_rewards').select('id').eq('id', body.rewardId).eq('teacher_id', user.id).maybeSingle()
    if (!reward) return Response.json({ error: 'Reward not found' }, { status: 404 })

    const { data, error } = await supabaseAdmin
      .from('mastery_student_rewards')
      .insert({ student_id: body.studentId, reward_id: body.rewardId })
      .select()
      .single()

    if (error) throw error
    return Response.json({ awarded: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

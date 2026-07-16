import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// GET: token balance + recent history for the current student (desktop
// session) or a qrCode (mobile flow).
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const qrCode = searchParams.get('qrCode')

  try {
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

    const { data: transactions, error } = await supabaseAdmin
      .from('mastery_token_transactions')
      .select('amount, reason, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const balance = (transactions || []).reduce((sum, t) => sum + t.amount, 0)
    return Response.json({ balance, transactions: transactions || [] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

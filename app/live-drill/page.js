import { createClient } from '@supabase/supabase-js'
import LiveDrillFlow from '@/components/LiveDrillFlow'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Multiplication Drill - Mastery Studio',
}

// Public page, same pattern as app/practice/[microUnitId]/page.js -
// students have no login, the studentId in the query string (from their
// own QR link) is the only identifier, service-role client since there's
// no session to check RLS against.
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function LiveDrillPage({ searchParams }) {
  const studentId = searchParams?.student

  if (!studentId) {
    return <main style={{ padding: 32 }}>Missing student link - please scan the QR code again or ask your teacher for a new link.</main>
  }

  const { data: student } = await supabaseAdmin
    .from('mastery_students')
    .select('id')
    .eq('id', studentId)
    .single()

  if (!student) {
    return <main style={{ padding: 32 }}>This link doesn&apos;t match a valid student. Please ask your teacher for a new link.</main>
  }

  // Start the fact range from where their most recent live-drill session
  // left off (adaptive difficulty persists loosely across sessions, not
  // just within one), falling back to a gentle default for a first-timer.
  const { data: recentAttempts } = await supabaseAdmin
    .from('mastery_attempts')
    .select('raw_answers')
    .eq('student_id', studentId)
    .eq('submitted_via', 'online')
    .is('micro_unit_id', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const lastHistory = recentAttempts?.[0]?.raw_answers?.history
  const lastFactMax = lastHistory?.[lastHistory.length - 1]?.factMax

  const initialFactMax = lastFactMax || 6
  const initialFactMin = Math.max(1, initialFactMax - 4)

  return <LiveDrillFlow studentId={studentId} initialFactMin={initialFactMin} initialFactMax={initialFactMax} />
}

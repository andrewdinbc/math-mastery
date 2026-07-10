import { createClient } from '@supabase/supabase-js';
import PracticeFlow from '@/components/PracticeFlow';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Practice - Mastery Studio',
};

// Public page - students have no login (they're anonymous QR-linked rows,
// not Supabase Auth users, per the privacy design). The microUnitId +
// studentId in the URL are the only identifiers, both opaque UUIDs acting
// as bearer tokens. Uses the service-role client (bypassing RLS) rather
// than the session-based client, since there is no student session to
// check RLS against - this was the root cause of the original bug where
// scanning a QR code redirected back to /dashboard (it was checking for a
// TEACHER login that students never have).
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function PracticePage({ params, searchParams }) {
  const studentId = searchParams?.student;

  if (!studentId) {
    return <main style={{ padding: 32 }}>Missing student link - please scan the QR code again or ask your teacher for a new link.</main>;
  }

  const { data: microUnit, error: unitErr } = await supabaseAdmin
    .from('micro_units')
    .select('*')
    .eq('id', params.microUnitId)
    .single();

  if (unitErr || !microUnit) {
    return <main style={{ padding: 32 }}>This practice unit could not be found. Please ask your teacher for a new link.</main>;
  }

  // Verify the student exists and actually belongs to this unit's teacher
  // (sanity check on the two opaque IDs matching up) - not an auth gate,
  // just confirms the link is legitimate.
  const { data: student } = await supabaseAdmin
    .from('students')
    .select('*')
    .eq('id', studentId)
    .single();

  if (!student || student.teacher_id !== microUnit.teacher_id) {
    return <main style={{ padding: 32 }}>This link doesn't match a valid student for this unit. Please ask your teacher for a new link.</main>;
  }

  return <PracticeFlow microUnit={microUnit} studentId={studentId} />;
}

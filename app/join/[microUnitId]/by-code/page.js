import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Resolves a qr_code (typed via the name-lookup path) back to a real
// practice URL, server-side, using the service-role client - same pattern
// as the practice page itself, since there's no student session to check
// RLS against.
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function JoinByCodePage({ params, searchParams }) {
  const qr = searchParams?.qr;
  if (!qr) {
    return <main style={{ padding: 32 }}>Missing QR code.</main>;
  }

  const { data: student, error } = await supabaseAdmin
    .from('students')
    .select('*')
    .eq('qr_code', qr)
    .single();

  if (error || !student || student.teacher_id !== (await getUnitTeacher(params.microUnitId))) {
    return <main style={{ padding: 32 }}>Couldn't find that student for this unit - ask your teacher for help.</main>;
  }

  redirect(`/practice/${params.microUnitId}?student=${student.id}`);
}

async function getUnitTeacher(microUnitId) {
  const { data } = await supabaseAdmin.from('micro_units').select('teacher_id').eq('id', microUnitId).single();
  return data?.teacher_id;
}

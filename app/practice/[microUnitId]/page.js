import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import PracticeFlow from '@/components/PracticeFlow';

export const metadata = {
  title: 'Practice - Mastery Studio',
};

export default async function PracticePage({ params }) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login');
  }

  const { data: microUnit, error } = await supabase
    .from('micro_units')
    .select('*')
    .eq('id', params.microUnitId)
    .single();

  if (error || !microUnit) {
    redirect('/dashboard');
  }

  // Verify student belongs to teacher
  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!student || student.teacher_id !== microUnit.teacher_id) {
    redirect('/dashboard');
  }

  return (
    <PracticeFlow
      microUnit={microUnit}
      studentId={session.user.id}
    />
  );
}

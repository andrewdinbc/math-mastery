import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TeacherDashboard from '@/components/TeacherDashboard';
import StudentDashboard from '@/components/StudentDashboard';

export const metadata = {
  title: 'Dashboard - Math Mastery Studio',
};

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login');
  }

  // Check if user is a teacher
  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (teacher) {
    return <TeacherDashboard userId={session.user.id} />;
  }

  return <StudentDashboard userId={session.user.id} />;
}

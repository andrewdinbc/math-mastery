import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/tokens/leaderboard
//
// New (2026-07-21): the existing /api/tokens route only returns ONE
// student's balance (by qrCode or session) -- there was no bulk "all of
// this teacher's students, ranked" endpoint, which is what a real
// leaderboard needs. Built for the TeacherAssist Hub's dashboard, same
// cross-app auth pattern already established in /api/analytics: either
// MICRO_UNIT_SYNC_SECRET + teacherEmail (cross-app), or a normal teacher
// session (in-app use). Reuses the same secret rather than inventing a
// new one, matching assessment-tool's existing convention.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const syncSecret = request.headers.get('x-micro-unit-sync-secret');
    const teacherEmailParam = searchParams.get('teacherEmail');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    const supabase = createServerComponentClient({ cookies });
    let teacherId;

    if (syncSecret && process.env.MICRO_UNIT_SYNC_SECRET && syncSecret === process.env.MICRO_UNIT_SYNC_SECRET && teacherEmailParam) {
      const { data: teacher } = await supabase.from('mastery_teachers').select('id').eq('email', teacherEmailParam).single();
      if (!teacher) {
        return Response.json({ error: `No Mastery Studio teacher account found for ${teacherEmailParam}` }, { status: 404, headers: CORS_HEADERS });
      }
      teacherId = teacher.id;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: CORS_HEADERS });
      teacherId = user.id;
    }

    // Service-role client for the aggregation -- same reasoning as the
    // rest of this codebase's admin routes: this needs to read across all
    // of a teacher's students' transactions, not just the caller's own row.
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: students, error: studentsErr } = await admin
      .from('mastery_students')
      .select('id, qr_code')
      .eq('teacher_id', teacherId);
    if (studentsErr) return Response.json({ error: studentsErr.message }, { status: 500, headers: CORS_HEADERS });
    if (!students?.length) return Response.json({ leaderboard: [] }, { headers: CORS_HEADERS });

    const studentIds = students.map((s) => s.id);
    const { data: transactions, error: txErr } = await admin
      .from('mastery_token_transactions')
      .select('student_id, amount')
      .in('student_id', studentIds);
    if (txErr) return Response.json({ error: txErr.message }, { status: 500, headers: CORS_HEADERS });

    const balanceByStudent = {};
    for (const t of transactions || []) {
      balanceByStudent[t.student_id] = (balanceByStudent[t.student_id] || 0) + t.amount;
    }

    const leaderboard = students
      .map((s) => ({ qrCode: s.qr_code, balance: balanceByStudent[s.id] || 0 }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    return Response.json({ leaderboard }, { headers: CORS_HEADERS });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: CORS_HEADERS });
  }
}

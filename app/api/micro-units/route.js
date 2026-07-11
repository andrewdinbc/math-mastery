// MICRO_UNIT_SYNC_SECRET set 1783629770 (retry)
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Receives micro-unit creation requests from Lesson Planner (task 6) via a
// shared-secret cross-app call - lesson-planner and math-mastery are on
// separate Supabase projects, so this can't be a direct DB write from the
// other app. Also supports normal teacher-authenticated calls from within
// Mastery Studio itself (e.g. a future in-app authoring UI).

export async function POST(request) {
  try {
    const body = await request.json();
    const syncSecret = request.headers.get('x-micro-unit-sync-secret');

    let teacherId;
    if (syncSecret && process.env.MICRO_UNIT_SYNC_SECRET && syncSecret === process.env.MICRO_UNIT_SYNC_SECRET) {
      // Cross-app call from Lesson Planner - teacher identity comes from
      // the request body (their Supabase Auth user id in THIS project,
      // resolved by matching email - Lesson Planner and Mastery Studio
      // share the same teacher accounts by email even on separate
      // Supabase projects).
      if (!body.teacherEmail) {
        return Response.json({ error: 'teacherEmail required for cross-app sync' }, { status: 400 });
      }
      const supabase = createServerComponentClient({ cookies });
      const { data: teacher } = await supabase.from('mastery_teachers').select('id').eq('email', body.teacherEmail).single();
      if (!teacher) {
        return Response.json({ error: `No Mastery Studio teacher account found for ${body.teacherEmail} - they need to sign up in Mastery Studio first.` }, { status: 404 });
      }
      teacherId = teacher.id;
    } else {
      const supabase = createServerComponentClient({ cookies });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });
      teacherId = user.id;
    }

    const { title, grade, strand, questionTemplate, randomizable, defaultMasteryPct, lessonPlannerRef } = body;
    if (!title || !questionTemplate) {
      return Response.json({ error: 'title and questionTemplate required' }, { status: 400 });
    }

    const supabase = createServerComponentClient({ cookies });
    const { data, error } = await supabase
      .from('mastery_micro_units')
      .insert({
        teacher_id: teacherId,
        lesson_planner_ref: lessonPlannerRef || null,
        title,
        grade: grade || null,
        strand: strand || null,
        question_template: questionTemplate,
        randomizable: randomizable !== false,
        default_mastery_pct: defaultMasteryPct || 80,
        question_count: questionTemplate.questions?.length || 11,
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, microUnit: data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

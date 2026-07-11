import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Mastery Studio's teacher analytics endpoint - CoGrader-style holistic
// breakdown (Overview/Patterns/Strengths/Areas-for-Growth), matching the
// structure already used in parent-portal's teacher/analytics route.
//
// SHARED ENDPOINT NOTE: assessment-tool's combined-analytics route
// (mastery_1783607440121_7) calls this same endpoint cross-origin rather
// than duplicating this aggregation logic - that's why CORS is enabled
// below. If this response shape changes, assessment-tool's consumer needs
// to be updated too.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // teacher-scoped by auth below, not by origin
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    const supabase = createServerComponentClient({ cookies });

    // Two auth paths: normal teacher session (cookie-based, for in-app
    // use), or a trusted cross-app call authenticated via
    // MICRO_UNIT_SYNC_SECRET + a teacherEmail query param (same secret
    // already used for the Lesson Planner micro-units sync - reused here
    // rather than inventing a second secret, since assessment-tool has no
    // Supabase Auth session of its own to forward).
    const { searchParams } = new URL(request.url);
    const syncSecret = request.headers.get('x-micro-unit-sync-secret');
    const teacherEmailParam = searchParams.get('teacherEmail');

    let teacherId;
    if (syncSecret && process.env.MICRO_UNIT_SYNC_SECRET && syncSecret === process.env.MICRO_UNIT_SYNC_SECRET && teacherEmailParam) {
      const { data: teacher } = await supabase.from('mastery_teachers').select('id').eq('email', teacherEmailParam).single();
      if (!teacher) {
        return Response.json({ error: `No Mastery Studio teacher account found for ${teacherEmailParam}` }, { status: 404, headers: CORS_HEADERS });
      }
      teacherId = teacher.id;
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return Response.json({ error: 'Not authenticated' }, { status: 401, headers: CORS_HEADERS });
      }
      teacherId = user.id;
    }

    const { data: attempts, error: attErr } = await supabase
      .from('mastery_attempts')
      .select('*, micro_units!inner(strand, teacher_id, title), students!inner(qr_code)')
      .eq('micro_units.teacher_id', teacherId);
    if (attErr) return Response.json({ error: attErr.message }, { status: 500, headers: CORS_HEADERS });

    const rows = attempts || [];

    // Overview
    const totalAttempts = rows.length;
    const avgScorePct = totalAttempts
      ? Math.round(rows.reduce((s, r) => s + (r.score_pct || 0), 0) / totalAttempts)
      : 0;
    const masteryRatePct = totalAttempts
      ? Math.round((rows.filter((r) => r.passed_threshold).length / totalAttempts) * 100)
      : 0;

    // Patterns: aggregate errorType across all attempts' ai_marking_result.perQuestionResults
    const errorCounts = {};
    const errorStudents = {};
    rows.forEach((r) => {
      const results = r.ai_marking_result?.perQuestionResults || [];
      results.forEach((q) => {
        if (q.errorType) {
          errorCounts[q.errorType] = (errorCounts[q.errorType] || 0) + 1;
          errorStudents[q.errorType] = errorStudents[q.errorType] || new Set();
          errorStudents[q.errorType].add(r.student_id);
        }
      });
    });
    const patterns = Object.entries(errorCounts)
      .map(([errorType, count]) => ({ errorType, count, affectedStudentCount: errorStudents[errorType].size }))
      .sort((a, b) => b.count - a.count);

    // Strengths / Areas for Growth: group by strand
    const strandScores = {};
    rows.forEach((r) => {
      const strand = r.micro_units?.strand || 'unspecified';
      strandScores[strand] = strandScores[strand] || [];
      strandScores[strand].push(r);
    });
    const strandAverages = Object.entries(strandScores).map(([strand, list]) => ({
      strand,
      avgScorePct: Math.round(list.reduce((s, r) => s + (r.score_pct || 0), 0) / list.length),
      count: list.length,
    }));
    const sorted = [...strandAverages].sort((a, b) => b.avgScorePct - a.avgScorePct);
    const strengths = sorted.slice(0, 3);
    const areasForGrowth = sorted
      .slice(-3)
      .reverse()
      .map((s) => ({
        ...s,
        studentNames: [
          ...new Set(
            strandScores[s.strand]
              .filter((r) => !r.passed_threshold)
              .map((r) => r.students?.qr_code)
              .filter(Boolean)
          ),
        ],
      }));

    return Response.json(
      {
        overview: { totalAttempts, avgScorePct, masteryRatePct },
        patterns,
        strengths,
        areasForGrowth,
      },
      { headers: CORS_HEADERS }
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: CORS_HEADERS });
  }
}

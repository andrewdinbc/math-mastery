import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function GET(request, { params }) {
  try {
    const { qrCode } = params
    const { searchParams } = new URL(request.url)
    const viewer = searchParams.get('viewer') === 'parent' ? 'parent' : 'student'

    const { data: student } = await supabaseAdmin.from('mastery_students').select('id, teacher_id').eq('qr_code', qrCode).maybeSingle()
    if (!student) return Response.json({ error: 'Code not recognized.' }, { status: 404 })

    const { data: settings } = await supabaseAdmin.from('mastery_display_settings').select('*').eq('teacher_id', student.teacher_id).maybeSingle()
    const displayMode = settings?.score_display_mode || 'percentage'

    // Parent-only visibility gates - enforced here, server-side, not just
    // hidden in the UI. A student-viewer request can NEVER get baseline
    // data back, regardless of what the client asks for.
    const showScores = viewer === 'student' ? true : (settings?.parent_show_scores ?? true)
    const showFeedback = viewer === 'student' ? true : (settings?.parent_show_feedback ?? true)
    const showBaseline = viewer === 'parent' && (settings?.parent_show_baseline ?? true)

    const { data: units } = await supabaseAdmin
      .from('mastery_micro_units')
      .select('id, title, strand, order_index')
      .eq('teacher_id', student.teacher_id)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    const { data: allAttempts } = await supabaseAdmin
      .from('mastery_attempts')
      .select('id, micro_unit_id, score_pct, passed_threshold, attempt_number, created_at')
      .eq('student_id', student.id)
      .order('attempt_number', { ascending: true })

    const attemptsByUnit = {}
    for (const a of allAttempts || []) {
      if (!attemptsByUnit[a.micro_unit_id]) attemptsByUnit[a.micro_unit_id] = []
      attemptsByUnit[a.micro_unit_id].push(a)
    }

    // Group by strand ("Content Unit" in Aj's terms) -> micro unit -> tasks
    const strandMap = {}
    for (const unit of units || []) {
      const strandName = unit.strand || 'General'
      if (!strandMap[strandName]) strandMap[strandName] = []

      const unitAttempts = attemptsByUnit[unit.id] || []
      const tasks = unitAttempts.map((a) => ({
        taskNumber: a.attempt_number,
        scoreDisplay: showScores ? formatScoreInline(a.score_pct, displayMode) : null,
        passed: a.passed_threshold,
        feedback: showFeedback ? qualitativeFeedbackInline(a.score_pct, a.passed_threshold) : null,
        date: a.created_at,
      }))

      const baseline = showBaseline && unitAttempts.length
        ? { scoreDisplay: formatScoreInline(unitAttempts[0].score_pct, displayMode), date: unitAttempts[0].created_at }
        : null

      strandMap[strandName].push({
        unitId: unit.id,
        title: unit.title,
        mastered: unitAttempts.some((a) => a.passed_threshold),
        tasks,
        baseline,
      })
    }

    return Response.json({
      viewer,
      displayMode,
      strands: Object.entries(strandMap).map(([strand, units]) => ({ strand, units })),
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

function formatScoreInline(scorePct, mode) {
  if (scorePct == null) return null
  if (mode === 'feedback_only') return null
  if (mode === 'letter') {
    if (scorePct >= 90) return 'A'
    if (scorePct >= 80) return 'B'
    if (scorePct >= 70) return 'C'
    if (scorePct >= 60) return 'D'
    return 'F'
  }
  if (mode === 'scale') {
    if (scorePct >= 90) return '4 — Exceeding'
    if (scorePct >= 80) return '3 — Meeting'
    if (scorePct >= 65) return '2 — Approaching'
    return '1 — Beginning'
  }
  return `${Math.round(scorePct)}%`
}

function qualitativeFeedbackInline(scorePct, passedThreshold) {
  if (passedThreshold) return 'Mastered — great work on this one.'
  if (scorePct >= 70) return 'Close — a bit more practice and this will click.'
  if (scorePct >= 50) return 'Making progress — keep at it.'
  return 'This one needs more practice.'
}

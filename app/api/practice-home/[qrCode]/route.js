import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function GET(request, { params }) {
  try {
    const { qrCode } = params

    const { data: student } = await supabaseAdmin
      .from('mastery_students')
      .select('id, teacher_id')
      .eq('qr_code', qrCode)
      .maybeSingle()

    if (!student) return Response.json({ error: 'Code not recognized — ask your teacher for help.' }, { status: 404 })

    // All units this teacher has assigned, in creation order (matches
    // how they'd typically be sequenced for a class).
    const { data: units } = await supabaseAdmin
      .from('mastery_micro_units')
      .select('id, title, description, order_index, video_url, khan_academy_video_url')
      .eq('teacher_id', student.teacher_id)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    // Every passed attempt for this student, so we can find the first
    // unit not yet mastered - that's their "current" unit.
    const { data: passedAttempts } = await supabaseAdmin
      .from('mastery_attempts')
      .select('micro_unit_id')
      .eq('student_id', student.id)
      .eq('passed_threshold', true)

    const passedUnitIds = new Set((passedAttempts || []).map((a) => a.micro_unit_id))
    const currentUnit = (units || []).find((u) => !passedUnitIds.has(u.id)) || null

    let currentStep = null
    let attemptCount = 0
    if (currentUnit) {
      const { data: unitAttempts } = await supabaseAdmin
        .from('mastery_attempts')
        .select('attempt_number')
        .eq('student_id', student.id)
        .eq('micro_unit_id', currentUnit.id)
        .order('attempt_number', { ascending: false })
        .limit(1)
      attemptCount = unitAttempts?.[0]?.attempt_number || 0
      currentStep = attemptCount + 1 // the attempt they're about to make
    }

    // Unresolved remediation - tutorial content tied to their real
    // mistakes, not generic review. Honest framing: this is a written
    // tutorial script (title/steps/narration), not a rendered video -
    // said plainly rather than implying video content that doesn't exist.
    let remediation = []
    if (currentUnit) {
      const { data: recentAttempts } = await supabaseAdmin
        .from('mastery_attempts')
        .select('id')
        .eq('student_id', student.id)
        .eq('micro_unit_id', currentUnit.id)
        .order('created_at', { ascending: false })
        .limit(5)

      const attemptIds = (recentAttempts || []).map((a) => a.id)
      if (attemptIds.length) {
        const { data: sessions } = await supabaseAdmin
          .from('mastery_remediation_sessions')
          .select('id, error_pattern, remediation_content, resolved, video_bank_id')
          .in('attempt_id', attemptIds)
          .eq('resolved', false)
        remediation = sessions || []

        const bankIds = remediation.map((r) => r.video_bank_id).filter(Boolean)
        if (bankIds.length) {
          const { data: bankRows } = await supabaseAdmin
            .from('mastery_video_bank')
            .select('id, specificity, video_status, video_url, times_reused')
            .in('id', bankIds)
          const bankMap = Object.fromEntries((bankRows || []).map((b) => [b.id, b]))
          remediation = remediation.map((r) => ({ ...r, videoBank: bankMap[r.video_bank_id] || null }))
        }
      }
    }

    return Response.json({
      studentId: student.id,
      currentUnit,
      currentStep,
      attemptCount,
      totalUnits: units?.length || 0,
      unitsCompleted: passedUnitIds.size,
      remediation,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}



import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Service-role client, not the session-cookie client used elsewhere in
// this app - this route is hit by an unauthenticated student device
// scanning a QR code, not a logged-in teacher, so there's no session to
// read. The drillId+qrCode pair in the URL is the only "auth" - matches
// the same QR-as-capability-token pattern used across the whole suite
// tonight (assessment-tool, parent-portal) rather than requiring a login
// a student on a shared class iPad wouldn't have anyway.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function POST(request) {
  try {
    const formData = await request.formData()
    const photo = formData.get('photo')
    const drillId = formData.get('drillId')
    const qrCode = formData.get('qrCode')
    if (!photo || !drillId || !qrCode) {
      return Response.json({ error: 'photo, drillId, and qrCode are required' }, { status: 400 })
    }

    const { data: drill, error: drillError } = await supabase
      .from('mastery_drills')
      .select('answer_key_by_student, problem_count, title')
      .eq('id', drillId)
      .single()
    if (drillError || !drill) return Response.json({ error: 'Drill not found' }, { status: 404 })

    const answerKey = drill.answer_key_by_student?.[qrCode]
    if (!answerKey) return Response.json({ error: 'No answer key found for this student on this drill' }, { status: 404 })

    const buffer = Buffer.from(await photo.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = photo.type || 'image/jpeg'

    // Reuses the same vision-extraction pattern already proven tonight
    // for uploaded rubrics - read handwriting/printed answers off an
    // image, return structured data, don't reproduce the image content.
    const prompt = `This is a photo of a student's completed multiplication drill worksheet with
${drill.problem_count} problems, read left-to-right, top-to-bottom, in a 5-column grid.

Read the student's handwritten answer for each problem in order. If a problem was left blank or
is illegible, use null for that answer.

Respond with ONLY valid JSON, no markdown fences, no preamble:
{ "studentAnswers": [number or null, ...] }`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    })
    const text = response.content.find((b) => b.type === 'text')?.text || ''
    const { studentAnswers } = JSON.parse(text.replace(/```json|```/g, '').trim())

    let correct = 0
    answerKey.forEach((correctAnswer, i) => {
      if (studentAnswers[i] === correctAnswer) correct += 1
    })
    const scorePct = Math.round((correct / answerKey.length) * 100)

    // Find the student row to attach a real mastery_attempts record, same
    // table the online drills already write to - drills submitted via
    // paper scan show up in the same mastery history as online attempts.
    const { data: student } = await supabase
      .from('mastery_students')
      .select('id')
      .eq('qr_code', qrCode)
      .single()

    if (student) {
      await supabase.from('mastery_attempts').insert({
        student_id: student.id,
        micro_unit_id: null, // drills aren't tied to a micro_unit - they're standalone fluency practice
        submitted_via: 'scan',
        raw_answers: { studentAnswers, drillId, drillTitle: drill.title },
        ai_marking_result: { correct, total: answerKey.length },
        score_pct: scorePct,
        passed_threshold: scorePct >= 80,
        attempt_number: 1,
      })
    }

    return Response.json({ correct, total: answerKey.length, scorePct })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

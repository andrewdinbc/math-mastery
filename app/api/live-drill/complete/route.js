import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Service-role client - students have no Supabase Auth session by design
// (anonymous QR-linked rows, per the privacy pattern already established
// across this app). mastery_attempts has RLS with only a SELECT policy,
// no INSERT policy, so this write has to happen server-side with the
// service role, not via an unauthenticated client-side insert.
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function POST(request) {
  try {
    const { studentId, history, secondsElapsed, bestStreak } = await request.json()
    if (!studentId || !history?.length) {
      return Response.json({ error: 'studentId and history are required' }, { status: 400 })
    }

    const correctCount = history.filter((h) => h.correct).length
    const scorePct = Math.round((correctCount / history.length) * 100)

    // Same step/pattern-analysis spirit as the algebraic error-tutorial
    // work, applied to fact fluency: which specific fact families were
    // fastest/slowest or most-missed, not just an overall percentage.
    const missedFacts = history.filter((h) => !h.correct).map((h) => `${h.a}×${h.b}`)
    const avgTimeMs = Math.round(history.reduce((s, h) => s + h.timeMs, 0) / history.length)
    const rangeStart = history[0]?.factMax
    const rangeEnd = history[history.length - 1]?.factMax

    const prompt = `A student just finished a live multiplication drill. Write short, specific,
encouraging commentary - like a coach who actually watched, not a generic "great job."

Correct: ${correctCount}/${history.length} (${scorePct}%)
Average time per problem: ${(avgTimeMs / 1000).toFixed(1)}s
Best streak: ${bestStreak}
Fact range moved from up-to-${rangeStart} to up-to-${rangeEnd} during the session (adaptive difficulty)
Facts missed: ${missedFacts.length ? missedFacts.join(', ') : 'none'}

Respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "headline": "one short punchy sentence",
  "detail": "1-2 sentences, specific to what actually happened (mention real numbers/facts if there's something worth calling out, otherwise focus on speed/streak)"
}`

    let commentary
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      commentary = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      commentary = { headline: 'Nice work!', detail: `${correctCount} out of ${history.length} correct, best streak of ${bestStreak}.` }
    }

    await supabaseAdmin.from('mastery_attempts').insert({
      student_id: studentId,
      micro_unit_id: null,
      submitted_via: 'online',
      raw_answers: { history, secondsElapsed, bestStreak },
      ai_marking_result: { correct: correctCount, total: history.length, commentary },
      score_pct: scorePct,
      passed_threshold: scorePct >= 80,
      attempt_number: 1,
    })

    return Response.json({ commentary })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

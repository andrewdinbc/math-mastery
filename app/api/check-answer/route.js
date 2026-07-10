import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

function computeAnswer(q) {
  if (!q.answer_formula || !q.resolvedVariables) return null;
  try {
    const fn = new Function(...Object.keys(q.resolvedVariables), `return ${q.answer_formula};`);
    return fn(...Object.values(q.resolvedVariables));
  } catch {
    return null;
  }
}

// Checks one answer immediately (not batched at the end) and, if wrong,
// generates a real AI hint explaining the specific mistake right there -
// this is the "help solve it" piece Aj asked for, not just a score at
// the end.
export async function POST(request) {
  try {
    const { prompt, question, studentAnswer } = await request.json();
    if (!question || studentAnswer === undefined || studentAnswer === null || studentAnswer === '') {
      return Response.json({ error: 'question and studentAnswer required' }, { status: 400 });
    }

    const correctAnswer = computeAnswer(question);
    const studentNum = Number(studentAnswer);
    const correct = correctAnswer != null && !isNaN(studentNum) && Math.abs(studentNum - correctAnswer) < 0.0001;

    if (correct) {
      return Response.json({ correct: true, correctAnswer, feedback: null });
    }

    // Only call AI when the student got it wrong - correct answers don't
    // need a round-trip, keeps the flow fast.
    const helpPrompt = `A student is working on this math question: "${question.prompt}"
The correct answer is ${correctAnswer}. The student answered ${studentAnswer}, which is incorrect.

In 1-2 short, encouraging sentences (talk directly to the student, plain language, no jargon), explain what likely went wrong with their specific answer and give them a nudge toward the right approach - don't just restate the answer. Keep it warm and supportive, like a patient tutor.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: helpPrompt }],
    });
    const feedback = message.content.find((b) => b.type === 'text')?.text || 'Not quite - try again!';

    return Response.json({ correct: false, correctAnswer, feedback });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

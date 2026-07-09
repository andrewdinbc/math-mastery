import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(request) {
  try {
    const { questionTemplate, answers, attemptId } = await request.json();

    // Build prompt for Claude to mark answers
    const questionsText = questionTemplate
      .map((q, idx) => {
        const answerObj = answers.find((a) => a.questionIndex === idx);
        return `Question ${idx + 1}: ${q.text || q.question}\nCorrect answer: ${q.correctAnswer || q.answer}\nStudent answer: ${answerObj?.answer || 'No answer'}\n`;
      })
      .join('\n');

    const prompt = `You are an expert math teacher marking student work. For each question below, determine if the student's answer is correct. Respond with a JSON object with:
{
  "correct": [true/false for each answer],
  "errors": [{"questionIndex": number, "error_pattern": "description"}],
  "feedback": [{"questionIndex": number, "feedback": "brief feedback"}]
}

${questionsText}

IMPORTANT: Return ONLY valid JSON, no other text.`;

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].text;
    const marking = JSON.parse(responseText);

    const correct = marking.correct.filter(Boolean).length;

    return Response.json({
      correct,
      total: questionTemplate.length,
      errors: marking.errors || [],
      feedback: marking.feedback || [],
    });
  } catch (error) {
    console.error('Marking error:', error);
    return Response.json(
      { error: 'Failed to mark answers' },
      { status: 500 }
    );
  }
}

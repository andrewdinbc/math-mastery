import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic();

// Pulls Aj's steering documents (e.g. "Teaching Learners Who Struggle
// with Mathematics" -- Sherman, Richardson & Yard) from Lesson Planner's
// shared steering library via the cross-app endpoint, so remediation
// content is grounded in real intervention research instead of generic
// AI output. See lesson-planner's app/api/steering-documents/context/route.js
// and lib/steering-context.js for the source of truth. Fails soft --
// if the fetch fails for any reason, remediation still generates without
// the extra grounding rather than breaking the feature.
async function fetchSteeringContext() {
  const secret = process.env.STEERING_SYNC_SECRET
  if (!secret) return ''
  try {
    const res = await fetch('https://lesson-planner-liart.vercel.app/api/steering-documents/context', {
      headers: { 'x-steering-sync-secret': secret },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.context || ''
  } catch {
    return ''
  }
}

export async function POST(request) {
  try {
    const { errorPattern, questionTemplate, attemptId } = await request.json();

    const steeringContext = await fetchSteeringContext();

    const prompt = `You are an expert math teacher creating a targeted mini-lesson. A student made this error: "${errorPattern}".

Using the question template: ${JSON.stringify(questionTemplate)}

Create a brief, focused "chalkboard style" explanation that:
1. Identifies the SPECIFIC misconception
2. Shows the correct approach with 1-2 examples
3. Is encouraging and brief (under 300 words)
4. Uses simple, clear language
${steeringContext}

Format as HTML with <h2>, <p>, <ol> tags for structure.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const htmlContent = message.content[0].text;

    return Response.json({
      htmlContent,
      errorPattern,
      attemptId,
    });
  } catch (error) {
    console.error('Remediation generation error:', error);
    return Response.json(
      { error: 'Failed to generate remediation' },
      { status: 500 }
    );
  }
}

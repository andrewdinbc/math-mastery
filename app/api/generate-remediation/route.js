import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(request) {
  try {
    const { errorPattern, questionTemplate, attemptId } = await request.json();

    const prompt = `You are an expert math teacher creating a targeted mini-lesson. A student made this error: "${errorPattern}".

Using the question template: ${JSON.stringify(questionTemplate)}

Create a brief, focused "chalkboard style" explanation that:
1. Identifies the SPECIFIC misconception
2. Shows the correct approach with 1-2 examples
3. Is encouraging and brief (under 300 words)
4. Uses simple, clear language

Format as HTML with <h2>, <p>, <ol> tags for structure.`;

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

import Anthropic from '@anthropic-ai/sdk';

// Researches CommonCoreSheets.com (and general grade-level curriculum
// progression) to suggest a logical sequence of Units for a given topic/
// grade - e.g. "grade 7 algebra" -> ordered skill breakdown matching how
// CommonCoreSheets actually structures their worksheet categories, from
// foundational to advanced within that strand.

const anthropic = new Anthropic();

export async function POST(request) {
  try {
    const { topic, grade } = await request.json();
    if (!topic) return Response.json({ error: 'topic required' }, { status: 400 });

    const prompt = `Research CommonCoreSheets.com's worksheet categories and structure for the topic "${topic}"${grade ? ` at grade ${grade}` : ''}. Use web_search to actually look at how they break this topic into a sequence of skills (their category/subcategory structure, and the progression of individual worksheet titles within it - e.g. for "Using Substitutions to Solve Problems" they go from single-step to multi-step, addition/subtraction to multiplication/division, then combined operations).

Based on real research (not a guess), propose a logical sequence of 4-8 Units that build on each other from foundational to advanced, matching how CommonCoreSheets and standard grade-level curricula actually sequence this skill.

Respond with ONLY a JSON array (no other text, no markdown fences), each item shaped exactly like:
{
  "title": "short title, e.g. 'Single-Step Addition Equations'",
  "strand": "e.g. 'algebra'",
  "grade": "e.g. '${grade || '7'}'",
  "description": "one sentence on what this unit covers and why it comes at this point in the sequence",
  "questionTemplate": {
    "questions": [{ "prompt": "example question with {variable} placeholders, matching this unit's actual difficulty level", "answer_formula": "the formula" }],
    "randomizable_ranges": { "variable": { "min": 1, "max": 20 } }
  }
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    // Agentic loop: let it search, then extract the final JSON text block.
    let messages = [{ role: 'user', content: prompt }];
    let finalText = '';
    for (let round = 0; round < 4; round++) {
      const response = round === 0 ? message : await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages,
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock?.text) finalText = textBlock.text;
      if (response.stop_reason !== 'tool_use') break;
      messages = [...messages, { role: 'assistant', content: response.content }];
    }

    // Strip markdown fences if the model added them despite instructions.
    const cleaned = finalText.replace(/```json|```/g, '').trim();
    let units;
    try {
      units = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: 'AI response was not valid JSON', raw: finalText.slice(0, 500) }, { status: 502 });
    }

    return Response.json({ ok: true, units });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

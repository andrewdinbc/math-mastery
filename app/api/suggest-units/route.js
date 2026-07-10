import Anthropic from '@anthropic-ai/sdk';

// Researches CommonCoreSheets.com (and general grade-level curriculum
// progression) to suggest a logical sequence of Units for a given topic/
// grade - e.g. "grade 7 algebra" -> ordered skill breakdown matching how
// CommonCoreSheets actually structures their worksheet categories, from
// foundational to advanced within that topic area.
//
// If a resourceUrl is provided (an uploaded example worksheet or lesson),
// it's fetched and passed to Claude as a real document/image the model
// reads directly - not just a filename - so suggestions can match the
// teacher's existing style, level, or lesson content, not just generic
// web research.

const anthropic = new Anthropic();

async function buildResourceBlock(resourceUrl) {
  if (!resourceUrl) return null;
  const res = await fetch(resourceUrl);
  if (!res.ok) throw new Error(`Could not fetch the uploaded resource (status ${res.status})`);
  const contentType = res.headers.get('content-type') || '';
  const bytes = await res.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');

  if (contentType.includes('pdf') || resourceUrl.toLowerCase().endsWith('.pdf')) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  }
  const mediaType = contentType.includes('png') || resourceUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}

export async function POST(request) {
  try {
    const { topic, grade, resourceUrl, language } = await request.json();
    const lang = language && language !== 'english' ? language : null;
    if (!topic) return Response.json({ error: 'topic required' }, { status: 400 });

    let resourceBlock = null;
    try {
      resourceBlock = await buildResourceBlock(resourceUrl);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    const promptText = `Research CommonCoreSheets.com's worksheet categories and structure for the topic "${topic}"${grade ? ` at grade ${grade}` : ''}. Use web_search to actually look at how they break this topic into a sequence of skills (their category/subcategory structure, and the progression of individual worksheet titles within it - e.g. for "Using Substitutions to Solve Problems" they go from single-step to multi-step, addition/subtraction to multiplication/division, then combined operations).${resourceBlock ? '\n\nA teacher has also attached an example worksheet or lesson (above) - use it as a real reference for style, difficulty level, and format. Your suggested Units should match what this specific teacher is already doing, not just generic grade-level defaults.' : ''}${lang ? `\n\nWrite all titles, descriptions, and question prompts in ${lang}. Keep {variable} placeholders and answer_formula fields unchanged (they're not language-specific).` : ''}

Based on real research (not a guess)${resourceBlock ? ' and the attached reference material' : ''}, propose a logical sequence of 4-8 Units that build on each other from foundational to advanced, matching how CommonCoreSheets and standard grade-level curricula actually sequence this skill.

Respond with ONLY a JSON array (no other text, no markdown fences), each item shaped exactly like:
{
  "title": "short title, e.g. 'Single-Step Addition Equations'",
  "strand": "e.g. 'algebra' (this is the Topic Area)",
  "grade": "e.g. '${grade || '7'}'",
  "description": "one sentence on what this unit covers and why it comes at this point in the sequence",
  "questionTemplate": {
    "questions": [{ "prompt": "example question with {variable} placeholders, matching this unit's actual difficulty level", "answer_formula": "the formula" }],
    "randomizable_ranges": { "variable": { "min": 1, "max": 20 } }
  }
}`;

    const userContent = resourceBlock ? [resourceBlock, { type: 'text', text: promptText }] : promptText;

    let messages = [{ role: 'user', content: userContent }];
    let finalText = '';
    for (let round = 0; round < 4; round++) {
      const response = await anthropic.messages.create({
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


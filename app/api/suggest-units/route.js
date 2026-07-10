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

Also use web_search to find real videos for each unit's specific skill (not just the general topic):
1. A Math Antics video - search specifically for site:youtube.com/@mathantics OR "mathantics" as the channel name in your query (e.g. 'mathantics [skill] youtube'). Their channel is https://www.youtube.com/@mathantics - only use a URL you've verified is actually from that channel, not a different channel that happens to also cover math.
2. A Khan Academy video on the same skill, as a second option.
Do not substitute one for the other - if you can't find a genuine Math Antics video for a skill, leave mathAnticsVideoUrl null rather than using a different channel's video there.

Respond with ONLY a JSON array (no other text, no markdown fences), each item shaped exactly like:
{
  "title": "short title, e.g. 'Single-Step Addition Equations'",
  "strand": "e.g. 'algebra' (this is the Topic Area)",
  "grade": "e.g. '${grade || '7'}'",
  "description": "one sentence on what this unit covers and why it comes at this point in the sequence",
  "mathAnticsVideoUrl": "a REAL youtube.com/@mathantics video URL you verified via search, or null - never substitute a different channel here even if it covers the same topic",
  "khanAcademyVideoUrl": "a real Khan Academy video URL you verified via search, or null",
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

    // Robust JSON extraction: models sometimes wrap the array in a
    // sentence or two even when told not to (more common when a language
    // instruction is also in play) - extract from the first [ to the last
    // ] rather than requiring the whole response to be pure JSON.
    function extractJson(text) {
      const cleaned = text.replace(/```json|```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch {
        const start = cleaned.indexOf('[');
        const end = cleaned.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
          try {
            return JSON.parse(cleaned.slice(start, end + 1));
          } catch {
            return null;
          }
        }
        return null;
      }
    }

    let units = extractJson(finalText);

    if (!units) {
      // One retry with an explicit, unmistakable instruction - real fix for
      // the case Aj hit (grade 6 long division, Spanish): the language
      // instruction combined with the JSON-only instruction sometimes
      // isn't followed strictly enough on the first pass.
      const retryMessages = [
        ...messages,
        { role: 'assistant', content: finalText },
        { role: 'user', content: 'That response was not valid JSON. Respond again with ONLY the JSON array - no preamble, no explanation, no markdown fences, starting with [ and ending with ].' },
      ];
      const retryResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: retryMessages,
      });
      const retryText = retryResponse.content.find((b) => b.type === 'text')?.text || '';
      units = extractJson(retryText);

      if (!units) {
        // Second fallback: a fresh, much simpler attempt - no web_search
        // tool, no resource block, smaller array requested. Trades some
        // research depth for reliability as a last resort, since two
        // failures in a row usually means something about the tool-use +
        // language + JSON combination is tripping the model up, not a
        // one-off fluke.
        const simplePrompt = `List 4 Units for teaching "${topic}"${grade ? ` at grade ${grade}` : ''}${lang ? ` in ${lang}` : ''}, foundational to advanced. Respond with ONLY a JSON array, nothing else:
[{ "title": "...", "strand": "...", "grade": "${grade || '7'}", "description": "...", "mathAnticsVideoUrl": null, "khanAcademyVideoUrl": null, "questionTemplate": { "questions": [{ "prompt": "... with {variable} placeholders", "answer_formula": "..." }], "randomizable_ranges": { "variable": { "min": 1, "max": 20 } } } }]`;
        const fallbackResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [{ role: 'user', content: simplePrompt }],
        });
        const fallbackText = fallbackResponse.content.find((b) => b.type === 'text')?.text || '';
        units = extractJson(fallbackText);
        if (!units) {
          return Response.json({ error: 'AI research failed to format correctly after two retries - please try again.', raw: fallbackText.slice(0, 500) }, { status: 502 });
        }
      }
    }

    return Response.json({ ok: true, units });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}




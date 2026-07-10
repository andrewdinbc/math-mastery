import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

// Generates worksheets for a micro-unit, laid out to match the
// CommonCoreSheets reference template Aj provided: title + Name field top
// right (QR sits over/beside the Name field), 2-column question grid with
// wrapped text so nothing overflows, and a right-side Answers column with
// numbered blanks, shifted down to leave room for the QR.
//
// Standard: 10 minimum questions per page (configurable via
// questionsPerPage), paginating across multiple pages if a unit has more
// questions than fit on one page.
//
// Name pre-fill: the server has no stored names (per the zero-cloud-name
// design) - if a real name should be printed, it must be supplied per
// request via studentNames (a client-supplied {studentId: name} map,
// loaded from the teacher's local roster file at generation time only,
// never persisted here).

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/';
const VERSIONS_PER_STUDENT = 10;
const MIN_QUESTIONS_PER_PAGE = 10;

const anthropic = new Anthropic();

const STATIC_LABELS = {
  english: { name: 'Name:', answers: 'Answers', version: (v, total) => `Version ${v} of ${total}`, defaultInstructions: 'Complete each question below.' },
  french: { name: 'Nom :', answers: 'Réponses', version: (v, total) => `Version ${v} sur ${total}`, defaultInstructions: 'Complétez chaque question ci-dessous.' },
  spanish: { name: 'Nombre:', answers: 'Respuestas', version: (v, total) => `Versión ${v} de ${total}`, defaultInstructions: 'Completa cada pregunta a continuación.' },
};

// Translates the question TEMPLATE (with {variable} placeholders intact,
// numbers not yet substituted) once per generation request - not per
// version - so 10 AI calls per student aren't needed. The translated
// template then gets randomized per-version exactly like the English one.
async function translateTemplate(questionTemplate, language) {
  if (language === 'english' || !language) return questionTemplate;
  const prompt = `Translate the following math question templates into ${language}. Keep every {variable} placeholder EXACTLY as-is (do not translate variable names inside braces) - only translate the surrounding language. Keep answer_formula fields unchanged (they're math expressions, not language). Also translate this instructions line if present: "${questionTemplate.instructions || ''}".

Questions (JSON): ${JSON.stringify(questionTemplate.questions)}

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{ "instructions": "translated instructions or empty string", "questions": [{ "prompt": "translated prompt with {variable} placeholders preserved", "answer_formula": "unchanged" }] }`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = message.content.find((b) => b.type === 'text')?.text || '';
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      ...questionTemplate,
      instructions: parsed.instructions || questionTemplate.instructions,
      questions: parsed.questions || questionTemplate.questions,
    };
  } catch {
    // Translation failed to parse - fall back to English rather than break generation.
    return questionTemplate;
  }
}

async function translateTitle(title, language) {
  if (language === 'english' || !language || !title) return title;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: `Translate this worksheet title into ${language}. Respond with ONLY the translated title, no quotes, no other text: "${title}"` }],
    });
    const translated = message.content.find((b) => b.type === 'text')?.text?.trim();
    return translated || title;
  } catch {
    return title;
  }
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const ANSWER_COL_W = 90;
const HEADER_H = 150; // room for up to 2-line title + name + up to 2-line instructions, clear of the QR corner

async function fetchQrPng(data, sizePx = 150) {
  const url = `${QR_API}?size=${sizePx}x${sizePx}&data=${encodeURIComponent(data)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('QR generation service failed');
  return res.arrayBuffer();
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Root cause of "only 1 question per page": template.questions typically
// holds just 1-2 QUESTION PATTERNS (e.g. one "division as multiplication"
// pattern), not 10-20 individual questions. A real CommonCoreSheets-style
// worksheet repeats that pattern many times with fresh random values each
// time - it doesn't just render the pattern once. This now cycles through
// the available pattern(s) to fill exactly targetCount questions, each an
// independently randomized instance.
// Difficulty is a 1-10 slider (5 = the unit's original authored range,
// unchanged). Above 5, the top of each variable's range scales up
// (bigger numbers, harder); below 5, it scales down (smaller numbers,
// easier). The bottom of the range stays fixed - we're not making things
// trivially easy, just narrowing/widening the harder end.
function scaleRanges(ranges, difficulty) {
  if (!ranges || difficulty === 5) return ranges;
  const factor = difficulty / 5; // 1 -> 0.2x, 10 -> 2x
  const scaled = {};
  for (const [key, range] of Object.entries(ranges)) {
    const span = range.max - range.min;
    const newMax = Math.max(range.min + 1, Math.round(range.min + span * factor));
    scaled[key] = { min: range.min, max: newMax };
  }
  return scaled;
}

function fillOneInstance(q, template, randomize, difficulty) {
  if (!randomize || !template.randomizable_ranges) return { ...q };
  const ranges = scaleRanges(template.randomizable_ranges, difficulty ?? 5);
  const vars = {};
  for (const [key, range] of Object.entries(ranges)) {
    vars[key] = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }
  let prompt = q.prompt;
  for (const [key, val] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{${key}}`, val);
  }
  return { ...q, prompt, resolvedVariables: vars };
}

function buildQuestions(template, { randomize, shuffleOrder, targetCount, difficulty }) {
  const patterns = template.questions;
  const count = targetCount || patterns.length;
  let questions = [];
  for (let i = 0; i < count; i++) {
    const pattern = patterns[i % patterns.length]; // cycle through available patterns
    questions.push(fillOneInstance(pattern, template, randomize, difficulty));
  }
  if (shuffleOrder) questions = shuffle(questions);
  return questions;
}

// AI rewrites the instructions line at a simpler reading level, in the
// target language, once per generation request (not per version).
async function simplifyInstructionsText(instructions, language) {
  if (!instructions) return instructions;
  try {
    const langNote = language && language !== 'english' ? ` Keep it in ${language}.` : '';
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{ role: 'user', content: `Rewrite this worksheet instruction line for a younger/struggling reader - shorter sentences, simpler words, same meaning.${langNote} Respond with ONLY the rewritten line: "${instructions}"` }],
    });
    return message.content.find((b) => b.type === 'text')?.text?.trim() || instructions;
  } catch {
    return instructions;
  }
}

// Generates one fully-worked example question (like the "Ex)" row on
// CommonCoreSheets worksheets) - a real solved instance with step-by-step
// reasoning shown, not just the answer.
async function generateWorkedExample(template, language, difficulty) {
  const pattern = template.questions[0];
  if (!pattern) return null;
  const ranges = scaleRanges(template.randomizable_ranges, difficulty ?? 5);
  const vars = {};
  for (const [key, range] of Object.entries(ranges || {})) {
    vars[key] = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }
  let prompt = pattern.prompt;
  for (const [key, val] of Object.entries(vars)) prompt = prompt.replaceAll(`{${key}}`, val);

  try {
    const langNote = language && language !== 'english' ? ` Write it in ${language}.` : '';
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Solve this math question step by step, showing the reasoning a student should follow, in 2-4 short numbered steps.${langNote} Question: "${prompt}"\n\nRespond with ONLY the numbered steps, no preamble.` }],
    });
    const steps = message.content.find((b) => b.type === 'text')?.text?.trim() || '';
    return { prompt, steps };
  } catch {
    return null;
  }
}

// Looks at a student's recent scores on this unit and nudges their
// personal difficulty up or down from the base setting - struggling
// students get an easier version, students doing well get pushed further.
async function getStudentDifficulty(supabase, studentId, microUnitId, baseDifficulty) {
  try {
    const { data: recent } = await supabase
      .from('attempts')
      .select('score_pct')
      .eq('student_id', studentId)
      .eq('micro_unit_id', microUnitId)
      .not('score_pct', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    if (!recent || recent.length === 0) return baseDifficulty;
    const avg = recent.reduce((s, r) => s + r.score_pct, 0) / recent.length;
    if (avg >= 90) return Math.min(10, baseDifficulty + 2);
    if (avg >= 75) return Math.min(10, baseDifficulty + 1);
    if (avg < 50) return Math.max(1, baseDifficulty - 2);
    if (avg < 65) return Math.max(1, baseDifficulty - 1);
    return baseDifficulty;
  } catch {
    return baseDifficulty;
  }
}

// Wraps text to fit within maxWidth, returning an array of lines.
function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function drawHeader(page, font, boldFont, unit, studentName, versionNumber, labels) {
  const { width, height } = page.getSize();
  const qrReserve = 75; // QR occupies the top-right 55x55 box + margin - nothing else may enter this zone
  const contentWidth = width - MARGIN - qrReserve;

  // Title - wrapped to stay clear of the QR corner entirely (previous bug:
  // fixed-position title/name text ran directly under/behind the QR for
  // any non-trivial title length, and never accounted for translated
  // titles being longer in French/Spanish).
  const titleText = unit.title || 'Math Practice';
  const titleLines = wrapText(titleText, boldFont, 15, contentWidth).slice(0, 2); // cap at 2 lines
  let y = height - 30;
  titleLines.forEach((line) => {
    page.drawText(line, { x: MARGIN, y, size: 15, font: boldFont });
    y -= 18;
  });

  // Name field - its own line below the title, never sharing a row with
  // the QR or competing for the same horizontal space.
  y -= 4;
  const nameLabel = studentName ? `${labels.name} ${studentName}` : `${labels.name} _______________________`;
  page.drawText(nameLabel, { x: MARGIN, y, size: 11, font });
  page.drawText(labels.version(versionNumber, VERSIONS_PER_STUDENT), { x: width - qrReserve - 5, y: height - 8, size: 7, color: rgb(0.5, 0.5, 0.5), font, });

  y -= 22;
  const instructions = unit.question_template?.instructions || labels.defaultInstructions;
  const instrLines = wrapText(instructions, font, 10, contentWidth);
  instrLines.forEach((line) => {
    page.drawText(line, { x: MARGIN, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 13;
  });

  // Divider before the Answers column
  page.drawLine({
    start: { x: width - MARGIN - ANSWER_COL_W - 10, y: height - HEADER_H + 20 },
    end: { x: width - MARGIN - ANSWER_COL_W - 10, y: 40 },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  page.drawText(labels.answers, { x: width - MARGIN - ANSWER_COL_W + 5, y: height - HEADER_H + 20, size: 11, font: boldFont });
}

function drawAnswersColumn(page, font, startIndex, count) {
  const { width, height } = page.getSize();
  const colX = width - MARGIN - ANSWER_COL_W + 5;
  // Shifted down from the divider header to leave clear room for the QR
  // code sitting in the top-right corner, per Aj's instruction.
  let y = height - HEADER_H;
  const rowH = (y - 50) / count;
  for (let i = 0; i < count; i++) {
    page.drawText(`${startIndex + i + 1}.`, { x: colX, y, size: 10, font });
    page.drawLine({ start: { x: colX + 20, y: y - 3 }, end: { x: colX + ANSWER_COL_W - 15, y: y - 3 }, thickness: 0.75, color: rgb(0.3, 0.3, 0.3) });
    y -= rowH;
  }
}

async function drawQuestionsPage(pdfDoc, unit, questions, startIndex, studentName, versionNumber, labels, workedExample) {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawHeader(page, font, boldFont, unit, studentName, versionNumber, labels);
  drawAnswersColumn(page, font, startIndex, questions.length);

  // Worked example ("Ex)" row) - only on the first page of a version, shown
  // solved step-by-step so students see the reasoning before attempting
  // their own questions, matching the CommonCoreSheets convention.
  let gridTopOffset = 0;
  if (workedExample && startIndex === 0) {
    const exY = PAGE_H - HEADER_H;
    const exWidth = PAGE_W - MARGIN - ANSWER_COL_W - 30;
    page.drawText(`Ex) ${workedExample.prompt}`, { x: MARGIN, y: exY, size: 11, font: boldFont, color: rgb(0.1, 0.4, 0.1) });
    const stepLines = wrapText(workedExample.steps, font, 9, exWidth).slice(0, 4);
    let sy = exY - 14;
    stepLines.forEach((line) => {
      page.drawText(line, { x: MARGIN + 12, y: sy, size: 9, font, color: rgb(0.1, 0.4, 0.1) });
      sy -= 11;
    });
    gridTopOffset = 14 + stepLines.length * 11 + 12;
  }

  // 3-column grid to match CommonCoreSheets' actual layout - falls back to
  // 2 columns automatically when question text is long (word problems),
  // since 3 narrow columns would force too much wrapping and risk overflow.
  const avgPromptLen = questions.reduce((sum, q) => sum + q.prompt.length, 0) / (questions.length || 1);
  const numCols = avgPromptLen > 45 ? 2 : 3;

  const gridLeft = MARGIN;
  const gridRight = PAGE_W - MARGIN - ANSWER_COL_W - 20;
  const colGap = 20;
  const colW = (gridRight - gridLeft - colGap * (numCols - 1)) / numCols;
  const colXs = Array.from({ length: numCols }, (_, i) => gridLeft + i * (colW + colGap));

  const rowsNeeded = Math.ceil(questions.length / numCols);
  const availableH = PAGE_H - HEADER_H - 50;
  const rowH = Math.max(55, availableH / rowsNeeded);
  const maxTextWidth = colW - 10;

  questions.forEach((q, i) => {
    const col = i % numCols;
    const row = Math.floor(i / numCols);
    const x = colXs[col];
    let y = PAGE_H - HEADER_H - gridTopOffset - row * rowH;
    if (y < 50) return; // safety guard only - rowH is sized to fit, shouldn't trigger

    const numberedPrompt = `${startIndex + i + 1}) ${q.prompt}`;
    const lines = wrapText(numberedPrompt, font, 11, maxTextWidth);
    lines.forEach((line, li) => {
      page.drawText(line, { x, y: y - li * 14, size: 11, font });
    });
    // Work/answer line beneath the (possibly wrapped) prompt.
    const workY = y - lines.length * 14 - 6;
    page.drawLine({ start: { x, y: workY }, end: { x: x + maxTextWidth * 0.7, y: workY }, thickness: 0.75, color: rgb(0.3, 0.3, 0.3) });
  });

  return page;
}

function computeAnswer(q) {
  if (!q.answer_formula || !q.resolvedVariables) return null;
  try {
    // Safe-ish: only ever evaluates AI/teacher-authored formulas (e.g. "a+b")
    // against numeric variables resolved server-side, not arbitrary user input.
    const fn = new Function(...Object.keys(q.resolvedVariables), `return ${q.answer_formula};`);
    return fn(...Object.values(q.resolvedVariables));
  } catch {
    return null;
  }
}

function drawAnswerKeyPage(pdfDoc, unit, questions, startIndex, font, boldFont, labels) {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const { height } = page.getSize();
  page.drawText(`${unit.title || 'Math Practice'} — ${labels.answers} Key`, { x: MARGIN, y: height - 40, size: 16, font: boldFont, color: rgb(0.7, 0.1, 0.1) });

  let y = height - 80;
  questions.forEach((q, i) => {
    const answer = computeAnswer(q);
    page.drawText(`${startIndex + i + 1}) ${answer != null ? answer : '—'}`, { x: MARGIN, y, size: 12, font, color: rgb(0.7, 0.1, 0.1) });
    y -= 22;
    if (y < 50) return;
  });
}

async function generatePdfForStudent(unit, allQuestions, student, mode, qrPng, studentName, versionNumber, questionsPerPage, labels, includeAnswerKey, workedExample) {
  const pdfDoc = await PDFDocument.create();

  if (unit.resource_url) {
    // Resource overlay mode unchanged - QR placed on the uploaded file's own layout.
    const baseRes = await fetch(unit.resource_url);
    if (!baseRes.ok) throw new Error(`Could not fetch attached resource for this unit (status ${baseRes.status})`);
    const contentType = baseRes.headers.get('content-type') || '';
    const baseBytes = await baseRes.arrayBuffer();
    let page;
    let doc = pdfDoc;
    if (contentType.includes('pdf') || unit.resource_url.toLowerCase().endsWith('.pdf')) {
      doc = await PDFDocument.load(baseBytes);
      page = doc.getPage(0);
    } else {
      page = doc.addPage([PAGE_W, PAGE_H]);
      const img = contentType.includes('png') || unit.resource_url.toLowerCase().endsWith('.png')
        ? await doc.embedPng(baseBytes)
        : await doc.embedJpg(baseBytes);
      const { width, height } = page.getSize();
      page.drawImage(img, { x: 0, y: 0, width, height });
    }
    const qrImage = await doc.embedPng(qrPng);
    const qrSize = 60;
    const { width, height } = page.getSize();
    page.drawImage(qrImage, { x: width - qrSize - 20, y: height - qrSize - 20, width: qrSize, height: qrSize });
    const outBytes = await doc.save();
    return outBytes;
  }

  // Standard generated layout, paginated at questionsPerPage per page.
  for (let start = 0; start < allQuestions.length; start += questionsPerPage) {
    const chunk = allQuestions.slice(start, start + questionsPerPage);
    const page = await drawQuestionsPage(pdfDoc, unit, chunk, start, studentName, versionNumber, labels, workedExample);
    const qrImage = await pdfDoc.embedPng(qrPng);
    const qrSize = 55;
    page.drawImage(qrImage, { x: PAGE_W - qrSize - 15, y: PAGE_H - qrSize - 5, width: qrSize, height: qrSize });
  }

  if (includeAnswerKey) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    for (let start = 0; start < allQuestions.length; start += questionsPerPage) {
      const chunk = allQuestions.slice(start, start + questionsPerPage);
      drawAnswerKeyPage(pdfDoc, unit, chunk, start, font, boldFont, labels);
    }
  }

  return pdfDoc.save();
}

export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { microUnitId, mode, shuffleOrder, questionsPerPage: qppInput, studentNames, language, includeAnswerKey, previewOnly, difficulty: difficultyInput, simplifyInstructions, showWorkedExample, differentiatePerStudent } = await request.json();
    if (!microUnitId || !mode) {
      return Response.json({ error: 'microUnitId and mode required' }, { status: 400 });
    }
    if (!['printed', 'blank', 'online'].includes(mode)) {
      return Response.json({ error: "mode must be 'printed', 'blank', or 'online'" }, { status: 400 });
    }
    const questionsPerPage = Math.max(MIN_QUESTIONS_PER_PAGE, Number(qppInput) || MIN_QUESTIONS_PER_PAGE);
    const baseDifficulty = Math.min(10, Math.max(1, Number(difficultyInput) || 5));
    const lang = ['english', 'french', 'spanish'].includes(language) ? language : 'english';
    const labels = STATIC_LABELS[lang];

    const { data: unit, error: unitErr } = await supabase
      .from('micro_units')
      .select('*')
      .eq('id', microUnitId)
      .single();
    if (unitErr || !unit) return Response.json({ error: 'micro_unit not found' }, { status: 404 });

    // Translate once per generation request, not per version - keeps this
    // fast regardless of how many students/versions are being generated.
    const translatedTemplate = mode !== 'online' ? await translateTemplate(unit.question_template, lang) : unit.question_template;
    const translatedTitle = mode !== 'online' ? await translateTitle(unit.title, lang) : unit.title;
    const finalInstructions = simplifyInstructions && mode !== 'online'
      ? await simplifyInstructionsText(translatedTemplate.instructions, lang)
      : translatedTemplate.instructions;
    const effectiveUnit = {
      ...unit,
      question_template: { ...translatedTemplate, instructions: finalInstructions },
      title: translatedTitle,
    };

    const workedExample = showWorkedExample && mode !== 'online'
      ? await generateWorkedExample(effectiveUnit.question_template, lang, baseDifficulty)
      : null;

    const { data: students, error: studErr } = await supabase
      .from('students')
      .select('*')
      .eq('teacher_id', unit.teacher_id);
    if (studErr) return Response.json({ error: studErr.message }, { status: 500 });

    if (mode === 'online') {
      const links = [];
      for (const s of students || []) {
        const url = `https://math-mastery-three.vercel.app/practice/${microUnitId}?student=${s.id}`;
        const qrPng = await fetchQrPng(url, 200);
        links.push({ studentId: s.id, url, qrPngBase64: Buffer.from(qrPng).toString('base64') });
      }
      return Response.json({
        mode: 'online',
        microUnitId,
        links,
        exemplarNote: links.length === 0 ? 'Your roster is empty - add students to generate real practice links.' : null,
      });
    }

    // Preview mode: generate exactly 1 real page (not the full 10-versions-
    // per-student batch) so the teacher can check the layout before
    // committing to a full generation run. Nothing gets saved to attempts.
    if (previewOnly) {
      const questions = buildQuestions(effectiveUnit.question_template, { randomize: effectiveUnit.randomizable, shuffleOrder: !!shuffleOrder, targetCount: questionsPerPage, difficulty: baseDifficulty });
      const previewQrPng = await fetchQrPng('preview', 150);
      const outBytes = await generatePdfForStudent(effectiveUnit, questions, { id: 'preview', qr_code: 'PREVIEW' }, mode, previewQrPng, null, 1, questionsPerPage, labels, !!includeAnswerKey, workedExample);
      return Response.json({ mode, preview: true, pdfBase64: Buffer.from(outBytes).toString('base64') });
    }

    const isExemplar = (students || []).length === 0;
    const studentList = isExemplar ? [{ id: 'exemplar', qr_code: 'EXEMPLAR-QR' }] : students;

    const results = [];
    for (const student of studentList) {
      const versions = [];
      const submitUrl = `https://math-mastery-three.vercel.app/practice/${microUnitId}?student=${student.id}&mode=scan`;
      const qrPng = await fetchQrPng(submitUrl);
      // Name supplied per-request only (from the teacher's local roster
      // file, if they chose to load one for this generation) - never
      // stored. Blank mode ignores this entirely by design.
      const suppliedName = mode === 'printed' ? studentNames?.[student.id] : null;

      // Per-student difficulty, based on their recent scores on this unit,
      // when differentiation is on - otherwise everyone gets baseDifficulty.
      const studentDifficulty = differentiatePerStudent && !isExemplar
        ? await getStudentDifficulty(supabase, student.id, microUnitId, baseDifficulty)
        : baseDifficulty;

      for (let v = 1; v <= VERSIONS_PER_STUDENT; v++) {
        const questions = buildQuestions(effectiveUnit.question_template, { randomize: effectiveUnit.randomizable, shuffleOrder: !!shuffleOrder, targetCount: questionsPerPage, difficulty: studentDifficulty });
        const outBytes = await generatePdfForStudent(effectiveUnit, questions, student, mode, qrPng, suppliedName, v, questionsPerPage, labels, !!includeAnswerKey, workedExample);

        if (!isExemplar) {
          await supabase.from('attempts').insert({
            student_id: student.id,
            micro_unit_id: microUnitId,
            submitted_via: mode === 'blank' ? 'blank_scan' : 'scan',
            raw_answers: { generated: true, version: v, questions },
            attempt_number: v,
          });
        }
        versions.push({ versionNumber: v, pdfBase64: Buffer.from(outBytes).toString('base64'), questions });
      }
      results.push({ studentId: student.id, versions });
    }

    return Response.json({
      mode,
      microUnitId,
      worksheets: results,
      versionsPerStudent: VERSIONS_PER_STUDENT,
      questionsPerPage,
      isExemplar,
      exemplarNote: isExemplar ? `Your roster is empty, so this is ${VERSIONS_PER_STUDENT} example versions showing the format - add students to generate real ones.` : null,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}


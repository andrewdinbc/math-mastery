import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const ANSWER_COL_W = 90;
const HEADER_H = 110; // room for title + name/QR

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

function buildQuestions(template, { randomize, shuffleOrder }) {
  let questions = template.questions;
  if (randomize && template.randomizable_ranges) {
    questions = questions.map((q) => {
      const vars = {};
      for (const [key, range] of Object.entries(template.randomizable_ranges)) {
        vars[key] = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      }
      let prompt = q.prompt;
      for (const [key, val] of Object.entries(vars)) {
        prompt = prompt.replaceAll(`{${key}}`, val);
      }
      return { ...q, prompt, resolvedVariables: vars };
    });
  }
  if (shuffleOrder) questions = shuffle(questions);
  return questions;
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

async function drawHeader(page, font, boldFont, unit, studentName, versionNumber) {
  const { width, height } = page.getSize();
  page.drawText(unit.title || 'Math Practice', { x: MARGIN, y: height - 40, size: 16, font: boldFont });
  page.drawText(`Version ${versionNumber} of ${VERSIONS_PER_STUDENT}`, { x: width - 150, y: height - 25, size: 8, color: rgb(0.5, 0.5, 0.5), font });

  // Name field - top right, QR gets overlaid to the right of/over this by the caller.
  const nameLabel = studentName ? `Name: ${studentName}` : 'Name: _______________________';
  page.drawText(nameLabel, { x: width - 260, y: height - 45, size: 11, font });

  const instructions = unit.question_template?.instructions || 'Complete each question below.';
  page.drawText(instructions, { x: MARGIN, y: height - 65, size: 10, font, color: rgb(0.2, 0.2, 0.2) });

  // Divider before the Answers column
  page.drawLine({
    start: { x: width - MARGIN - ANSWER_COL_W - 10, y: height - HEADER_H + 20 },
    end: { x: width - MARGIN - ANSWER_COL_W - 10, y: 40 },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  page.drawText('Answers', { x: width - MARGIN - ANSWER_COL_W + 5, y: height - HEADER_H + 20, size: 11, font: boldFont });
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

async function drawQuestionsPage(pdfDoc, unit, questions, startIndex, studentName, versionNumber) {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawHeader(page, font, boldFont, unit, studentName, versionNumber);
  drawAnswersColumn(page, font, startIndex, questions.length);

  // 2-column grid for the questions themselves - narrower than a 3-column
  // layout so word-problem text has room to wrap instead of running off
  // the page edge.
  const gridLeft = MARGIN;
  const gridRight = PAGE_W - MARGIN - ANSWER_COL_W - 20;
  const colW = (gridRight - gridLeft - 20) / 2;
  const colXs = [gridLeft, gridLeft + colW + 20];

  const rowsNeeded = Math.ceil(questions.length / 2);
  const availableH = PAGE_H - HEADER_H - 50;
  const rowH = Math.max(60, availableH / rowsNeeded);
  const maxTextWidth = colW - 10;

  questions.forEach((q, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = colXs[col];
    let y = PAGE_H - HEADER_H - row * rowH;
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

async function generatePdfForStudent(unit, allQuestions, student, mode, qrPng, studentName, versionNumber, questionsPerPage) {
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
    const page = await drawQuestionsPage(pdfDoc, unit, chunk, start, studentName, versionNumber);
    const qrImage = await pdfDoc.embedPng(qrPng);
    const qrSize = 55;
    page.drawImage(qrImage, { x: PAGE_W - qrSize - 15, y: PAGE_H - qrSize - 5, width: qrSize, height: qrSize });
  }

  return pdfDoc.save();
}

export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { microUnitId, mode, shuffleOrder, questionsPerPage: qppInput, studentNames } = await request.json();
    if (!microUnitId || !mode) {
      return Response.json({ error: 'microUnitId and mode required' }, { status: 400 });
    }
    if (!['printed', 'blank', 'online'].includes(mode)) {
      return Response.json({ error: "mode must be 'printed', 'blank', or 'online'" }, { status: 400 });
    }
    const questionsPerPage = Math.max(MIN_QUESTIONS_PER_PAGE, Number(qppInput) || MIN_QUESTIONS_PER_PAGE);

    const { data: unit, error: unitErr } = await supabase
      .from('micro_units')
      .select('*')
      .eq('id', microUnitId)
      .single();
    if (unitErr || !unit) return Response.json({ error: 'micro_unit not found' }, { status: 404 });

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

      for (let v = 1; v <= VERSIONS_PER_STUDENT; v++) {
        const questions = buildQuestions(unit.question_template, { randomize: unit.randomizable, shuffleOrder: !!shuffleOrder });
        const outBytes = await generatePdfForStudent(unit, questions, student, mode, qrPng, suppliedName, v, questionsPerPage);

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

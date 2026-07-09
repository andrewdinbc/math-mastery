import { PDFDocument, rgb } from 'pdf-lib';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Generates worksheets for a micro-unit in one of three modes, adapted from
// parent-portal's qr-worksheet pattern (app/api/qr-worksheet/route.js):
//   'printed' — QR pre-filled, name pre-filled where known, 10 versions/student
//   'blank'   — QR pre-filled, student writes name, 10 versions/student
//   'online'  — no PDF, just a list of direct practice links
//
// Standard: 10 different randomized versions generated per student for
// printed/blank modes, per Aj's direction - gives real practice variety
// rather than one static copy reused every time.
//
// shuffleOrder: independent of numeric randomization - also shuffles the
// ORDER questions appear in, when true.

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/';
const VERSIONS_PER_STUDENT = 10;

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

async function drawWorksheetPage(pdfDoc, unit, questions, studentName, isBlank, versionNumber) {
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  page.drawText(unit.title || 'Math Practice', { x: 40, y: height - 50, size: 16 });
  page.drawText(`Version ${versionNumber} of ${VERSIONS_PER_STUDENT}`, { x: width - 140, y: height - 50, size: 10, color: rgb(0.5, 0.5, 0.5) });

  if (isBlank) {
    page.drawText('Name: _______________________', { x: 40, y: height - 80, size: 12 });
  } else {
    // Names may not be known server-side at all (never stored in the
    // cloud, per Aj's privacy design) - always fall back to a blank line.
    const safeName = studentName && !studentName.startsWith('enc:') ? studentName : '';
    page.drawText(`Name: ${safeName}`, { x: 40, y: height - 80, size: 12 });
  }

  let y = height - 130;
  questions.forEach((q, i) => {
    if (y < 60) return; // simple overflow guard; real version would paginate
    page.drawText(`${i + 1}) ${q.prompt}`, { x: 40, y, size: 12 });
    y -= 40;
  });

  return page;
}

async function generateOnePdf(unit, questions, student, mode, qrPng) {
  let pdfDoc, page;
  if (unit.resource_url) {
    const baseRes = await fetch(unit.resource_url);
    if (!baseRes.ok) throw new Error(`Could not fetch attached resource for this unit (status ${baseRes.status})`);
    const contentType = baseRes.headers.get('content-type') || '';
    const baseBytes = await baseRes.arrayBuffer();
    if (contentType.includes('pdf') || unit.resource_url.toLowerCase().endsWith('.pdf')) {
      pdfDoc = await PDFDocument.load(baseBytes);
      page = pdfDoc.getPage(0);
    } else {
      pdfDoc = await PDFDocument.create();
      page = pdfDoc.addPage([612, 792]);
      const img = contentType.includes('png') || unit.resource_url.toLowerCase().endsWith('.png')
        ? await pdfDoc.embedPng(baseBytes)
        : await pdfDoc.embedJpg(baseBytes);
      const { width, height } = page.getSize();
      page.drawImage(img, { x: 0, y: 0, width, height });
    }
  } else {
    pdfDoc = await PDFDocument.create();
    page = await drawWorksheetPage(pdfDoc, unit, questions, student.display_name, mode === 'blank', student.__versionNumber);
  }

  const qrImage = await pdfDoc.embedPng(qrPng);
  const qrSize = 60;
  const { width, height } = page.getSize();
  page.drawImage(qrImage, { x: width - qrSize - 20, y: height - qrSize - 20, width: qrSize, height: qrSize });

  return pdfDoc.save();
}

export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { microUnitId, mode, shuffleOrder } = await request.json();
    if (!microUnitId || !mode) {
      return Response.json({ error: 'microUnitId and mode required' }, { status: 400 });
    }
    if (!['printed', 'blank', 'online'].includes(mode)) {
      return Response.json({ error: "mode must be 'printed', 'blank', or 'online'" }, { status: 400 });
    }

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
      const links = (students || []).map((s) => ({
        studentId: s.id,
        url: `https://math-mastery-three.vercel.app/practice/${microUnitId}?student=${s.id}`,
      }));
      return Response.json({
        mode: 'online',
        microUnitId,
        links,
        exemplarNote: links.length === 0 ? 'Your roster is empty - add students to generate real practice links.' : null,
      });
    }

    // Empty roster: generate 1 exemplar student's worth (still 10 versions)
    // so the teacher can see real format/variety before adding a roster.
    const isExemplar = (students || []).length === 0;
    const studentList = isExemplar ? [{ id: 'exemplar', display_name: 'Example Student', qr_code: 'EXEMPLAR-QR' }] : students;

    const results = [];
    for (const student of studentList) {
      const versions = [];
      const submitUrl = `https://math-mastery-three.vercel.app/practice/${microUnitId}?student=${student.id}&mode=scan`;
      const qrPng = await fetchQrPng(submitUrl); // same QR across all 10 versions - it identifies the STUDENT, not the version

      for (let v = 1; v <= VERSIONS_PER_STUDENT; v++) {
        const questions = buildQuestions(unit.question_template, { randomize: unit.randomizable, shuffleOrder: !!shuffleOrder });
        const outBytes = await generateOnePdf(unit, questions, { ...student, __versionNumber: v }, mode, qrPng);

        if (!isExemplar) {
          await supabase.from('attempts').insert({
            student_id: student.id,
            micro_unit_id: microUnitId,
            submitted_via: mode === 'blank' ? 'blank_scan' : 'scan',
            raw_answers: { generated: true, version: v, questions },
            attempt_number: v,
          });
        }
        versions.push({ versionNumber: v, pdfBase64: Buffer.from(outBytes).toString('base64') });
      }
      results.push({ studentId: student.id, versions });
    }

    return Response.json({
      mode,
      microUnitId,
      worksheets: results,
      versionsPerStudent: VERSIONS_PER_STUDENT,
      isExemplar,
      exemplarNote: isExemplar ? `Your roster is empty, so this is ${VERSIONS_PER_STUDENT} example versions showing the format - add students to generate real ones.` : null,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

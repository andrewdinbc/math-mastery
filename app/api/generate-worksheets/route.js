import { PDFDocument, rgb } from 'pdf-lib';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Generates worksheets for a micro-unit in one of three modes, adapted from
// parent-portal's qr-worksheet pattern (app/api/qr-worksheet/route.js):
//   'printed' — one PDF per student, name pre-filled, QR top-right
//   'blank'   — one PDF per student, blank name line, QR top-right
//   'online'  — no PDF, just a list of direct practice links
//
// Randomization: if the micro_unit is randomizable, each student's copy
// gets its own randomized numeric values derived from question_template,
// so no two printed copies are identical (mirrors the CommonCoreSheets
// reference worksheet Aj shared — same structure, different numbers, with
// an answer key generated alongside).

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/';

async function fetchQrPng(data, sizePx = 150) {
  const url = `${QR_API}?size=${sizePx}x${sizePx}&data=${encodeURIComponent(data)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('QR generation service failed');
  return res.arrayBuffer();
}

function randomizeTemplate(template) {
  // question_template.questions is an array of {prompt, variables: {min,max}, answer_formula}.
  // Substitutes fresh random values into each question's variable ranges
  // while keeping the underlying structure/difficulty the same.
  if (!template.randomizable_ranges) return template.questions;
  return template.questions.map((q) => {
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

async function drawWorksheetPage(pdfDoc, unit, questions, studentName, isBlank) {
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  page.drawText(unit.title || 'Math Practice', { x: 40, y: height - 50, size: 16 });
  if (isBlank) {
    page.drawText('Name: _______________________', { x: 40, y: height - 80, size: 12 });
  } else {
    // Names may be end-to-end encrypted (stored as 'enc:...') - the server
  // never has the key, so it can never print the real name. Always fall
  // back to a blank line in that case rather than printing raw ciphertext.
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

export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { microUnitId, mode } = await request.json();
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
        displayName: s.display_name && !s.display_name.startsWith('enc:') ? s.display_name : null, // encrypted names can't be shown server-side
        url: `https://math-mastery-three.vercel.app/practice/${microUnitId}?student=${s.id}`,
      }));
      return Response.json({
        mode: 'online',
        microUnitId,
        links,
        exemplarNote: links.length === 0 ? 'Your roster is empty - add students to generate real practice links.' : null,
      });
    }

    // 'printed' or 'blank': generate one PDF per student, zip-less — return
    // the first student's PDF directly and a manifest for the rest (a real
    // bulk-download flow would zip these; kept simple for the first pass).
    //
    // Empty roster: generate exactly 1 exemplar (using a placeholder
    // "Example Student" name/QR) so the teacher can see the actual worksheet
    // format before adding a real roster, rather than silently generating
    // nothing with no explanation.
    const isExemplar = (students || []).length === 0;
    const studentList = isExemplar
      ? [{ id: 'exemplar', display_name: 'Example Student', qr_code: 'EXEMPLAR-QR' }]
      : students;

    const results = [];
    for (const student of studentList) {
      const questions = unit.randomizable ? randomizeTemplate(unit.question_template) : unit.question_template.questions;
      const submitUrl = `https://math-mastery-three.vercel.app/practice/${microUnitId}?student=${student.id}&mode=scan`;
      const qrPng = await fetchQrPng(submitUrl);

      // If a resource was uploaded for this unit, overlay the QR onto the
      // first page of it (matching parent-portal's basePdfUrl pattern)
      // instead of drawing a page from scratch.
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
          // Image resource (png/jpg): create a page and place the image full-bleed.
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
        page = await drawWorksheetPage(pdfDoc, unit, questions, student.display_name, mode === 'blank');
      }

      const qrImage = await pdfDoc.embedPng(qrPng);
      const qrSize = 60;
      const { width, height } = page.getSize();
      page.drawImage(qrImage, { x: width - qrSize - 20, y: height - qrSize - 20, width: qrSize, height: qrSize });

      const outBytes = await pdfDoc.save();

      // Store each generated worksheet's resolved questions (needed later
      // for AI marking, since randomized values differ per student) -
      // skipped for the exemplar since it isn't a real student.
      if (!isExemplar) {
        await supabase.from('attempts').insert({
          student_id: student.id,
          micro_unit_id: microUnitId,
          submitted_via: mode === 'blank' ? 'blank_scan' : 'scan',
          raw_answers: { generated: true, questions },
          attempt_number: 1,
        });
      }

      results.push({ studentId: student.id, pdfBase64: Buffer.from(outBytes).toString('base64') });
    }

    return Response.json({
      mode,
      microUnitId,
      worksheets: results,
      isExemplar,
      exemplarNote: isExemplar ? 'Your roster is empty, so this is 1 example worksheet showing the format - add students to generate real ones.' : null,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}




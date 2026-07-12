import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Common Core Sheets-style multiplication drill: a grid of basic facts
// (not the algebraic question_template system - drills are pure fluency
// practice, randomized within a fact-family range). Same per-student QR
// pattern already proven in the worksheet generator, and the same
// mastery-threshold + per-student differentiation model as the rest of
// this app: each student can get a different fact range based on where
// they actually are, not a one-size worksheet for the whole class.

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/'

async function fetchQrPng(data, sizePx = 130) {
  const url = `${QR_API}?size=${sizePx}x${sizePx}&data=${encodeURIComponent(data)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('QR generation service failed')
  return res.arrayBuffer()
}

function generateDrillProblems(count, factMin, factMax) {
  const problems = []
  for (let i = 0; i < count; i++) {
    const a = Math.floor(Math.random() * (factMax - factMin + 1)) + factMin
    const b = Math.floor(Math.random() * (factMax - factMin + 1)) + factMin
    problems.push({ a, b, answer: a * b })
  }
  return problems
}

async function drawDrillPage(pdfDoc, font, title, problems, qrBytes, studentQrId) {
  const page = pdfDoc.addPage([612, 792]) // letter
  const { width, height } = page.getSize()

  page.drawText(title, { x: 40, y: height - 40, size: 16, font })
  page.drawText('Name: _______________________', { x: 40, y: height - 65, size: 11, font })
  page.drawText('Time: ________  Score: ______ / ' + problems.length, { x: 320, y: height - 65, size: 11, font })

  const qrImage = await pdfDoc.embedPng(qrBytes)
  page.drawImage(qrImage, { x: width - 40 - 90, y: height - 40 - 90, width: 90, height: 90 })

  // Grid: 5 columns, rows as needed, matching Common Core Sheets' dense drill layout.
  const cols = 5
  const cellWidth = (width - 80) / cols
  const startY = height - 130
  const rowHeight = 34
  problems.forEach((p, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = 40 + col * cellWidth
    const y = startY - row * rowHeight
    page.drawText(`${p.a} x ${p.b} = _____`, { x, y, size: 12, font })
  })

  return page
}

export async function POST(request) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, problemCount, defaultFactMin, defaultFactMax, studentOverrides } = await request.json()
    // studentOverrides: [{ studentId, qrCode, factMin, factMax }] - lets the
    // teacher differentiate per student (e.g. one student still on 2s-5s
    // while the rest of the class is doing 6s-12s), matching the same
    // per-student threshold pattern used everywhere else in this app.
    if (!title || !problemCount) {
      return Response.json({ error: 'title and problemCount required' }, { status: 400 })
    }

    const { data: students } = await supabase
      .from('mastery_students')
      .select('id, qr_code')
      .eq('teacher_id', session.user.id)

    if (!students?.length) {
      return Response.json({ error: 'No students registered yet.' }, { status: 400 })
    }

    const overrideMap = Object.fromEntries((studentOverrides || []).map((o) => [o.studentId, o]))

    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const answerKeyByStudent = {}

    for (const student of students) {
      const override = overrideMap[student.id]
      const factMin = override?.factMin ?? defaultFactMin ?? 1
      const factMax = override?.factMax ?? defaultFactMax ?? 12
      const problems = generateDrillProblems(problemCount, factMin, factMax)
      answerKeyByStudent[student.qr_code] = problems.map((p) => p.answer)

      const qrBytes = await fetchQrPng(student.qr_code)
      await drawDrillPage(pdfDoc, font, title, problems, qrBytes, student.qr_code)
    }

    // Store the drill + per-student answer keys so a later scan-and-mark
    // step (next piece to build) can check submissions against the right
    // sheet - each student got different numbers, so the answer key has
    // to be tracked per student, not once per worksheet.
    await supabase.from('mastery_drills').insert({
      teacher_id: session.user.id,
      title,
      problem_count: problemCount,
      answer_key_by_student: answerKeyByStudent,
    })

    const pdfBytes = await pdfDoc.save()
    return new Response(pdfBytes, {
      headers: { 'Content-Type': 'application/pdf', 'X-Student-Count': String(students.length) },
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

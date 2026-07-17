import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export async function POST(req) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { microUnitId, mode } = await req.json();

    if (!microUnitId || !mode) {
      return NextResponse.json(
        { error: 'microUnitId and mode are required' },
        { status: 400 }
      );
    }

    if (!['printed', 'blank', 'online'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be printed, blank, or online' },
        { status: 400 }
      );
    }

    // Fetch micro_unit
    const { data: microUnit, error: unitError } = await supabase
      .from('micro_units')
      .select('*')
      .eq('id', microUnitId)
      .eq('teacher_id', session.user.id)
      .single();

    if (unitError || !microUnit) {
      return NextResponse.json(
        { error: 'Micro unit not found or not authorized' },
        { status: 404 }
      );
    }

    // For 'online' mode, just return links
    if (mode === 'online') {
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, display_name')
        .eq('teacher_id', session.user.id);

      if (studentsError) {
        return NextResponse.json(
          { error: 'Failed to fetch students' },
          { status: 500 }
        );
      }

      const links = students.map((student) => ({
        studentId: student.id,
        studentName: student.display_name,
        url: `/practice/${microUnitId}?student=${student.id}`,
      }));

      return NextResponse.json({ mode: 'online', links });
    }

    // For 'printed' and 'blank' modes, generate PDFs
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, display_name, qr_code')
      .eq('teacher_id', session.user.id);

    if (studentsError) {
      return NextResponse.json(
        { error: 'Failed to fetch students' },
        { status: 500 }
      );
    }

    if (students.length === 0) {
      return NextResponse.json(
        { error: 'No students found for this teacher' },
        { status: 400 }
      );
    }

    // Generate PDFs for each student
    const pdfs = [];
    for (const student of students) {
      const pdf = await generateWorksheetPDF(
        microUnit,
        student,
        mode
      );
      pdfs.push({
        studentId: student.id,
        studentName: student.display_name,
        pdfBuffer: pdf,
      });
    }

    // Return as a JSON response with base64-encoded PDFs
    const response = {
      mode,
      microUnitId,
      microUnitTitle: microUnit.title,
      pdfs: pdfs.map((p) => ({
        studentId: p.studentId,
        studentName: p.studentName,
        pdfBase64: p.pdfBuffer.toString('base64'),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating worksheets:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

async function generateWorksheetPDF(microUnit, student, mode) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size: 8.5" x 11"
  const { width, height } = page.getSize();

  const margin = 40;
  const contentWidth = width - 2 * margin;

  // Add title and header
  page.drawText(microUnit.title, {
    x: margin,
    y: height - margin - 24,
    size: 20,
    color: rgb(0, 0, 0),
  });

  // Add student name or blank line
  let yPos = height - margin - 60;
  if (mode === 'printed') {
    page.drawText(`Student: ${student.display_name}`, {
      x: margin,
      y: yPos,
      size: 12,
      color: rgb(0, 0, 0),
    });
  } else if (mode === 'blank') {
    page.drawText('Student Name: _________________________________', {
      x: margin,
      y: yPos,
      size: 12,
      color: rgb(0, 0, 0),
    });
  }

  yPos -= 40;

  // Add QR code in top-right corner
  const qrValue = `${student.qr_code}:${microUnit.id}`;
  const qrCodeImage = await QRCode.toDataURL(qrValue, {
    width: 150,
    margin: 2,
  });

  const qrDataUrl = qrCodeImage.split(',')[1]; // Extract base64
  const qrImageBytes = Buffer.from(qrDataUrl, 'base64');
  const qrImage = await pdfDoc.embedPng(qrImageBytes);
  const qrSize = 100;

  page.drawImage(qrImage, {
    x: width - margin - qrSize,
    y: height - margin - qrSize - 30,
    width: qrSize,
    height: qrSize,
  });

  // Render questions from question_template
  const questions = microUnit.question_template?.questions || [];

  for (const question of questions) {
    if (yPos < margin + 100) {
      // Add new page if running out of space
      yPos = height - margin;
      pdfDoc.addPage([612, 792]);
    }

    // Render question text with randomization if applicable
    let questionText = question.text;
    if (microUnit.randomizable && question.operands) {
      questionText = randomizeQuestion(question);
    }

    page.drawText(questionText, {
      x: margin,
      y: yPos,
      size: 12,
      color: rgb(0, 0, 0),
      maxWidth: contentWidth,
    });

    yPos -= 30;

    // Add space for answer
    if (mode === 'blank' || mode === 'printed') {
      page.drawText('Answer: ___________________', {
        x: margin + 20,
        y: yPos,
        size: 11,
        color: rgb(100, 100, 100),
      });
      yPos -= 30;
    }
  }

  // Add footer with QR note for blank mode
  if (mode === 'blank') {
    page.drawText(
      'Scan the QR code above to submit your answers online.',
      {
        x: margin,
        y: margin - 10,
        size: 10,
        color: rgb(100, 100, 100),
      }
    );
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function randomizeQuestion(question) {
  // Replace numeric operands with random values while preserving structure
  let randomizedText = question.text;

  if (question.operands && Array.isArray(question.operands)) {
    question.operands.forEach((operand, idx) => {
      const randomValue = Math.floor(
        Math.random() * (operand.max - operand.min + 1) + operand.min
      );
      randomizedText = randomizedText.replace(
        `{operand${idx}}`,
        randomValue.toString()
      );
    });
  }

  return randomizedText;
}

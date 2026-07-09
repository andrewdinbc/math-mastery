import { PDFDocument } from 'pdf-lib';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Downloads the teacher's full roster as one PDF: one page per student,
// name + their QR code, so it never needs to be re-entered - print it once,
// keep it, reuse the same QR codes for every future unit.

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/';

async function fetchQrPng(data, sizePx = 300) {
  const url = `${QR_API}?size=${sizePx}x${sizePx}&data=${encodeURIComponent(data)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('QR generation service failed');
  return res.arrayBuffer();
}

export async function GET() {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .eq('teacher_id', user.id)
      .order('display_name', { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!students || students.length === 0) {
      return Response.json({ error: 'No students yet - add some first.' }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.create();
    for (const student of students) {
      const page = pdfDoc.addPage([612, 792]);
      const { width, height } = page.getSize();

      page.drawText(student.display_name, { x: 40, y: height - 80, size: 24 });
      page.drawText(`QR Code: ${student.qr_code}`, { x: 40, y: height - 110, size: 11 });

      const qrPng = await fetchQrPng(student.qr_code);
      const qrImage = await pdfDoc.embedPng(qrPng);
      const qrSize = 250;
      page.drawImage(qrImage, { x: (width - qrSize) / 2, y: height / 2 - qrSize / 2, width: qrSize, height: qrSize });

      page.drawText('Keep this page - the QR code stays the same for all future units.', {
        x: 40, y: 60, size: 10,
      });
    }

    const outBytes = await pdfDoc.save();
    return new Response(outBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="roster-qr-codes.pdf"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

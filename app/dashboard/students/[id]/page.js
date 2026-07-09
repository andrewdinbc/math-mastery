'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function StudentDetailPage() {
  const { id } = useParams();
  const supabase = createClientComponentClient();
  const [student, setStudent] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('students').select('*').eq('id', id).single();
      const { data: a } = await supabase.from('attempts').select('*, micro_units(title)').eq('student_id', id).order('created_at', { ascending: false });
      const { data: t } = await supabase.from('student_mastery_thresholds').select('*, micro_units(title)').eq('student_id', id);
      setStudent(s);
      setAttempts(a || []);
      setThresholds(t || []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <main style={{ padding: 32 }}>Loading…</main>;
  if (!student) return <main style={{ padding: 32 }}>Student not found.</main>;

  return (
    <main style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <h1>{student.display_name}</h1>
      <p style={{ color: '#666' }}>QR code: {student.qr_code}</p>

      <h2>Custom Mastery Thresholds</h2>
      {thresholds.length === 0 ? (
        <p style={{ color: '#888', fontStyle: 'italic' }}>Using each micro-unit's default threshold — no overrides set.</p>
      ) : (
        <ul>
          {thresholds.map((t) => (
            <li key={t.id}>{t.micro_units?.title}: {t.mastery_pct}%</li>
          ))}
        </ul>
      )}

      <h2>Attempt History</h2>
      {attempts.length === 0 ? (
        <p style={{ color: '#888', fontStyle: 'italic' }}>No attempts yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: 8 }}>Unit</th>
              <th style={{ padding: 8 }}>Score</th>
              <th style={{ padding: 8 }}>Passed</th>
              <th style={{ padding: 8 }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{a.micro_units?.title || '—'}</td>
                <td style={{ padding: 8 }}>{a.score_pct != null ? `${a.score_pct}%` : '—'}</td>
                <td style={{ padding: 8 }}>{a.passed_threshold === null ? '—' : a.passed_threshold ? '✓' : '✗'}</td>
                <td style={{ padding: 8 }}>{new Date(a.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function MicroUnitDetailPage() {
  const { id } = useParams();
  const supabase = createClientComponentClient();
  const [unit, setUnit] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [mode, setMode] = useState('online');
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [students, setStudents] = useState([]);
  const [showAllVersions, setShowAllVersions] = useState({}); // studentId -> bool

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.from('micro_units').select('*').eq('id', id).single();
      const { data: a } = await supabase.from('attempts').select('*, students(qr_code)').eq('micro_unit_id', id).order('created_at', { ascending: false });
      const { data: s } = u ? await supabase.from('students').select('*').eq('teacher_id', u.teacher_id) : { data: [] };
      setUnit(u);
      setAttempts(a || []);
      setStudents(s || []);
      setLoading(false);
    })();
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch('/api/generate-worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ microUnitId: id, mode, shuffleOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGenResult(data);
    } catch (err) {
      setGenResult({ error: err.message });
    }
    setGenerating(false);
  }

  // Example-values preview - fills placeholders with a representative
  // mid-range value so the teacher can see the actual format, like the
  // CommonCoreSheets preview pane.
  function resolveExample(prompt, ranges) {
    let out = prompt;
    if (ranges) {
      for (const [key, range] of Object.entries(ranges)) {
        const mid = Math.round((range.min + range.max) / 2);
        out = out.replaceAll(`{${key}}`, mid);
      }
    }
    return out;
  }

  if (loading) return <main style={{ padding: 32 }}>Loading…</main>;
  if (!unit) return <main style={{ padding: 32 }}>Unit not found.</main>;

  const questions = unit.question_template?.questions || [];
  const ranges = unit.question_template?.randomizable_ranges;

  return (
    <main style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <h1>{unit.title}</h1>
      <p style={{ color: '#666' }}>Grade {unit.grade} • {unit.strand} • {unit.question_count} questions • {unit.default_mastery_pct}% mastery{unit.randomizable && ' • Randomizable'}</p>

      <h2>Example Worksheet</h2>
      <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 10, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #222', paddingBottom: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{unit.title}</div>
          <div style={{ fontSize: 13 }}>Name: ___________________</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', fontSize: 14 }}>
          {questions.map((q, i) => (
            <div key={i}>
              <strong>{i + 1})</strong> {resolveExample(q.prompt, ranges)}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 16, borderTop: '1px solid #eee', paddingTop: 8 }}>
          Example values shown{unit.randomizable ? ' — each student\'s copy uses different random numbers, same structure.' : '.'}
        </div>
      </div>

      <h2>Generate Worksheets</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: 8 }}>
            <option value="online">Online, link only</option>
            <option value="printed">Printed (Name prefilled and QR)</option>
            <option value="blank">Blank (QR prefilled, student writes name)</option>
          </select>
          <button onClick={handleGenerate} disabled={generating} style={{ padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6 }}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {mode !== 'online' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>Random question order</span>
            <span
              onClick={() => setShuffleOrder((v) => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, background: shuffleOrder ? '#1a7a3e' : '#ccc',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s', display: 'inline-block',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: shuffleOrder ? 18 : 2, width: 16, height: 16,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </span>
          </label>
        )}
        {mode !== 'online' && (
          <div style={{ fontSize: 12, color: '#888' }}>Generates {10} different versions per student.</div>
        )}
      </div>

      {genResult?.error && <div style={{ color: '#c00' }}>{genResult.error}</div>}
      {genResult?.exemplarNote && <div style={{ color: '#b57c2a', background: '#fff8ee', border: '1px solid #ddd4c2', borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 13 }}>ℹ️ {genResult.exemplarNote}</div>}

      {genResult?.links && (
        <ul>
          {genResult.links.map((l) => <li key={l.studentId}><a href={l.url} target="_blank" rel="noreferrer">{l.studentId === 'exemplar' ? 'Example' : l.studentId}</a></li>)}
        </ul>
      )}

      {genResult?.worksheets && (
        <div>
          <div style={{ color: '#1a7a3e', marginBottom: 8 }}>
            ✓ Generated {genResult.worksheets.length} student(s) × {genResult.versionsPerStudent} version(s) each:
          </div>
          {genResult.worksheets.map((w) => {
            const matched = students.find((s) => s.id === w.studentId);
            const label = w.studentId === 'exemplar' ? 'Example Student (exemplar)' : matched?.qr_code || w.studentId;
            const expanded = showAllVersions[w.studentId];
            const versionsToShow = expanded ? w.versions : w.versions.slice(0, 1);
            return (
              <div key={w.studentId} style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <strong>{label}</strong>
                <ul style={{ marginTop: 6 }}>
                  {versionsToShow.map((v) => {
                    const dataUrl = `data:application/pdf;base64,${v.pdfBase64}`;
                    return (
                      <li key={v.versionNumber} style={{ marginBottom: 2 }}>
                        <a href={dataUrl} download={`${unit.title}-${label}-v${v.versionNumber}.pdf`}>
                          📄 Version {v.versionNumber} — Download PDF
                        </a>
                      </li>
                    );
                  })}
                </ul>
                {w.versions.length > 1 && (
                  <button
                    onClick={() => setShowAllVersions((prev) => ({ ...prev, [w.studentId]: !prev[w.studentId] }))}
                    style={{ background: 'none', border: 'none', color: '#1c3557', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                  >
                    {expanded ? 'Show fewer' : `Show all ${w.versions.length} versions`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2>Attempts</h2>
      {attempts.length === 0 ? (
        <p style={{ color: '#888', fontStyle: 'italic' }}>No attempts yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: 8 }}>Student</th><th style={{ padding: 8 }}>Score</th><th style={{ padding: 8 }}>Passed</th>
          </tr></thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{a.students?.qr_code || '—'}</td>
                <td style={{ padding: 8 }}>{a.score_pct != null ? `${a.score_pct}%` : '—'}</td>
                <td style={{ padding: 8 }}>{a.passed_threshold === null ? '—' : a.passed_threshold ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
